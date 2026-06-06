import type { JobPosting } from "@job-apply-assistant/shared-schema";

export interface AutomationDependencies {
  extractJobs: () => JobPosting[];
  detectBlockingCondition: () => string | null;
  matchJob: (job: JobPosting) => Promise<unknown>;
}

export interface AutomationControllerState {
  status: "idle" | "scanning" | "matching" | "paused" | "error";
  pauseReason?: string;
  matchedCount: number;
}

export class AutomationController {
  constructor(private readonly deps: AutomationDependencies) {}

  async scanAndMatch(): Promise<AutomationControllerState> {
    const blockingCondition = this.deps.detectBlockingCondition();
    if (blockingCondition) {
      return { status: "paused", pauseReason: blockingCondition, matchedCount: 0 };
    }

    const jobs = this.deps.extractJobs();
    let matchedCount = 0;
    for (const job of jobs) {
      await this.deps.matchJob(job);
      matchedCount += 1;
    }

    return { status: "idle", matchedCount };
  }
}
