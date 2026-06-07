import type { JobPosting } from "@job-apply-assistant/shared-schema";

export interface ApplyTask {
  jobUrl: string;
  job?: JobPosting;
  greeting: string;
  companyName: string;
  title: string;
  createdAt: number;
}

const APPLY_TASK_KEY = "pendingApplyTask";
const APPLY_TASKS_KEY = "pendingApplyTasks";

export async function getPendingApplyTask(): Promise<ApplyTask | null> {
  const tasks = await getPendingApplyTasks();
  return tasks[0] ?? null;
}

export async function getNextPendingApplyTask(currentUrl: string): Promise<ApplyTask | null> {
  const normalizedCurrentUrl = normalizeJobUrl(currentUrl);
  const tasks = await getPendingApplyTasks();
  const currentIndex = tasks.findIndex((task) => normalizeJobUrl(task.jobUrl) === normalizedCurrentUrl);
  if (currentIndex < 0) return tasks[0] ?? null;
  return tasks[currentIndex + 1] ?? null;
}

export async function getPendingApplyTaskForUrl(currentUrl: string): Promise<ApplyTask | null> {
  const normalizedCurrentUrl = normalizeJobUrl(currentUrl);
  const tasks = await getPendingApplyTasks();
  return tasks.find((task) => normalizeJobUrl(task.jobUrl) === normalizedCurrentUrl) ?? null;
}

export async function getPendingApplyTasks(): Promise<ApplyTask[]> {
  try {
    const result = await getApplyStorageValues([APPLY_TASKS_KEY, APPLY_TASK_KEY]);
    const tasks = result[APPLY_TASKS_KEY] as ApplyTask[] | undefined;
    if (Array.isArray(tasks)) return tasks;
    const legacyTask = result[APPLY_TASK_KEY] as ApplyTask | undefined;
    return legacyTask ? [legacyTask] : [];
  } catch {
    return [];
  }
}

export async function setPendingApplyTask(task: ApplyTask): Promise<void> {
  await setPendingApplyTasks([task]);
}

export async function setPendingApplyTasks(tasks: ApplyTask[]): Promise<void> {
  if (tasks.length === 0) {
    await removeApplyStorageValues([APPLY_TASKS_KEY, APPLY_TASK_KEY]);
    return;
  }
  await setApplyStorageValues({ [APPLY_TASKS_KEY]: tasks, [APPLY_TASK_KEY]: tasks[0] });
}

export async function clearPendingApplyTask(jobUrl?: string): Promise<void> {
  if (!jobUrl) {
    await removeApplyStorageValues([APPLY_TASKS_KEY, APPLY_TASK_KEY]);
    return;
  }

  const normalizedJobUrl = normalizeJobUrl(jobUrl);
  const remainingTasks = (await getPendingApplyTasks()).filter(
    (task) => normalizeJobUrl(task.jobUrl) !== normalizedJobUrl,
  );
  await setPendingApplyTasks(remainingTasks);
}

/**
 * Execute the apply flow on a job detail page:
 * 1. Wait for "立即沟通" button
 * 2. Click it
 * 3. Wait for the chat input to appear
 * 4. Type greeting and send
 * 5. Report success / failure
 */
export async function executeAutoApply(task: ApplyTask): Promise<{ success: boolean; detail: string }> {
  // Step 1: Wait for the "立即沟通" button (max 10s)
  const chatButton = await waitForElement(
    () =>
      document.querySelector('.btn-startchat, .btn-chat, [class*="start-chat"], [class*="chat-btn"]') ??
      findClickableByText(["继续沟通", "立即沟通", "开聊", "沟通"]),
    10000,
  );
  if (!chatButton) {
    return { success: false, detail: "未找到「继续沟通/立即沟通」按钮，可能已投递过或页面未加载完成" };
  }

  // Step 2: Click
  (chatButton as HTMLElement).click();
  await sleep(1500);

  // Step 3: Wait for textarea / input in chat dialog (max 8s)
  const chatInput = await waitForChatInputAfterStartingConversation(10000);
  if (!chatInput) {
    return { success: false, detail: "点击后未出现对话框，请手动处理" };
  }

  // Step 4: Type greeting
  const inputEl = chatInput as HTMLElement;
  fillChatInput(inputEl, task.greeting);
  await sleep(500);

  // Step 5: Click send button
  const sendBtn = await waitForElement(
    () => findSendButton(inputEl),
    5000,
  );
  if (sendBtn) {
    pressSendButton(sendBtn as HTMLElement);
    await sleep(1000);
    if (getInputText(inputEl).trim()) {
      pressEnterToSend(inputEl);
      await sleep(500);
    }
    return { success: true, detail: `已发送打招呼语给 ${task.companyName} - ${task.title}` };
  }

  // Fallback: try pressing Enter
  pressEnterToSend(inputEl);
  await sleep(500);
  return { success: true, detail: `已尝试发送打招呼语（Enter 方式）` };
}

/* ---------- helpers ---------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getApplyStorageValues(keys: string[]): Promise<Record<string, unknown>> {
  try {
    return await chrome.storage.session.get(keys);
  } catch (error) {
    if (!isSessionStorageAccessError(error)) throw error;
    return chrome.storage.local.get(keys);
  }
}

async function setApplyStorageValues(values: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session.set(values);
  } catch (error) {
    if (!isSessionStorageAccessError(error)) throw error;
    await chrome.storage.local.set(values);
  }
}

async function removeApplyStorageValues(keys: string[]): Promise<void> {
  try {
    await chrome.storage.session.remove(keys);
  } catch (error) {
    if (!isSessionStorageAccessError(error)) throw error;
    await chrome.storage.local.remove(keys);
  }
}

function isSessionStorageAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Access to storage is not allowed from this context");
}

function waitForSelector(selector: string, timeoutMs: number): Promise<Element | null> {
  return waitForElement(() => document.querySelector(selector), timeoutMs);
}

function waitForElement(findElement: () => Element | null, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check immediately
    const existing = findElement();
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = findElement();
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

function findClickableByText(texts: string[]): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("button, a, [role='button'], .btn, [class*='btn']"),
  );
  return candidates.find((candidate) => {
    if (candidate.matches("button:disabled, [aria-disabled='true']")) return false;
    const text = (candidate.textContent ?? "").replace(/\s+/g, "");
    return texts.some((target) => text.includes(target));
  }) ?? null;
}

function findChatInput(): HTMLElement | null {
  const scopedInput = document.querySelector<HTMLElement>(
    [
      ".dialog-container .chat-input textarea",
      ".dialog-container .input-area textarea",
      ".dialog-container .reply-area textarea",
      ".dialog-container textarea",
      ".dialog-container [contenteditable='true']",
      "[class*='dialog'] [class*='input'] textarea",
      "[class*='dialog'] [class*='reply'] textarea",
      "[class*='chat'] [class*='input'] textarea",
      "[class*='chat'] [contenteditable='true']",
      "[class*='reply'] textarea",
      "[class*='reply'] [contenteditable='true']",
    ].join(", "),
  );
  if (scopedInput) return scopedInput;

  const visibleTextareas = Array.from(document.querySelectorAll<HTMLElement>("textarea, [contenteditable='true']"))
    .filter(isVisibleElement);
  if (visibleTextareas.length > 0) return visibleTextareas.at(-1) ?? null;

  return null;
}

function findSendButton(inputEl: HTMLElement): HTMLElement | null {
  const container = inputEl.closest(".dialog-container, [class*='dialog'], [class*='chat'], [class*='reply']");
  if (container) {
    const scopedButton =
      container.querySelector<HTMLElement>(".send-btn, [class*='send-btn'], button[class*='send']") ??
      findClickableByTextIn(container, ["发送"]);
    if (scopedButton) return scopedButton;
  }
  return findClickableByText(["发送"]);
}

async function continuePastDefaultGreetingDialog(): Promise<void> {
  const defaultGreetingDialog = findDefaultGreetingDialog();
  const continueButton = defaultGreetingDialog ? findClickableByTextIn(defaultGreetingDialog, ["继续沟通"]) : null;
  if (continueButton) {
    await pressTrustedOrSyntheticClick(continueButton as HTMLElement);
    await sleep(1200);
  }
}

async function waitForChatInputAfterStartingConversation(timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const input = findChatInput();
    if (input) return input;

    await continuePastDefaultGreetingDialog();
    await sleep(300);
  }
  return findChatInput();
}

function findDefaultGreetingDialog(): HTMLElement | null {
  const scopedDialogs = Array.from(
    document.querySelectorAll<HTMLElement>("[role='dialog'], .dialog-container, [class*='dialog'], [class*='modal']"),
  );
  const matchedScopedDialog = scopedDialogs.find(hasDefaultGreetingText);
  if (matchedScopedDialog) return matchedScopedDialog;

  const textNodes = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((element) => {
    if (!isVisibleElement(element)) return false;
    const ownText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .replace(/\s+/g, "");
    return ownText.includes("已向BOSS发送消息") || ownText.includes("修改打招呼内容");
  });
  for (const textNode of textNodes) {
    const container = findAncestorWithContinueButton(textNode);
    if (container) return container;
  }

  return null;
}

function hasDefaultGreetingText(element: HTMLElement): boolean {
  const text = (element.textContent ?? "").replace(/\s+/g, "");
  return text.includes("已向BOSS发送消息") || text.includes("修改打招呼内容");
}

function findAncestorWithContinueButton(element: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (findClickableByTextIn(current, ["继续沟通"])) return current;
    current = current.parentElement;
  }
  return null;
}

function findClickableByTextIn(root: ParentNode, texts: string[]): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, a, [role='button'], .btn, [class*='btn'], [class*='button'], [class*='action'], span, div",
    ),
  ).sort((a, b) => getNormalizedText(a).length - getNormalizedText(b).length);
  return candidates.find((candidate) => {
    if (candidate.matches("button:disabled, [aria-disabled='true']")) return false;
    if (!isVisibleElement(candidate)) return false;
    const text = getNormalizedText(candidate);
    return texts.some((target) => text === target || text.includes(target));
  }) ?? null;
}

function getNormalizedText(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, "");
}

function isVisibleElement(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function fillChatInput(inputEl: HTMLElement, greeting: string): void {
  inputEl.focus();
  if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
    setNativeInputValue(inputEl, greeting);
  } else if (inputEl.isContentEditable || inputEl.getAttribute("contenteditable") === "true") {
    inputEl.textContent = greeting;
  }

  inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: greeting }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = inputEl instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(inputEl, value);
  } else {
    inputEl.value = value;
  }
}

function pressSendButton(sendBtn: HTMLElement): void {
  sendBtn.focus();
  for (const eventName of ["pointerdown", "mousedown", "mouseup", "pointerup"]) {
    const event =
      eventName.startsWith("pointer")
        ? new Event(eventName, { bubbles: true, cancelable: true })
        : new MouseEvent(eventName, { bubbles: true, cancelable: true });
    sendBtn.dispatchEvent(event);
  }
  sendBtn.click();
}

async function pressTrustedOrSyntheticClick(element: HTMLElement): Promise<void> {
  if (await requestTrustedClick(element)) return;
  pressSendButton(element);
}

async function requestTrustedClick(element: HTMLElement): Promise<boolean> {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  try {
    const response = await runtime.sendMessage({
      type: "TRUSTED_CLICK",
      payload: {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      },
    });
    return Boolean((response as { ok?: boolean } | undefined)?.ok);
  } catch {
    return false;
  }
}

function pressEnterToSend(inputEl: HTMLElement): void {
  inputEl.focus();
  for (const init of [
    { key: "Enter", code: "Enter", keyCode: 13, which: 13 },
    { key: "Enter", code: "Enter", keyCode: 13, which: 13, ctrlKey: true },
  ]) {
    inputEl.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
    inputEl.dispatchEvent(new KeyboardEvent("keyup", { ...init, bubbles: true, cancelable: true }));
  }
}

function getInputText(inputEl: HTMLElement): string {
  if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) return inputEl.value;
  return inputEl.textContent ?? "";
}

function normalizeJobUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.split("?")[0].replace(/\/$/, "");
  }
}
