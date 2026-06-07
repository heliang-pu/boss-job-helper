import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingApplyTask,
  executeAutoApply,
  getNextPendingApplyTask,
  getPendingApplyTaskForUrl,
  setPendingApplyTasks,
} from "./autoApply";

describe("autoApply task storage", () => {
  const stored: Record<string, unknown> = {};

  beforeEach(() => {
    for (const key of Object.keys(stored)) delete stored[key];
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn().mockImplementation(async (keys: string | string[]) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, stored[key]]));
          }),
          set: vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
            Object.assign(stored, values);
          }),
          remove: vi.fn().mockImplementation(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
          }),
        },
        local: {
          get: vi.fn().mockImplementation(async (keys: string | string[]) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, stored[key]]));
          }),
          set: vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
            Object.assign(stored, values);
          }),
          remove: vi.fn().mockImplementation(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores multiple tasks and consumes only the one matching the current job URL", async () => {
    await setPendingApplyTasks([
      {
        jobUrl: "https://www.zhipin.com/job_detail/one.html",
        greeting: "您好 one",
        companyName: "公司一",
        title: "岗位一",
        createdAt: Date.now(),
      },
      {
        jobUrl: "https://www.zhipin.com/job_detail/two.html",
        greeting: "您好 two",
        companyName: "公司二",
        title: "岗位二",
        createdAt: Date.now(),
      },
    ]);

    const task = await getPendingApplyTaskForUrl("https://www.zhipin.com/job_detail/two.html?lid=abc");
    expect(task?.companyName).toBe("公司二");

    await clearPendingApplyTask(task!.jobUrl);

    expect(await getPendingApplyTaskForUrl("https://www.zhipin.com/job_detail/two.html")).toBeNull();
    expect(await getPendingApplyTaskForUrl("https://www.zhipin.com/job_detail/one.html")).toMatchObject({
      companyName: "公司一",
    });
  });

  it("returns the next pending task after the current job", async () => {
    await setPendingApplyTasks([
      {
        jobUrl: "https://www.zhipin.com/job_detail/one.html",
        greeting: "您好 one",
        companyName: "公司一",
        title: "岗位一",
        createdAt: Date.now(),
      },
      {
        jobUrl: "https://www.zhipin.com/job_detail/two.html",
        greeting: "您好 two",
        companyName: "公司二",
        title: "岗位二",
        createdAt: Date.now(),
      },
    ]);

    expect(await getNextPendingApplyTask("https://www.zhipin.com/job_detail/one.html")).toMatchObject({
      companyName: "公司二",
    });
  });

  it("falls back to storage.local when storage.session is blocked in a content script", async () => {
    const localStored: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn().mockRejectedValue(new Error("Access to storage is not allowed from this context.")),
          set: vi.fn().mockRejectedValue(new Error("Access to storage is not allowed from this context.")),
          remove: vi.fn().mockRejectedValue(new Error("Access to storage is not allowed from this context.")),
        },
        local: {
          get: vi.fn().mockImplementation(async (keys: string | string[]) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(requested.map((key) => [key, localStored[key]]));
          }),
          set: vi.fn().mockImplementation(async (values: Record<string, unknown>) => {
            Object.assign(localStored, values);
          }),
          remove: vi.fn().mockImplementation(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete localStored[key];
          }),
        },
      },
    });

    await setPendingApplyTasks([
      {
        jobUrl: "https://www.zhipin.com/job_detail/local-fallback.html",
        greeting: "您好 local",
        companyName: "本地存储公司",
        title: "岗位",
        createdAt: Date.now(),
      },
    ]);

    expect(await getPendingApplyTaskForUrl("https://www.zhipin.com/job_detail/local-fallback.html")).toMatchObject({
      companyName: "本地存储公司",
    });
  });
});

describe("executeAutoApply", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clicks a visible continue-chat button found by text", async () => {
    document.body.innerHTML = `
      <button class="brand-button">继续沟通</button>
      <div class="chat-input"><textarea></textarea><button class="send-btn">发送</button></div>
    `;
    const continueButton = document.querySelector(".brand-button") as HTMLButtonElement;
    const sendButton = document.querySelector(".send-btn") as HTMLButtonElement;
    const continueClick = vi.spyOn(continueButton, "click");
    const sendClick = vi.spyOn(sendButton, "click");

    const promise = executeAutoApply({
      jobUrl: "https://www.zhipin.com/job_detail/two.html",
      greeting: "您好，期待沟通。",
      companyName: "公司二",
      title: "岗位二",
      createdAt: Date.now(),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(continueClick).toHaveBeenCalledOnce();
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("您好，期待沟通。");
    expect(sendClick).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("fills a contenteditable chat box and clicks the send button", async () => {
    document.body.innerHTML = `
      <button class="brand-button">立即沟通</button>
      <div class="chat-input"><div contenteditable="true"></div><button class="send-action">发送</button></div>
    `;
    const editable = document.querySelector("[contenteditable='true']") as HTMLElement;
    const sendButton = document.querySelector(".send-action") as HTMLButtonElement;
    const sendClick = vi.spyOn(sendButton, "click");

    const promise = executeAutoApply({
      jobUrl: "https://www.zhipin.com/job_detail/contenteditable.html",
      greeting: "您好，我做过机器人项目，想和您沟通这个岗位。",
      companyName: "机器人公司",
      title: "机器人工程师",
      createdAt: Date.now(),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(editable.textContent).toBe("您好，我做过机器人项目，想和您沟通这个岗位。");
    expect(sendClick).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("fills the chat dialog input instead of a page header search input", async () => {
    document.body.innerHTML = `
      <input class="boss-search" type="text" placeholder="搜索职位、公司" />
      <button class="brand-button">继续沟通</button>
      <div class="dialog-container">
        <div class="message-list">已发送默认招呼语</div>
        <div class="reply-area"><textarea></textarea><button class="send-btn">发送</button></div>
      </div>
    `;
    const searchInput = document.querySelector(".boss-search") as HTMLInputElement;
    const chatInput = document.querySelector(".reply-area textarea") as HTMLTextAreaElement;
    const sendButton = document.querySelector(".send-btn") as HTMLButtonElement;
    const sendClick = vi.spyOn(sendButton, "click");

    const promise = executeAutoApply({
      jobUrl: "https://www.zhipin.com/job_detail/dialog.html",
      greeting: "您好，我结合岗位JD和自己的项目经验，想进一步沟通这个岗位。",
      companyName: "机器人公司",
      title: "机器人工程师",
      createdAt: Date.now(),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(searchInput.value).toBe("");
    expect(chatInput.value).toBe("您好，我结合岗位JD和自己的项目经验，想进一步沟通这个岗位。");
    expect(sendClick).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it("continues through the Boss default greeting confirmation dialog before sending the generated greeting", async () => {
    document.body.innerHTML = `
      <button class="brand-button">立即沟通</button>
    `;
    const startButton = document.querySelector(".brand-button") as HTMLButtonElement;
    startButton.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div class="dialog-container">
            <h3>已向BOSS发送消息</h3>
            <div class="default-greeting">您好，我对贵公司的职位很感兴趣，可以进一步沟通吗？</div>
            <button class="stay-button">留在此页</button>
            <button class="continue-button">继续沟通</button>
          </div>
        `,
      );
      const continueButton = document.querySelector(".continue-button") as HTMLButtonElement;
      continueButton.addEventListener("click", () => {
        document.querySelector(".dialog-container")?.remove();
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div class="chat-input"><textarea></textarea><button class="send-btn">发送</button></div>`,
        );
      });
    });

    const promise = executeAutoApply({
      jobUrl: "https://www.zhipin.com/job_detail/default-greeting-confirm.html",
      greeting: "您好，我有运营增长和内容项目经验，想结合这个岗位进一步沟通。",
      companyName: "洛阳启鸣文化传媒",
      title: "运营岗",
      createdAt: Date.now(),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(document.querySelector(".dialog-container")).toBeNull();
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "您好，我有运营增长和内容项目经验，想结合这个岗位进一步沟通。",
    );
    expect(result.success).toBe(true);
  });

  it("dispatches pointer and mouse events when pressing the send button", async () => {
    document.body.innerHTML = `
      <button class="brand-button">继续沟通</button>
      <div class="dialog-container">
        <div class="reply-area"><textarea></textarea><button class="send-btn">发送</button></div>
      </div>
    `;
    const sendButton = document.querySelector(".send-btn") as HTMLButtonElement;
    const events: string[] = [];
    for (const eventName of ["pointerdown", "mousedown", "mouseup", "click"]) {
      sendButton.addEventListener(eventName, () => events.push(eventName));
    }

    const promise = executeAutoApply({
      jobUrl: "https://www.zhipin.com/job_detail/send-events.html",
      greeting: "您好，我想进一步沟通这个岗位。",
      companyName: "机器人公司",
      title: "机器人工程师",
      createdAt: Date.now(),
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(events).toEqual(["pointerdown", "mousedown", "mouseup", "click"]);
    expect(result.success).toBe(true);
  });
});
