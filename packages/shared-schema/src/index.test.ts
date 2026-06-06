import { describe, expect, it } from "vitest";
import { ApplyTaskSchema, JobPostingSchema, MatchResultSchema, SearchPreferenceSchema } from "./index";

describe("shared schemas", () => {
  it("validates a Boss job posting", () => {
    const parsed = JobPostingSchema.parse({
      source: "boss",
      url: "https://www.zhipin.com/job_detail/abc.html",
      title: "机器人算法工程师",
      companyName: "示例科技",
      city: "上海",
      salaryText: "25-40K",
      experienceText: "3-5年",
      educationText: "本科",
      description: "负责机器人感知与控制算法开发",
      bossActiveText: "刚刚活跃",
      publishedText: "今日发布",
    });

    expect(parsed.source).toBe("boss");
    expect(parsed.city).toBe("上海");
  });

  it("requires a positive match threshold", () => {
    expect(() =>
      SearchPreferenceSchema.parse({
        targetCities: ["上海"],
        keywords: ["机器人"],
        salaryMinK: 20,
        salaryMaxK: 45,
        blockedCompanies: [],
        blockedIndustries: [],
        recencyDays: 7,
        requireActiveBoss: true,
        matchThreshold: 0,
        dailyLimit: 20,
        applyWindowStart: "09:30",
        applyWindowEnd: "18:30",
        intervalMinSeconds: 90,
        intervalMaxSeconds: 240,
      }),
    ).toThrow();
  });

  it("validates match result and apply task state", () => {
    const match = MatchResultSchema.parse({
      passedHardFilters: true,
      hardFilterReasons: [],
      score: 86,
      reasons: ["项目经历与岗位方向匹配"],
      risks: ["薪资上限未明确"],
      greeting: "您好，我有机器人项目经验，和该岗位方向较匹配，期待沟通。",
      shouldQueue: true,
    });

    const task = ApplyTaskSchema.parse({
      id: "task_1",
      jobUrl: "https://www.zhipin.com/job_detail/abc.html",
      status: "queued",
      match,
      greeting: match.greeting,
      createdAt: "2026-06-06T10:00:00.000Z",
      updatedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(task.status).toBe("queued");
  });
});
