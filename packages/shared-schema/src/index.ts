import { z } from "zod";

export const JobPostingSchema = z.object({
  source: z.literal("boss"),
  url: z.string().url(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  city: z.string().min(1),
  salaryText: z.string().min(1),
  experienceText: z.string().optional(),
  educationText: z.string().optional(),
  description: z.string().min(1),
  bossActiveText: z.string().optional(),
  publishedText: z.string().optional(),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

export const SearchPreferenceSchema = z
  .object({
    targetCities: z.array(z.string().min(1)).min(1),
    keywords: z.array(z.string().min(1)).min(1),
    salaryMinK: z.number().int().positive(),
    salaryMaxK: z.number().int().positive(),
    blockedCompanies: z.array(z.string()),
    blockedIndustries: z.array(z.string()),
    recencyDays: z.number().int().positive(),
    requireActiveBoss: z.boolean(),
    matchThreshold: z.number().int().min(1).max(100),
    dailyLimit: z.number().int().positive(),
    applyWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    applyWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    intervalMinSeconds: z.number().int().positive(),
    intervalMaxSeconds: z.number().int().positive(),
  })
  .refine((value) => value.salaryMinK <= value.salaryMaxK, "salaryMinK must be <= salaryMaxK")
  .refine(
    (value) => value.intervalMinSeconds <= value.intervalMaxSeconds,
    "intervalMinSeconds must be <= intervalMaxSeconds",
  );

export type SearchPreference = z.infer<typeof SearchPreferenceSchema>;

export const ResumeProfileSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  rawText: z.string().min(1),
  summary: z.string(),
  skills: z.array(z.string()),
  yearsOfExperience: z.number().nonnegative(),
  projectHighlights: z.array(z.string()),
  education: z.array(z.string()),
  targetRoleSuggestions: z.array(z.string()),
});

export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

export const MatchResultSchema = z.object({
  passedHardFilters: z.boolean(),
  hardFilterReasons: z.array(z.string()),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
  greeting: z.string(),
  shouldQueue: z.boolean(),
});

export type MatchResult = z.infer<typeof MatchResultSchema>;

export const ApplyTaskStatusSchema = z.enum([
  "pending_review",
  "queued",
  "applying",
  "applied",
  "filtered",
  "needs_manual_action",
  "failed",
  "paused",
]);

export type ApplyTaskStatus = z.infer<typeof ApplyTaskStatusSchema>;

export const ApplyTaskSchema = z.object({
  id: z.string().min(1),
  job: JobPostingSchema,
  status: ApplyTaskStatusSchema,
  match: MatchResultSchema,
  greeting: z.string(),
  failureReason: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
});

export type ApplyTask = z.infer<typeof ApplyTaskSchema>;
