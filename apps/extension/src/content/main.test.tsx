import { beforeEach, describe, expect, it, vi } from "vitest";

const getPendingApplyTaskForUrl = vi.fn();
const getNextPendingApplyTask = vi.fn();
const executeAutoApply = vi.fn();
const clearPendingApplyTask = vi.fn();

vi.mock("./autoApply", () => ({
  getPendingApplyTaskForUrl,
  getNextPendingApplyTask,
  executeAutoApply,
  clearPendingApplyTask,
}));

vi.mock("./FloatingPanel", () => ({
  FloatingPanel: () => <div>Boss 求职助手</div>,
}));

vi.mock("../shared/localApiClient", () => ({
  matchJob: vi.fn(),
}));

const { FLOATING_PANEL_CONTAINER_ID, mountFloatingPanel } = await import("./main");

describe("content floating panel entry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    window.history.pushState({}, "", "/web/geek/jobs?query=运营");
  });

  it("does not create duplicate floating panel containers", () => {
    mountFloatingPanel(document);
    mountFloatingPanel(document);

    expect(document.querySelectorAll(`#${FLOATING_PANEL_CONTAINER_ID}`)).toHaveLength(1);
  });

  it("stays on the current job and keeps the task when auto apply is blocked", async () => {
    window.history.pushState({}, "", "/job_detail/current.html");
    const currentTask = {
      jobUrl: "https://www.zhipin.com/job_detail/current.html",
      greeting: "您好，想进一步沟通。",
      companyName: "当前公司",
      title: "当前岗位",
      createdAt: Date.now(),
    };
    getPendingApplyTaskForUrl.mockResolvedValue(currentTask);
    executeAutoApply.mockResolvedValue({ success: false, detail: "点击后未出现对话框，请手动处理" });

    mountFloatingPanel(document);
    await vi.waitFor(() => {
      expect(executeAutoApply).toHaveBeenCalledWith(currentTask);
    });

    expect(clearPendingApplyTask).not.toHaveBeenCalled();
    expect(getNextPendingApplyTask).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/job_detail/current.html");
  });
});
