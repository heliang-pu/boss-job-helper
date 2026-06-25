import { createRoot } from "react-dom/client";
import type { ResumeProfile, SearchPreference } from "@job-apply-assistant/shared-schema";
import { FloatingPanel } from "./FloatingPanel";
import { getNextPendingApplyTask, getPendingApplyTaskForUrl, executeAutoApply, clearPendingApplyTask } from "./autoApply";
import { BossAdapter } from "./bossAdapter";
import { matchJob } from "../shared/localApiClient";
import { loadAiConfig } from "../shared/aiConfigStorage";

export const FLOATING_PANEL_CONTAINER_ID = "job-apply-assistant-floating-panel";

const RESUME_KEY = "resumeProfile";
const PREF_KEY = "searchPreference";

/* ---------- detect page type ---------- */

function isJobDetailPage(): boolean {
  return /\/job_detail\//i.test(window.location.href);
}

/* ---------- mount ---------- */

export function mountFloatingPanel(doc: Document = document) {
  if (doc.getElementById(FLOATING_PANEL_CONTAINER_ID)) return;

  // 岗位详情页 → 尝试自动投递
  if (isJobDetailPage()) {
    triggerAutoApply();
    return;
  }

  // 列表页 → 渲染浮动面板
  const container = doc.createElement("div");
  container.id = FLOATING_PANEL_CONTAINER_ID;
  doc.body.appendChild(container);
  createRoot(container).render(<FloatingPanel />);
}

/* ---------- auto apply logic ---------- */

async function triggerAutoApply() {
  showResultBar({ success: true, detail: "正在读取投递任务" }, 0);
  const task = await waitForPendingApplyTask();
  if (!task) {
    showResultBar({ success: false, detail: "未读取到投递任务，请回列表页重新点一键投递" }, 8000);
    return;
  }

  // Expire tasks older than 30 minutes
  if (Date.now() - task.createdAt > 30 * 60 * 1000) {
    await clearPendingApplyTask(task.jobUrl);
    showResultBar({ success: false, detail: "投递任务已过期，请回列表页重新扫描" }, 8000);
    return;
  }

  showResultBar({ success: true, detail: "正在根据详情页 JD 生成招呼语" }, 0);
  const taskWithFreshGreeting = await refreshGreetingFromDetailJob(task);
  showResultBar({ success: true, detail: "正在点击立即沟通并发送招呼语" }, 0);
  const result = await executeAutoApply(taskWithFreshGreeting);

  // Show result bar
  showResultBar(result, 4000);
  if (!result.success) return;

  const nextTask = await getNextPendingApplyTask(task.jobUrl);
  await clearPendingApplyTask(task.jobUrl);
  if (nextTask) {
    setTimeout(() => {
      window.location.href = nextTask.jobUrl;
    }, result.success ? 1200 : 2500);
  }
}

async function refreshGreetingFromDetailJob(task: Awaited<ReturnType<typeof getPendingApplyTaskForUrl>>) {
  if (!task?.job) return task!;
  try {
    const [aiConfig, storage] = await Promise.all([
      loadAiConfig(),
      chrome.storage.local.get([RESUME_KEY, PREF_KEY]),
    ]);
    const resume = storage[RESUME_KEY] as ResumeProfile | undefined;
    const preference = storage[PREF_KEY] as SearchPreference | undefined;
    if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.model || !resume?.id || !preference) return task;

    const detailJob = new BossAdapter(document).extractDetailJob(task.job);
    if (!detailJob) return task;

    const result = await matchJob({
      job: detailJob,
      resume,
      preference,
      aiConfig: {
        baseUrl: String(aiConfig.baseUrl),
        apiKey: String(aiConfig.apiKey),
        model: String(aiConfig.model),
        timeoutSeconds: Number(aiConfig.timeoutSeconds) || 30,
      },
    });
    // Only adopt the freshly generated greeting if the detail-page re-match still passes the
    // hard filters (e.g. city). Otherwise keep the greeting that already passed on the list page,
    // so we never send the "未通过硬性筛选" placeholder.
    const freshGreeting = result.shouldQueue && result.greeting ? result.greeting : task.greeting;
    return {
      ...task,
      job: detailJob,
      greeting: freshGreeting,
      companyName: detailJob.companyName,
      title: detailJob.title,
    };
  } catch {
    return task;
  }
}

async function waitForPendingApplyTask() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const task = await getPendingApplyTaskForUrl(window.location.href);
    if (task) return task;
    await sleep(250);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showResultBar(result: { success: boolean; detail: string }, autoHideMs = 4000) {
  const existingBar = document.getElementById("job-apply-assistant-status-bar");
  const bar = existingBar ?? document.createElement("div");
  bar.id = "job-apply-assistant-status-bar";
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    padding: 10px 16px; text-align: center; font-size: 14px; font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    color: #fff;
    background: ${result.success ? "#059669" : "#dc2626"};
    transition: opacity 0.3s;
  `;
  bar.textContent = result.success ? `✅ ${result.detail}` : `❌ ${result.detail}`;
  if (!existingBar) document.body.prepend(bar);

  if (autoHideMs > 0) {
    setTimeout(() => {
      bar.style.opacity = "0";
      setTimeout(() => bar.remove(), 300);
    }, autoHideMs);
  }
}

/* ---------- init ---------- */

mountFloatingPanel();
