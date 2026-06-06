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

const validSearchPreference = {
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

const matchResult = {
  passedHardFilters: true,
  hardFilterReasons: [],
  score: 86,
  reasons: ["项目经历与岗位方向匹配"],
  risks: ["薪资上限未明确"],
  greeting: "您好，我有机器人项目经验，和该岗位方向较匹配，期待沟通。",
  shouldQueue: true,
} as const;

describe("shared schemas", () => {
  it("validates a Boss job posting", () => {
    const parsed = JobPostingSchema.parse(bossJobPosting);

    expect(parsed.source).toBe("boss");
    expect(parsed.city).toBe("上海");
  });

  it.each(["ftp://www.zhipin.com/job_detail/abc.html", "mailto:hr@example.com"])(
    "rejects non-HTTP Boss job URLs",
    (url) => {
      expect(() =>
        JobPostingSchema.parse({
          ...bossJobPosting,
          url,
        }),
      ).toThrow();
    },
  );

  it.each(["https://evil.example/job_detail/abc.html", "http://www.zhipin.com/job_detail/abc.html"])(
    "rejects Boss job URLs outside the secure Boss domain: %s",
    (url) => {
      expect(() =>
        JobPostingSchema.parse({
          ...bossJobPosting,
          url,
        }),
      ).toThrow();
    },
  );

  it.each(["url", "title", "companyName", "city", "salaryText", "description"] as const)(
    "rejects whitespace-only job posting field %s",
    (field) => {
      expect(() =>
        JobPostingSchema.parse({
          ...bossJobPosting,
          [field]: "  ",
        }),
      ).toThrow();
    },
  );

  it("rejects whitespace-only optional job posting strings when present", () => {
    expect(() =>
      JobPostingSchema.parse({
        ...bossJobPosting,
        experienceText: "  ",
      }),
    ).toThrow();
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
    expect(() =>
      SearchPreferenceSchema.parse({
        ...validSearchPreference,
        salaryMinK: 50,
      }),
    ).toThrow("salaryMinK must be <= salaryMaxK");

    expect(() =>
      SearchPreferenceSchema.parse({
        ...validSearchPreference,
        applyWindowStart: "24:00",
      }),
    ).toThrow();
  });

  it("rejects inverted same-day apply windows", () => {
    expect(() =>
      SearchPreferenceSchema.parse({
        ...validSearchPreference,
        applyWindowStart: "18:30",
        applyWindowEnd: "09:30",
      }),
    ).toThrow("applyWindowStart must be <= applyWindowEnd");
  });

  it("rejects inverted apply intervals", () => {
    expect(() =>
      SearchPreferenceSchema.parse({
        ...validSearchPreference,
        intervalMinSeconds: 300,
        intervalMaxSeconds: 120,
      }),
    ).toThrow("intervalMinSeconds must be <= intervalMaxSeconds");
  });

  it.each(["targetCities", "keywords"] as const)("rejects whitespace-only search preference %s", (field) => {
    expect(() =>
      SearchPreferenceSchema.parse({
        ...validSearchPreference,
        [field]: ["  "],
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

  it.each(["id", "fileName", "rawText"] as const)(
    "rejects whitespace-only resume profile field %s",
    (field) => {
      expect(() =>
        ResumeProfileSchema.parse({
          id: "resume_1",
          fileName: "resume.pdf",
          rawText: "机器人算法工程师，负责感知与控制项目。",
          summary: "机器人算法背景，具备项目落地经验。",
          skills: ["TypeScript", "Python", "机器人控制"],
          yearsOfExperience: 4,
          projectHighlights: ["移动机器人路径规划", "机械臂控制"],
          education: ["本科"],
          targetRoleSuggestions: ["机器人算法工程师"],
          [field]: "  ",
        }),
      ).toThrow();
    },
  );

  it("validates match result and apply task state", () => {
    const match = MatchResultSchema.parse(matchResult);

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

  it.each(["id", "greeting"] as const)("rejects whitespace-only apply task field %s", (field) => {
    const match = MatchResultSchema.parse(matchResult);

    expect(() =>
      ApplyTaskSchema.parse({
        id: "task_1",
        job: bossJobPosting,
        status: "queued",
        match,
        greeting: match.greeting,
        createdAt: "2026-06-06T10:00:00.000Z",
        updatedAt: "2026-06-06T10:00:00.000Z",
        [field]: "  ",
      }),
    ).toThrow();
  });

  it("rejects legacy apply tasks with only a job URL", () => {
    expect(() =>
      ApplyTaskSchema.parse({
        id: "task_1",
        jobUrl: "https://www.zhipin.com/job_detail/abc.html",
        status: "queued",
        match: matchResult,
        greeting: matchResult.greeting,
        createdAt: "2026-06-06T10:00:00.000Z",
        updatedAt: "2026-06-06T10:00:00.000Z",
      }),
    ).toThrow();
  });
});
