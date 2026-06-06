from __future__ import annotations

from datetime import date, datetime, timezone

from job_apply_assistant.models import ApplyTask, SearchPreference


OPEN_STATUSES = {"pending_review", "queued", "applying", "needs_manual_action", "paused"}


class ApplyQueue:
    def __init__(self) -> None:
        self.tasks: list[ApplyTask] = []
        self.applied_today = 0
        self._applied_date: date | None = None
        self.pause_reason: str | None = None

    def enqueue(self, task: ApplyTask) -> None:
        if task.status != "queued":
            return
        if any(
            existing.job.url == task.job.url and existing.status in OPEN_STATUSES
            for existing in self.tasks
        ):
            return
        self.tasks.append(task)

    def next_task(self, preference: SearchPreference, now: datetime) -> ApplyTask | None:
        self.pause_reason = None
        self._reset_daily_count_if_needed(now.date())
        if self.applied_today >= preference.daily_limit:
            self.pause_reason = "达到每日上限"
            return None
        if not self._inside_window(preference, now):
            self.pause_reason = "当前时间不在投递时间段"
            return None
        if any(task.status == "applying" for task in self.tasks):
            return None

        for task in self.tasks:
            if task.status == "queued":
                task.status = "applying"
                task.updated_at = self._utc_iso(now)
                return task
        return None

    def mark_applied(self, task: ApplyTask, now: datetime | None = None) -> None:
        self._ensure_task_belongs_to_queue(task)
        if task.status == "applied":
            return
        if task.status != "applying":
            raise ValueError("only applying tasks can be marked as applied")

        current_datetime = now or datetime.now(timezone.utc)
        self._reset_daily_count_if_needed(current_datetime.date())
        timestamp = self._utc_iso(current_datetime)
        task.status = "applied"
        task.applied_at = timestamp
        task.updated_at = timestamp
        self.applied_today += 1

    def mark_manual_action(self, task: ApplyTask, reason: str) -> None:
        self._ensure_task_belongs_to_queue(task)
        if task.status != "applying":
            raise ValueError("only applying tasks can be marked for manual action")

        cleaned_reason = reason.strip()
        if not cleaned_reason:
            raise ValueError("reason must not be empty")

        task.status = "needs_manual_action"
        task.failure_reason = cleaned_reason
        task.updated_at = self._utc_iso(datetime.now(timezone.utc))
        self.pause_reason = cleaned_reason

    def _inside_window(self, preference: SearchPreference, now: datetime) -> bool:
        current_time = now.strftime("%H:%M")
        return preference.apply_window_start <= current_time <= preference.apply_window_end

    def _reset_daily_count_if_needed(self, current_date: date) -> None:
        if self._applied_date is None:
            self._applied_date = current_date
            return
        if self._applied_date != current_date:
            self.applied_today = 0
            self._applied_date = current_date

    def _ensure_task_belongs_to_queue(self, task: ApplyTask) -> None:
        if not any(existing is task for existing in self.tasks):
            raise ValueError("task is not in this queue")

    def _utc_iso(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
