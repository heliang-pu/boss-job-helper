export type AutomationStatus = "idle" | "scanning" | "matching" | "applying" | "paused" | "error";

export interface RuntimeState {
  status: AutomationStatus;
  serviceConnected: boolean;
  todayAppliedCount: number;
  pauseReason?: string;
}
