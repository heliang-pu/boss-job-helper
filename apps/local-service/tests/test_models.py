from pydantic import ValidationError
import pytest

from job_apply_assistant.models import (
    ApplyTask,
    JobPosting,
    MatchResult,
    ResumeProfile,
    SearchPreference,
    utc_now_iso,
)


def valid_search_preference_kwargs() -> dict[str, object]:
    return {
        "target_cities": ["上海"],
        "keywords": ["机器人"],
        "salary_min_k": 20,
        "salary_max_k": 45,
        "blocked_companies": [],
        "blocked_industries": [],
        "recency_days": 7,
        "require_active_boss": True,
        "match_threshold": 80,
        "daily_limit": 20,
        "apply_window_start": "09:30",
        "apply_window_end": "18:30",
        "interval_min_seconds": 90,
        "interval_max_seconds": 240,
    }


def valid_search_preference_wire_kwargs() -> dict[str, object]:
    return {
        "targetCities": ["上海"],
        "keywords": ["机器人"],
        "salaryMinK": 20,
        "salaryMaxK": 45,
        "blockedCompanies": [],
        "blockedIndustries": [],
        "recencyDays": 7,
        "requireActiveBoss": True,
        "matchThreshold": 80,
        "dailyLimit": 20,
        "applyWindowStart": "09:30",
        "applyWindowEnd": "18:30",
        "intervalMinSeconds": 90,
        "intervalMaxSeconds": 240,
    }


def valid_job_posting_kwargs() -> dict[str, object]:
    return {
        "source": "boss",
        "url": "https://www.zhipin.com/job_detail/abc.html",
        "title": "机器人算法工程师",
        "company_name": "示例科技",
        "city": "上海",
        "salary_text": "25-40K",
        "description": "负责机器人感知与控制算法开发",
    }


def valid_job_posting() -> JobPosting:
    return JobPosting(**valid_job_posting_kwargs())


def valid_match_result(*, should_queue: bool = True) -> MatchResult:
    return MatchResult(
        passed_hard_filters=True,
        hard_filter_reasons=[],
        score=86,
        reasons=["项目经历匹配"],
        risks=[],
        greeting="您好，我有机器人项目经验，期待沟通。",
        should_queue=should_queue,
    )


def valid_match_result_wire_kwargs() -> dict[str, object]:
    return {
        "passedHardFilters": True,
        "hardFilterReasons": [],
        "score": 86,
        "reasons": ["项目经历匹配"],
        "risks": [],
        "greeting": "您好，我有机器人项目经验，期待沟通。",
        "shouldQueue": True,
    }


def valid_resume_profile_kwargs() -> dict[str, object]:
    return {
        "id": "resume_1",
        "file_name": "resume.pdf",
        "raw_text": "机器人算法工程师简历",
        "summary": "有机器人项目经验",
        "skills": ["Python", "机器人"],
        "years_of_experience": 3.5,
        "project_highlights": ["机器人感知项目"],
        "education": ["本科"],
        "target_role_suggestions": ["机器人算法工程师"],
    }


def test_search_preference_validates_ranges() -> None:
    preference = SearchPreference(**valid_search_preference_kwargs())

    assert preference.salary_min_k == 20


def test_search_preference_rejects_invalid_salary_range() -> None:
    with pytest.raises(ValidationError):
        SearchPreference(**{**valid_search_preference_kwargs(), "salary_min_k": 50, "salary_max_k": 30})


@pytest.mark.parametrize("field", ["apply_window_start", "apply_window_end"])
def test_search_preference_rejects_invalid_apply_window_format(field: str) -> None:
    with pytest.raises(ValidationError):
        SearchPreference(**{**valid_search_preference_kwargs(), field: "24:00"})


def test_search_preference_rejects_inverted_apply_window() -> None:
    with pytest.raises(ValidationError):
        SearchPreference(
            **{
                **valid_search_preference_kwargs(),
                "apply_window_start": "18:30",
                "apply_window_end": "09:30",
            }
        )


def test_search_preference_rejects_inverted_interval_range() -> None:
    with pytest.raises(ValidationError):
        SearchPreference(
            **{
                **valid_search_preference_kwargs(),
                "interval_min_seconds": 240,
                "interval_max_seconds": 90,
            }
        )


@pytest.mark.parametrize("field", ["target_cities", "keywords"])
def test_search_preference_rejects_blank_required_lists(field: str) -> None:
    with pytest.raises(ValidationError):
        SearchPreference(**{**valid_search_preference_kwargs(), field: ["  ", ""]})


@pytest.mark.parametrize("field", ["target_cities", "keywords"])
def test_search_preference_rejects_mixed_blank_required_list_items(field: str) -> None:
    with pytest.raises(ValidationError):
        SearchPreference(**{**valid_search_preference_kwargs(), field: ["上海", "  "]})


@pytest.mark.parametrize("field", ["target_cities", "keywords"])
def test_search_preference_trims_required_list_items(field: str) -> None:
    preference = SearchPreference(**{**valid_search_preference_kwargs(), field: [" 上海 "]})

    assert getattr(preference, field) == ["上海"]


@pytest.mark.parametrize(
    ("field", "value"),
    [("salaryMinK", "20"), ("requireActiveBoss", "true"), ("matchThreshold", 80.0)],
)
def test_search_preference_rejects_coerced_scalar_inputs(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        SearchPreference(**{**valid_search_preference_wire_kwargs(), field: value})


@pytest.mark.parametrize(
    "overrides",
    [{"score": "86"}, {"shouldQueue": "false"}],
)
def test_match_result_rejects_coerced_scalar_inputs(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        MatchResult(**{**valid_match_result_wire_kwargs(), **overrides})


def test_models_accept_camel_case_shared_schema_payloads() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/abc.html",
        title="机器人算法工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="负责机器人感知与控制算法开发",
    )
    preference = SearchPreference(
        targetCities=["上海"],
        keywords=["机器人"],
        salaryMinK=20,
        salaryMaxK=45,
        blockedCompanies=[],
        blockedIndustries=[],
        recencyDays=7,
        requireActiveBoss=True,
        matchThreshold=80,
        dailyLimit=20,
        applyWindowStart="09:30",
        applyWindowEnd="18:30",
        intervalMinSeconds=90,
        intervalMaxSeconds=240,
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

    task = ApplyTask.create(job=job, match=match, greeting=match.greeting)
    payload = task.to_wire()

    assert job.company_name == "示例科技"
    assert preference.salary_min_k == 20
    assert match.should_queue is True
    assert "createdAt" in payload
    assert "updatedAt" in payload
    assert "failureReason" not in payload
    assert "appliedAt" not in payload
    assert payload["job"]["companyName"] == "示例科技"
    assert "experienceText" not in payload["job"]
    assert "educationText" not in payload["job"]
    assert "bossActiveText" not in payload["job"]
    assert "publishedText" not in payload["job"]
    assert payload["match"]["shouldQueue"] is True


def test_apply_task_to_wire_uses_aliases_and_omits_unset_optional_fields() -> None:
    match = valid_match_result()

    payload = ApplyTask.create(job=valid_job_posting(), match=match, greeting=match.greeting).to_wire()

    assert "createdAt" in payload
    assert "updatedAt" in payload
    assert "failureReason" not in payload
    assert "appliedAt" not in payload
    assert payload["job"]["companyName"] == "示例科技"
    assert "experienceText" not in payload["job"]
    assert payload["match"]["shouldQueue"] is True


def test_apply_task_validates_status() -> None:
    job = valid_job_posting()
    match = valid_match_result()

    task = ApplyTask.create(job=job, match=match, greeting=match.greeting)

    assert task.status == "queued"
    assert task.job.url == job.url


def test_apply_task_create_filters_when_match_should_not_queue() -> None:
    match = valid_match_result(should_queue=False)

    task = ApplyTask.create(job=valid_job_posting(), match=match, greeting=match.greeting)

    assert task.status == "filtered"


def test_apply_task_create_generates_task_id_and_utc_timestamps() -> None:
    match = valid_match_result()

    task = ApplyTask.create(job=valid_job_posting(), match=match, greeting=match.greeting)

    assert task.id.startswith("task_")
    assert task.created_at.endswith("Z")
    assert task.updated_at.endswith("Z")


def test_job_posting_rejects_invalid_url() -> None:
    with pytest.raises(ValidationError):
        JobPosting(**{**valid_job_posting_kwargs(), "url": "not-a-url"})


@pytest.mark.parametrize("field", ["url", "title", "company_name", "city", "salary_text", "description"])
def test_job_posting_rejects_empty_required_strings(field: str) -> None:
    with pytest.raises(ValidationError):
        JobPosting(**{**valid_job_posting_kwargs(), field: "  "})


@pytest.mark.parametrize("field", ["experience_text", "education_text", "boss_active_text", "published_text"])
def test_job_posting_rejects_empty_optional_strings_when_present(field: str) -> None:
    with pytest.raises(ValidationError):
        JobPosting(**{**valid_job_posting_kwargs(), field: "  "})


def test_job_posting_trims_optional_strings_when_present() -> None:
    job = JobPosting(**{**valid_job_posting_kwargs(), "experience_text": " 3-5年 "})

    assert job.experience_text == "3-5年"


@pytest.mark.parametrize("field", ["id", "file_name", "raw_text"])
def test_resume_profile_rejects_empty_required_strings(field: str) -> None:
    with pytest.raises(ValidationError):
        ResumeProfile(**{**valid_resume_profile_kwargs(), field: "  "})


def test_resume_profile_rejects_negative_years_of_experience() -> None:
    with pytest.raises(ValidationError):
        ResumeProfile(**{**valid_resume_profile_kwargs(), "years_of_experience": -1})


@pytest.mark.parametrize("field", ["id", "greeting"])
def test_apply_task_rejects_empty_required_strings(field: str) -> None:
    match = valid_match_result()
    task_kwargs = {
        "id": "task_1",
        "job": valid_job_posting(),
        "status": "queued",
        "match": match,
        "greeting": match.greeting,
        "createdAt": "2026-06-06T00:00:00Z",
        "updatedAt": "2026-06-06T00:00:00Z",
        field: "  ",
    }

    with pytest.raises(ValidationError):
        ApplyTask(**task_kwargs)


def test_apply_task_rejects_empty_failure_reason_when_present() -> None:
    match = valid_match_result()

    with pytest.raises(ValidationError):
        ApplyTask(
            id="task_1",
            job=valid_job_posting(),
            status="queued",
            match=match,
            greeting=match.greeting,
            failureReason="  ",
            createdAt="2026-06-06T00:00:00Z",
            updatedAt="2026-06-06T00:00:00Z",
        )


@pytest.mark.parametrize("field", ["createdAt", "updatedAt", "appliedAt"])
def test_apply_task_rejects_invalid_datetimes(field: str) -> None:
    match = valid_match_result()
    task_kwargs = {
        "id": "task_1",
        "job": valid_job_posting(),
        "status": "queued",
        "match": match,
        "greeting": match.greeting,
        "createdAt": "2026-06-06T00:00:00Z",
        "updatedAt": "2026-06-06T00:00:00Z",
        field: "not-a-datetime",
    }

    with pytest.raises(ValidationError):
        ApplyTask(**task_kwargs)


@pytest.mark.parametrize("timestamp", ["2026-06-06T10:00:00Z", "2026-06-06T10:00:00.000Z"])
def test_apply_task_accepts_utc_z_datetimes(timestamp: str) -> None:
    match = valid_match_result()

    task = ApplyTask(
        id="task_1",
        job=valid_job_posting(),
        status="queued",
        match=match,
        greeting=match.greeting,
        createdAt=timestamp,
        updatedAt=utc_now_iso(),
        appliedAt=timestamp,
    )

    assert task.created_at == timestamp
    assert task.applied_at == timestamp


@pytest.mark.parametrize(
    "timestamp",
    ["2026-06-06", "2026-06-06T00:00:00", "2026-06-06T00:00:00+08:00"],
)
def test_apply_task_rejects_non_utc_z_datetimes(timestamp: str) -> None:
    match = valid_match_result()

    with pytest.raises(ValidationError):
        ApplyTask(
            id="task_1",
            job=valid_job_posting(),
            status="queued",
            match=match,
            greeting=match.greeting,
            createdAt=timestamp,
            updatedAt="2026-06-06T10:00:00Z",
        )
