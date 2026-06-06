from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, TypeAdapter, field_validator, model_validator


APPLY_WINDOW_PATTERN = r"^([01]\d|2[0-3]):[0-5]\d$"
UTC_DATETIME_PATTERN = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$"
HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def require_non_blank_string(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("string must not be empty")
    return cleaned


class JobPosting(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source: Literal["boss"]
    url: str
    title: str
    company_name: str = Field(alias="companyName")
    city: str
    salary_text: str = Field(alias="salaryText")
    experience_text: str | None = Field(default=None, alias="experienceText")
    education_text: str | None = Field(default=None, alias="educationText")
    description: str
    boss_active_text: str | None = Field(default=None, alias="bossActiveText")
    published_text: str | None = Field(default=None, alias="publishedText")

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        cleaned = require_non_blank_string(value)
        HTTP_URL_ADAPTER.validate_python(cleaned)
        return cleaned

    @field_validator("title", "company_name", "city", "salary_text", "description")
    @classmethod
    def require_core_strings(cls, value: str) -> str:
        return require_non_blank_string(value)


class SearchPreference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    target_cities: list[str] = Field(alias="targetCities")
    keywords: list[str]
    salary_min_k: int = Field(alias="salaryMinK", gt=0)
    salary_max_k: int = Field(alias="salaryMaxK", gt=0)
    blocked_companies: list[str] = Field(alias="blockedCompanies")
    blocked_industries: list[str] = Field(alias="blockedIndustries")
    recency_days: int = Field(alias="recencyDays", gt=0)
    require_active_boss: bool = Field(alias="requireActiveBoss")
    match_threshold: int = Field(alias="matchThreshold", ge=1, le=100)
    daily_limit: int = Field(alias="dailyLimit", gt=0)
    apply_window_start: str = Field(alias="applyWindowStart", pattern=APPLY_WINDOW_PATTERN)
    apply_window_end: str = Field(alias="applyWindowEnd", pattern=APPLY_WINDOW_PATTERN)
    interval_min_seconds: int = Field(alias="intervalMinSeconds", gt=0)
    interval_max_seconds: int = Field(alias="intervalMaxSeconds", gt=0)

    @field_validator("target_cities", "keywords")
    @classmethod
    def require_non_empty_strings(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("list must contain at least one non-empty string")
        return cleaned

    @model_validator(mode="after")
    def validate_ranges(self) -> SearchPreference:
        if self.salary_min_k > self.salary_max_k:
            raise ValueError("salary_min_k must be <= salary_max_k")
        if self.apply_window_start > self.apply_window_end:
            raise ValueError("apply_window_start must be <= apply_window_end")
        if self.interval_min_seconds > self.interval_max_seconds:
            raise ValueError("interval_min_seconds must be <= interval_max_seconds")
        return self


class ResumeProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    file_name: str = Field(alias="fileName")
    raw_text: str = Field(alias="rawText")
    summary: str
    skills: list[str]
    years_of_experience: float = Field(alias="yearsOfExperience", ge=0)
    project_highlights: list[str] = Field(alias="projectHighlights")
    education: list[str]
    target_role_suggestions: list[str] = Field(alias="targetRoleSuggestions")

    @field_validator("id", "file_name", "raw_text")
    @classmethod
    def require_core_strings(cls, value: str) -> str:
        return require_non_blank_string(value)


class MatchResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    passed_hard_filters: bool = Field(alias="passedHardFilters")
    hard_filter_reasons: list[str] = Field(alias="hardFilterReasons")
    score: int = Field(ge=0, le=100)
    reasons: list[str]
    risks: list[str]
    greeting: str
    should_queue: bool = Field(alias="shouldQueue")


ApplyTaskStatus = Literal[
    "pending_review",
    "queued",
    "applying",
    "applied",
    "filtered",
    "needs_manual_action",
    "failed",
    "paused",
]


class ApplyTask(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    job: JobPosting
    status: ApplyTaskStatus
    match: MatchResult
    greeting: str
    failure_reason: str | None = Field(default=None, alias="failureReason")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")
    applied_at: str | None = Field(default=None, alias="appliedAt")

    @field_validator("id", "greeting")
    @classmethod
    def require_core_strings(cls, value: str) -> str:
        return require_non_blank_string(value)

    @field_validator("created_at", "updated_at", "applied_at")
    @classmethod
    def validate_datetime_string(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.fullmatch(UTC_DATETIME_PATTERN, value):
            raise ValueError("datetime string must be UTC ISO format ending in Z")
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("datetime string must be a valid datetime") from exc
        return value

    @classmethod
    def create(cls, job: JobPosting, match: MatchResult, greeting: str) -> ApplyTask:
        now = utc_now_iso()
        status: ApplyTaskStatus = "queued" if match.should_queue else "filtered"
        return cls(
            id=f"task_{uuid4().hex}",
            job=job,
            status=status,
            match=match,
            greeting=greeting,
            createdAt=now,
            updatedAt=now,
        )
