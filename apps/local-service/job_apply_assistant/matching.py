from __future__ import annotations

import re
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


class MatchingResponseError(RuntimeError):
    pass


class AIMatchResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")

    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(max_length=10)
    risks: list[str] = Field(max_length=10)
    greeting: str = Field(max_length=500)

    @field_validator("reasons", "risks")
    @classmethod
    def validate_text_list(cls, values: list[str]) -> list[str]:
        cleaned_values: list[str] = []
        for value in values:
            cleaned_value = value.strip()
            if not cleaned_value:
                raise ValueError("list items must not be blank")
            if len(cleaned_value) > 200:
                raise ValueError("list items must be at most 200 characters")
            cleaned_values.append(cleaned_value)
        return cleaned_values

    @field_validator("greeting")
    @classmethod
    def validate_greeting(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("greeting must not be blank")
        return cleaned_value


class JsonCompletionClient(Protocol):
    async def complete_json(self, system_prompt: str, payload: dict) -> dict:
        pass


class MatchingService:
    def __init__(self, ai_client: JsonCompletionClient) -> None:
        self.ai_client = ai_client

    async def match(
        self,
        job: JobPosting,
        resume: ResumeProfile,
        preference: SearchPreference,
    ) -> MatchResult:
        hard_filter_reasons = self._hard_filter(job, preference)
        if hard_filter_reasons:
            return MatchResult(
                passedHardFilters=False,
                hardFilterReasons=hard_filter_reasons,
                score=0,
                reasons=[],
                risks=[],
                greeting="未通过硬性筛选",
                shouldQueue=False,
            )

        ai_result = await self.ai_client.complete_json(
            "你是求职匹配助手。只返回 JSON：score 0-100、reasons 字符串数组、risks 字符串数组、greeting 字符串。",
            {
                "resume": resume.to_wire(),
                "preference": preference.to_wire(),
                "job": job.to_wire(),
            },
        )
        try:
            validated_ai_result = AIMatchResponse.model_validate(ai_result)
        except ValidationError as exc:
            raise MatchingResponseError("Invalid AI match response") from exc

        return MatchResult(
            passedHardFilters=True,
            hardFilterReasons=[],
            score=validated_ai_result.score,
            reasons=validated_ai_result.reasons,
            risks=validated_ai_result.risks,
            greeting=validated_ai_result.greeting,
            shouldQueue=validated_ai_result.score >= preference.match_threshold,
        )

    def _hard_filter(self, job: JobPosting, preference: SearchPreference) -> list[str]:
        reasons: list[str] = []
        if not self._city_matches(job.city, preference.target_cities):
            reasons.append("城市不匹配")
        blocked_companies = [blocked.strip() for blocked in preference.blocked_companies if blocked.strip()]
        if any(blocked in job.company_name for blocked in blocked_companies):
            reasons.append("公司在黑名单中")
        if not any(
            keyword.lower() in f"{job.title} {job.description}".lower() for keyword in preference.keywords
        ):
            reasons.append("岗位关键词不匹配")
        if preference.require_active_boss:
            boss_is_active = self._parse_boss_active(job.boss_active_text)
            if boss_is_active is None:
                reasons.append("Boss 活跃度无法解析")
            elif not boss_is_active:
                reasons.append("Boss 活跃度不满足")
        published_days = self._parse_published_days(job.published_text)
        if published_days is None:
            reasons.append("发布时间无法解析")
        elif published_days > preference.recency_days:
            reasons.append("发布时间不满足")
        salary_range = self._parse_salary_range(job.salary_text)
        if salary_range is None:
            reasons.append("薪资无法解析")
            return reasons

        salary_min, salary_max = salary_range
        if salary_max < preference.salary_min_k or salary_min > preference.salary_max_k:
            reasons.append("薪资范围不匹配")
        return reasons

    def _parse_salary_range(self, salary_text: str) -> tuple[int, int] | None:
        normalized = salary_text.strip()
        safe_suffix = r"(?:\s*(?:·\s*\d+薪|/\s*月))?"
        if "年薪" in normalized or re.search(r"万\s*/\s*年", normalized):
            return None
        wan_range_match = re.fullmatch(
            rf"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*万{safe_suffix}", normalized
        )
        if wan_range_match:
            return self._valid_salary_range(
                self._wan_to_k(wan_range_match.group(1)),
                self._wan_to_k(wan_range_match.group(2)),
            )

        k_range_match = re.fullmatch(rf"(\d+)\s*K?\s*-\s*(\d+)\s*K{safe_suffix}", normalized, re.IGNORECASE)
        if k_range_match:
            return self._valid_salary_range(int(k_range_match.group(1)), int(k_range_match.group(2)))

        k_min_match = re.fullmatch(rf"(\d+)\s*K\s*以上{safe_suffix}", normalized, re.IGNORECASE)
        if k_min_match:
            return int(k_min_match.group(1)), 1_000_000

        return None

    def _parse_published_days(self, published_text: str | None) -> int | None:
        if published_text is None:
            return None
        normalized = published_text.strip()
        if normalized in {"刚刚发布", "今日发布", "今天发布"}:
            return 0
        minutes_match = re.fullmatch(r"(\d+)\s*分钟前(?:发布)?", normalized)
        if minutes_match:
            minutes = int(minutes_match.group(1))
            return 0 if minutes < 1440 else (minutes + 1439) // 1440
        hours_match = re.fullmatch(r"(\d+)\s*小时前(?:发布)?", normalized)
        if hours_match:
            hours = int(hours_match.group(1))
            return 0 if hours < 24 else (hours + 23) // 24
        if normalized == "昨天":
            return 1
        days_match = re.fullmatch(r"(\d+)\s*天前(?:发布)?", normalized)
        if days_match:
            return int(days_match.group(1))
        return None

    def _wan_to_k(self, value: str) -> int:
        return int(float(value) * 10)

    def _valid_salary_range(self, salary_min: int, salary_max: int) -> tuple[int, int] | None:
        if salary_min > salary_max:
            return None
        return salary_min, salary_max

    def _city_matches(self, job_city: str, target_cities: list[str]) -> bool:
        normalized_job_city = self._normalize_city(job_city)
        return any(
            normalized_job_city == self._normalize_city(target_city)
            or normalized_job_city.startswith(self._normalize_city(target_city))
            for target_city in target_cities
        )

    def _normalize_city(self, city: str) -> str:
        primary_city = re.split(r"[·\s]+", city.strip(), maxsplit=1)[0]
        return primary_city.removesuffix("市")

    def _parse_boss_active(self, boss_active_text: str | None) -> bool | None:
        if boss_active_text is None:
            return None
        normalized = boss_active_text.strip()
        if not normalized:
            return None

        inactive_words = [
            "本月活跃",
            "很久没活跃",
            "半年前活跃",
            "不活跃",
            "不在线",
            "当前不在线",
            "未在线",
            "很久没在线",
            "上月在线",
            "离线",
        ]
        if any(word in normalized for word in inactive_words):
            return False

        day_match = re.fullmatch(r"(\d+)\s*日内活跃", normalized)
        if day_match:
            return int(day_match.group(1)) <= 7

        hour_match = re.fullmatch(r"(\d+)\s*小时前活跃", normalized)
        if hour_match:
            return int(hour_match.group(1)) <= 168

        if re.fullmatch(r"\d+\s*分钟前活跃", normalized):
            return True

        active_words = {"刚刚活跃", "今日活跃", "今天活跃", "当前活跃", "在线", "刚刚在线", "本周活跃"}
        if normalized in active_words:
            return True

        return None
