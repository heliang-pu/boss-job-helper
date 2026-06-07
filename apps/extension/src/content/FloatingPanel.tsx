import { useCallback, useState } from "react";
import type { JobPosting, MatchResult, ResumeProfile, SearchPreference } from "@job-apply-assistant/shared-schema";
import { BossAdapter } from "./bossAdapter";
import { matchJob as matchViaSW } from "../shared/localApiClient";
import { setPendingApplyTask, setPendingApplyTasks, type ApplyTask } from "./autoApply";

/* ---------- storage keys ---------- */

const AI_CONFIG_KEY = "aiConfig";
const RESUME_KEY = "resumeProfile";
const PREF_KEY = "searchPreference";

/* ---------- defaults ---------- */

const DEFAULT_PREFERENCE: SearchPreference = {
  targetCities: ["上海"],
  keywords: ["机器人", "ROS", "Python", "具身智能", "机械臂"],
  salaryMinK: 15,
  salaryMaxK: 50,
  blockedCompanies: [],
  blockedIndustries: [],
  recencyDays: 7,
  requireActiveBoss: false,
  matchThreshold: 60,
  dailyLimit: 10,
  applyWindowStart: "08:00",
  applyWindowEnd: "22:00",
  intervalMinSeconds: 30,
  intervalMaxSeconds: 120,
};

/* ---------- types ---------- */

interface JobMatch {
  job: JobPosting;
  result: MatchResult | null;
  error?: string;
}

type PanelStatus = "idle" | "scanning" | "done" | "error";

/* ---------- component ---------- */

function formatPanelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Extension context invalidated")) {
    return "扩展刚刚更新，请刷新当前 Boss 页面后再扫描";
  }
  return message;
}

function debugPage(): string {
  const lines: string[] = [];
  lines.push(`URL: ${window.location.href}`);
  lines.push(`Title: ${document.title}`);
  lines.push("");

  // check known selectors
  const selectors = [
    ".job-card-wrapper", ".job-card-box", ".job-card-wrap",
    "a[href*='/job_detail/']",
    "[class*='job-card']", "[class*='job-list']", "[class*='card']",
    ".search-job-result", ".job-list-box",
  ];
  for (const sel of selectors) {
    const count = document.querySelectorAll(sel).length;
    if (count > 0 || sel.includes("job") || sel.includes("detail")) {
      lines.push(`${sel}: ${count} 个`);
    }
  }

  // list top-level containers
  const bodyText = (document.body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  lines.push("");
  lines.push(`Body (first 300 chars): ${bodyText}`);

  return lines.join("\n");
}

export function FloatingPanel() {
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [appliedUrls, setAppliedUrls] = useState<Set<string>>(new Set());
  const [applyNotice, setApplyNotice] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setStatus("scanning");
    setError(null);
    setMatches([]);
    setProgress({ current: 0, total: 0 });

    try {
      // Load config from storage
      const storage = await chrome.storage.local.get([AI_CONFIG_KEY, RESUME_KEY, PREF_KEY]);
      const aiConfig = storage[AI_CONFIG_KEY] as Record<string, unknown> | undefined;
      const resume = storage[RESUME_KEY] as ResumeProfile | undefined;
      const preference: SearchPreference = (storage[PREF_KEY] as SearchPreference | undefined) ?? DEFAULT_PREFERENCE;

      if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.model) {
        setError("请先在扩展弹窗中配置 AI（baseUrl / apiKey / model）");
        setStatus("error");
        return;
      }
      if (!resume?.id) {
        setError("请先在扩展弹窗中上传简历");
        setStatus("error");
        return;
      }

      // Extract jobs from page
      const adapter = new BossAdapter(document);
      const blocking = adapter.detectBlockingCondition();
      if (blocking) {
        setError(`扫描暂停：${blocking}`);
        setStatus("error");
        return;
      }

      const jobs = adapter.extractListJobs();
      if (jobs.length === 0) {
        setError("当前页面未检测到岗位卡片，请确认在 Boss 直聘搜索页");
        setStatus("error");
        return;
      }

      setProgress({ current: 0, total: jobs.length });

      // Match each job via service worker proxy
      const results: JobMatch[] = [];
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        try {
          const result = await matchViaSW({
            job,
            resume,
            preference,
            aiConfig: {
              baseUrl: String(aiConfig.baseUrl),
              apiKey: String(aiConfig.apiKey),
              model: String(aiConfig.model),
              timeoutSeconds: Number(aiConfig.timeoutSeconds) || 30,
            },
          });
          results.push({ job, result: result as unknown as MatchResult });
        } catch (err) {
          results.push({ job, result: null, error: err instanceof Error ? err.message : String(err) });
        }
        setProgress({ current: i + 1, total: jobs.length });
        setMatches([...results]);
      }

      setStatus("done");
    } catch (err) {
      setError(formatPanelError(err));
      setStatus("error");
    }
  }, []);

  // --- apply a single job ---
  const handleApplyJob = useCallback(async (m: JobMatch) => {
    if (!m.result?.greeting) return;
    setApplyNotice(null);

    try {
      await setPendingApplyTask({
        jobUrl: m.job.url,
        job: m.job,
        greeting: m.result.greeting,
        companyName: m.job.companyName,
        title: m.job.title,
        createdAt: Date.now(),
      });
      const openedWindow = window.open(m.job.url, "_blank");
      if (!openedWindow) {
        setApplyNotice("浏览器拦截了新标签，请允许弹窗后再点投递");
        return;
      }
      setAppliedUrls((prev) => new Set(prev).add(m.job.url));
      setApplyNotice(`已打开 ${m.job.title}，正在尝试自动沟通`);
    } catch (err) {
      setApplyNotice(formatPanelError(err));
    }
  }, []);

  // --- apply all queued ---
  const handleApplyAll = useCallback(async () => {
    const queued = matches.filter((m) => m.result?.shouldQueue && m.result?.greeting && !appliedUrls.has(m.job.url));
    if (queued.length === 0) return;
    setApplyNotice(null);

    const now = Date.now();
    const tasks: ApplyTask[] = [];
    for (const m of queued) {
      tasks.push({
        jobUrl: m.job.url,
        job: m.job,
        greeting: m.result!.greeting,
        companyName: m.job.companyName,
        title: m.job.title,
        createdAt: now,
      });
    }

    try {
      await setPendingApplyTasks(tasks);
      const openedWindow = window.open(tasks[0].jobUrl, "_blank");
      if (!openedWindow) {
        setApplyNotice("浏览器拦截了新标签，请允许 zhipin.com 弹窗后再点投递");
        return;
      }
      setAppliedUrls((prev) => {
        const next = new Set(prev);
        for (const task of tasks) next.add(task.jobUrl);
        return next;
      });
      setApplyNotice(`已建立 ${tasks.length} 个岗位投递队列，正在逐个自动沟通`);
    } catch (err) {
      setApplyNotice(formatPanelError(err));
    }
  }, [matches, appliedUrls]);

  const queuedCount = matches.filter((m) => m.result?.shouldQueue).length;
  const filteredCount = matches.filter((m) => m.result && !m.result.shouldQueue).length;
  const errorCount = matches.filter((m) => m.error).length;
  const isScanning = status === "scanning";

  return (
    <aside
      style={{
        position: "fixed", right: 16, top: 96, zIndex: 2147483647,
        width: 340, maxHeight: "calc(100vh - 120px)", overflowY: "auto",
        boxSizing: "border-box", padding: 16,
        background: "#ffffff", color: "#111827",
        border: "1px solid #d1d5db", borderRadius: 8,
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 13,
      }}
    >
      <strong style={{ display: "block", marginBottom: 8, fontSize: 16 }}>Boss 求职助手</strong>

      <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
        {status === "idle" && <span style={{ color: "#6b7280" }}>就绪，点击扫描当前页岗位</span>}
        {isScanning && <span style={{ color: "#0891b2" }}>正在匹配 {progress.current}/{progress.total}…</span>}
        {status === "done" && (
          <span style={{ color: "#059669" }}>
            完成：{matches.length} 个岗位，{queuedCount} 可投递，{filteredCount} 已过滤{errorCount > 0 ? `，${errorCount} 失败` : ""}
          </span>
        )}
        {status === "error" && <span style={{ color: "#dc2626" }}>{error}</span>}
      </div>
      {applyNotice && <div style={{ marginBottom: 8, color: "#059669", lineHeight: 1.5 }}>{applyNotice}</div>}

      {isScanning && progress.total > 0 && (
        <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "#0891b2", borderRadius: 2, width: `${(progress.current / progress.total) * 100}%`, transition: "width 0.3s" }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          disabled={isScanning}
          onClick={handleScan}
          style={{
            minHeight: 34, flex: "1 1 0",
            border: "1px solid #0891b2", borderRadius: 6,
            background: isScanning ? "#e5e7eb" : "#0891b2",
            color: isScanning ? "#6b7280" : "#ffffff",
            cursor: isScanning ? "wait" : "pointer",
            fontSize: 14, fontWeight: 600,
          }}
        >
          {isScanning ? "扫描中…" : status === "done" ? "重新扫描" : "开始扫描"}
        </button>
        <button
          type="button"
          onClick={() => {
            const info = debugPage();
            setError(info);
            setStatus("error");
          }}
          style={{
            minHeight: 34, flex: "0 0 auto", padding: "0 8px",
            border: "1px solid #d1d5db", borderRadius: 6,
            background: "#f9fafb", color: "#6b7280",
            cursor: "pointer", fontSize: 12,
          }}
        >
          🔍 调试
        </button>
        {queuedCount > 0 && (
          <button
            type="button"
            onClick={handleApplyAll}
            disabled={queuedCount === 0 || appliedUrls.size >= queuedCount}
            style={{
              minHeight: 34, flex: "0 0 auto", padding: "0 12px",
              border: "1px solid #059669", borderRadius: 6,
              background: appliedUrls.size >= queuedCount ? "#e5e7eb" : "#059669",
              color: appliedUrls.size >= queuedCount ? "#6b7280" : "#fff",
              cursor: appliedUrls.size >= queuedCount ? "default" : "pointer",
              fontSize: 13, fontWeight: 600,
            }}
          >
            一键投递（{queuedCount}）
          </button>
        )}
      </div>

      {matches.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: "#6b7280" }}>匹配结果（{matches.length} 条）</div>
          {matches.map((m, i) => (
            <div key={i} style={{
              padding: "8px 10px", marginBottom: 6, borderRadius: 5,
              border: "1px solid #e5e7eb",
              background: m.result?.shouldQueue ? "#f0fdf4" : m.error ? "#fef2f2" : "#f9fafb",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                {m.job.title}
                {m.result && (
                  <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: m.result.score >= 70 ? "#059669" : m.result.score >= 50 ? "#d97706" : "#dc2626" }}>
                    {m.result.score}分
                  </span>
                )}
                {m.error && <span style={{ marginLeft: 6, fontSize: 11, color: "#dc2626" }}>请求失败</span>}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                {m.job.companyName} · {m.job.city} · {m.job.salaryText}
              </div>
              {m.result?.shouldQueue && <div style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✅ 已加入投递队列</div>}
              {m.result && !m.result.shouldQueue && (
                <div style={{ fontSize: 11, color: "#9ca3af" }}>未加入投递队列</div>
              )}
              {m.result?.greeting && m.result.shouldQueue && (
                <div style={{ fontSize: 11, color: "#374151", marginTop: 3, fontStyle: "italic" }}>💬 {m.result.greeting}</div>
              )}
              {m.result?.shouldQueue && (
                <button
                  type="button"
                  disabled={appliedUrls.has(m.job.url)}
                  onClick={() => handleApplyJob(m)}
                  style={{
                    marginTop: 6, minHeight: 26, padding: "2px 10px",
                    border: "1px solid #059669", borderRadius: 4,
                    background: appliedUrls.has(m.job.url) ? "#e5e7eb" : "#059669",
                    color: appliedUrls.has(m.job.url) ? "#6b7280" : "#fff",
                    cursor: appliedUrls.has(m.job.url) ? "default" : "pointer",
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {appliedUrls.has(m.job.url) ? "已发送 ✅" : "立即投递 →"}
                </button>
              )}
              {m.result?.risks && (m.result.risks as unknown as string[]).length > 0 && (
                <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>⚠️ {(m.result.risks as unknown as string[]).join("；")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
