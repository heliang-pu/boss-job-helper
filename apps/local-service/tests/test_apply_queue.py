from datetime import datetime, timezone

from job_apply_assistant.apply_queue import ApplyQueue
from job_apply_assistant.models import ApplyTask, JobPosting, MatchResult, SearchPreference


def make_preference(
    *,
    daily_limit: int = 20,
    apply_window_start: str = "09:30",
    apply_window_end: str = "18:30",
) -> SearchPreference:
    return SearchPreference(
        targetCities=["上海"],
        keywords=["机器人"],
        salaryMinK=20,
        salaryMaxK=45,
        blockedCompanies=[],
        blockedIndustries=[],
        recencyDays=7,
        requireActiveBoss=True,
        matchThreshold=80,
        dailyLimit=daily_limit,
        applyWindowStart=apply_window_start,
        applyWindowEnd=apply_window_end,
        intervalMinSeconds=90,
        intervalMaxSeconds=240,
    )


def make_task(*, url: str = "https://www.zhipin.com/job_detail/1.html") -> ApplyTask:
    job = JobPosting(
        source="boss",
        url=url,
        title="机器人算法工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="负责机器人感知与控制算法开发",
    )
    match = MatchResult(
        passedHardFilters=True,
        hardFilterReasons=[],
        score=86,
        reasons=["项目经历匹配"],
        risks=[],
        greeting="您好，我有机器人项目经验，期待沟通。",
        shouldQueue=True,
    )
    return ApplyTask.create(job=job, match=match, greeting=match.greeting)


def inside_window_now() -> datetime:
    return datetime(2026, 6, 6, 10, 0, tzinfo=timezone.utc)


def test_queue_returns_next_task_inside_window_and_marks_it_applying() -> None:
    queue = ApplyQueue()
    task = make_task()
    queue.enqueue(task)

    selected = queue.next_task(make_preference(), inside_window_now())

    assert selected is task
    assert task.status == "applying"
    assert task.updated_at.endswith("Z")
    assert queue.pause_reason is None


def test_queue_pauses_after_daily_limit() -> None:
    queue = ApplyQueue()
    queue.enqueue(make_task())
    preference = make_preference(daily_limit=1)
    queue.applied_today = 1

    selected = queue.next_task(preference, inside_window_now())

    assert selected is None
    assert queue.pause_reason == "达到每日上限"


def test_queue_ignores_duplicate_enqueue_by_job_url() -> None:
    queue = ApplyQueue()
    first = make_task(url="https://www.zhipin.com/job_detail/dupe.html")
    duplicate = make_task(url="https://www.zhipin.com/job_detail/dupe.html")
    queue.enqueue(first)
    queue.enqueue(duplicate)

    selected = queue.next_task(make_preference(), inside_window_now())
    assert selected is first
    queue.mark_applied(selected)

    assert queue.next_task(make_preference(), inside_window_now()) is None


def test_queue_pauses_outside_apply_window() -> None:
    queue = ApplyQueue()
    task = make_task()
    queue.enqueue(task)

    selected = queue.next_task(make_preference(), datetime(2026, 6, 6, 8, 0, tzinfo=timezone.utc))

    assert selected is None
    assert task.status == "queued"
    assert queue.pause_reason == "当前时间不在投递时间段"


def test_next_task_clears_previous_pause_reason_when_unblocked() -> None:
    queue = ApplyQueue()
    task = make_task()
    queue.enqueue(task)
    queue.pause_reason = "旧原因"

    selected = queue.next_task(make_preference(), inside_window_now())

    assert selected is task
    assert queue.pause_reason is None


def test_mark_manual_action_sets_status_failure_reason_and_pause_reason() -> None:
    queue = ApplyQueue()
    task = make_task()

    queue.mark_manual_action(task, "  需要人工确认  ")

    assert task.status == "needs_manual_action"
    assert task.failure_reason == "需要人工确认"
    assert task.updated_at.endswith("Z")
    assert queue.pause_reason == "需要人工确认"


def test_mark_applied_sets_utc_timestamps_and_increments_daily_count() -> None:
    queue = ApplyQueue()
    task = make_task()

    queue.mark_applied(task)

    assert task.status == "applied"
    assert task.applied_at is not None
    assert task.applied_at.endswith("Z")
    assert task.updated_at.endswith("Z")
    assert queue.applied_today == 1
