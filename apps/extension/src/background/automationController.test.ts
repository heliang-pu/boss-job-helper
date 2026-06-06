import { describe, expect, it, vi } from "vitest";
import { AutomationController } from "./automationController";

describe("AutomationController", () => {
  it("pauses when the adapter detects a blocking condition", async () => {
    const controller = new AutomationController({
      extractJobs: () => [],
      detectBlockingCondition: () => "遇到验证码或人机验证",
      matchJob: vi.fn(),
    });

    const state = await controller.scanAndMatch();

    expect(state.status).toBe("paused");
    expect(state.pauseReason).toBe("遇到验证码或人机验证");
  });

  it("matches extracted jobs when page is usable", async () => {
    const matchJob = vi.fn().mockResolvedValue({ shouldQueue: true, score: 90 });
    const controller = new AutomationController({
      extractJobs: () => [
        {
          source: "boss",
          url: "https://www.zhipin.com/job_detail/1.html",
          title: "机器人软件工程师",
          companyName: "示例科技",
          city: "上海",
          salaryText: "25-40K",
          description: "ROS Python",
        },
      ],
      detectBlockingCondition: () => null,
      matchJob,
    });

    const state = await controller.scanAndMatch();

    expect(state.status).toBe("idle");
    expect(state.matchedCount).toBe(1);
    expect(matchJob).toHaveBeenCalledTimes(1);
  });
});
