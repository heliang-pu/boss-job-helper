from pydantic import ValidationError
import pytest

from job_apply_assistant.models import ApplyTask, JobPosting, MatchResult, SearchPreference


def test_search_preference_validates_ranges() -> None:
    preference = SearchPreference(
        target_cities=["上海"],
        keywords=["机器人"],
        salary_min_k=20,
        salary_max_k=45,
        blocked_companies=[],
        blocked_industries=[],
        recency_days=7,
        require_active_boss=True,
        match_threshold=80,
        daily_limit=20,
        apply_window_start="09:30",
        apply_window_end="18:30",
        interval_min_seconds=90,
        interval_max_seconds=240,
    )

    assert preference.salary_min_k == 20


def test_search_preference_rejects_invalid_salary_range() -> None:
    with pytest.raises(ValidationError):
        SearchPreference(
            target_cities=["上海"],
            keywords=["机器人"],
            salary_min_k=50,
            salary_max_k=30,
            blocked_companies=[],
            blocked_industries=[],
            recency_days=7,
            require_active_boss=True,
            match_threshold=80,
            daily_limit=20,
            apply_window_start="09:30",
            apply_window_end="18:30",
            interval_min_seconds=90,
            interval_max_seconds=240,
        )


def test_apply_task_validates_status() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/abc.html",
        title="机器人算法工程师",
        company_name="示例科技",
        city="上海",
        salary_text="25-40K",
        description="负责机器人感知与控制算法开发",
    )
    match = MatchResult(
        passed_hard_filters=True,
        hard_filter_reasons=[],
        score=86,
        reasons=["项目经历匹配"],
        risks=[],
        greeting="您好，我有机器人项目经验，期待沟通。",
        should_queue=True,
    )

    task = ApplyTask.create(job=job, match=match, greeting=match.greeting)

    assert task.status == "queued"
    assert task.job.url == job.url
