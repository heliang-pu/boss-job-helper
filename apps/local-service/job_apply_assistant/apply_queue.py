from __future__ import annotations

from datetime import datetime

from job_apply_assistant.models import ApplyTask, SearchPreference, utc_now_iso


class ApplyQueue:
    def __init__(self) -> None:
        self.tasks: list[ApplyTask] = []
        self.applied_today = 0
        self.pause_reason: str | None = None

    def enqueue(self, task: ApplyTask) -> None:
        if any(existing.job.url == task.job.url for existing in self.tasks):
            return
        self.tasks.append(task)

    def next_task(self, preference: SearchPreference, now: datetime) -> ApplyTask | None:
        self.pause_reason = None
        if self.applied_today >= preference.daily_limit:
            self.pause_reason = "达到每日上限"
            return None
        if not self._inside_window(preference, now):
            self.pause_reason = "当前时间不在投递时间段"
            return None

        for task in self.tasks:
            if task.status == "queued":
                task.status = "applying"
                task.updated_at = utc_now_iso()
                return task
        return None

    def mark_applied(self, task: ApplyTask) -> None:
        now = utc_now_iso()
        task.status = "applied"
        task.applied_at = now
        task.updated_at = now
        self.applied_today += 1

    def mark_manual_action(self, task: ApplyTask, reason: str) -> None:
        cleaned_reason = reason.strip()
        if not cleaned_reason:
            raise ValueError("reason must not be empty")

        task.status = "needs_manual_action"
        task.failure_reason = cleaned_reason
        task.updated_at = utc_now_iso()
        self.pause_reason = cleaned_reason

    def _inside_window(self, preference: SearchPreference, now: datetime) -> bool:
        current_time = now.strftime("%H:%M")
        return preference.apply_window_start <= current_time <= preference.apply_window_end
