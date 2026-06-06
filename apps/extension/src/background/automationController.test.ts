import type { JobPosting } from "@job-apply-assistant/shared-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationController } from "./automationController";

type OnInstalledListener = Parameters<typeof chrome.runtime.onInstalled.addListener>[0];

describe("AutomationController", () => {
  it("pauses when the adapter detects a blocking condition", async () => {
    const extractJobs = vi.fn(() => []);
    const matchJob = vi.fn();
    const controller = new AutomationController({
      extractJobs,
      detectBlockingCondition: () => "遇到验证码或人机验证",
      matchJob,
    });

    const state = await controller.scanAndMatch();

    expect(state.status).toBe("paused");
    expect(state.pauseReason).toBe("遇到验证码或人机验证");
    expect(state.matchedCount).toBe(0);
    expect(extractJobs).not.toHaveBeenCalled();
    expect(matchJob).not.toHaveBeenCalled();
  });

  it("awaits and matches extracted jobs in order when page is usable", async () => {
    const firstJob: JobPosting = {
      source: "boss",
      url: "https://www.zhipin.com/job_detail/1.html",
      title: "机器人软件工程师",
      companyName: "示例科技",
      city: "上海",
      salaryText: "25-40K",
      description: "ROS Python",
    };
    const secondJob: JobPosting = {
      source: "boss",
      url: "https://www.zhipin.com/job_detail/2.html",
      title: "机器人算法工程师",
      companyName: "样例智能",
      city: "上海",
      salaryText: "30-45K",
      description: "SLAM C++",
    };
    let resolveFirstMatch: () => void;
    const firstMatch = new Promise<void>((resolve) => {
      resolveFirstMatch = resolve;
    });
    const matchJob = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstMatch;
      })
      .mockResolvedValueOnce({ shouldQueue: true, score: 90 });
    const controller = new AutomationController({
      extractJobs: () => [firstJob, secondJob],
      detectBlockingCondition: () => null,
      matchJob,
    });

    const scanPromise = controller.scanAndMatch();
    let scanFinished = false;
    scanPromise.then(() => {
      scanFinished = true;
    });
    await Promise.resolve();

    expect(matchJob).toHaveBeenCalledTimes(1);
    expect(matchJob).toHaveBeenNthCalledWith(1, firstJob);
    expect(scanFinished).toBe(false);

    resolveFirstMatch!();
    const state = await scanPromise;

    expect(state.status).toBe("idle");
    expect(state.matchedCount).toBe(2);
    expect(scanFinished).toBe(true);
    expect(matchJob).toHaveBeenCalledTimes(2);
    expect(matchJob).toHaveBeenNthCalledWith(2, secondJob);
  });
});

describe("background main", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("initializes runtime state only on fresh install", async () => {
    const listeners: OnInstalledListener[] = [];
    const addListener = vi.fn((listener: OnInstalledListener) => {
      listeners.push(listener);
    });
    const set = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        onInstalled: {
          addListener,
        },
      },
      storage: {
        local: {
          set,
        },
      },
    });

    await import("./main");

    expect(addListener).toHaveBeenCalledTimes(1);
    listeners[0]?.({ reason: "update" } as chrome.runtime.InstalledDetails);
    expect(set).not.toHaveBeenCalled();

    listeners[0]?.({ reason: "install" } as chrome.runtime.InstalledDetails);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      runtimeState: {
        status: "idle",
        serviceConnected: false,
        todayAppliedCount: 0,
      },
    });
  });
});
