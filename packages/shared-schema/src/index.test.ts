import { describe, expect, it } from "vitest";
import {
  ApplyTaskSchema,
  JobPostingSchema,
  MatchResultSchema,
  ResumeProfileSchema,
  SearchPreferenceSchema,
} from "./index";

const bossJobPosting = {
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
} as const;

describe("shared schemas", () => {
  it("validates a Boss job posting", () => {
    const parsed = JobPostingSchema.parse(bossJobPosting);

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

  it("rejects invalid search preference ranges and apply windows", () => {
    const validPreference = {
      targetCities: ["上海"],
      keywords: ["机器人"],
      salaryMinK: 20,
      salaryMaxK: 45,
      blockedCompanies: [],
      blockedIndustries: [],
      recencyDays: 7,
      requireActiveBoss: true,
      matchThreshold: 80,
      dailyLimit: 20,
      applyWindowStart: "09:30",
      applyWindowEnd: "18:30",
      intervalMinSeconds: 90,
      intervalMaxSeconds: 240,
    };

    expect(() =>
      SearchPreferenceSchema.parse({
        ...validPreference,
        salaryMinK: 50,
      }),
    ).toThrow("salaryMinK must be <= salaryMaxK");

    expect(() =>
      SearchPreferenceSchema.parse({
        ...validPreference,
        applyWindowStart: "24:00",
      }),
    ).toThrow();
  });

  it("validates a resume profile", () => {
    const profile = ResumeProfileSchema.parse({
      id: "resume_1",
      fileName: "resume.pdf",
      rawText: "机器人算法工程师，负责感知与控制项目。",
      summary: "机器人算法背景，具备项目落地经验。",
      skills: ["TypeScript", "Python", "机器人控制"],
      yearsOfExperience: 4,
      projectHighlights: ["移动机器人路径规划", "机械臂控制"],
      education: ["本科"],
      targetRoleSuggestions: ["机器人算法工程师"],
    });

    expect(profile.id).toBe("resume_1");
    expect(profile.yearsOfExperience).toBe(4);
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
      job: bossJobPosting,
      status: "queued",
      match,
      greeting: match.greeting,
      createdAt: "2026-06-06T10:00:00.000Z",
      updatedAt: "2026-06-06T10:00:00.000Z",
    });

    expect(task.status).toBe("queued");
    expect(task.job.url).toBe("https://www.zhipin.com/job_detail/abc.html");
  });
});
