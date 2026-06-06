from __future__ import annotations

import re
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


class MatchingResponseError(RuntimeError):
    pass


class AIMatchResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    score: int = Field(ge=0, le=100)
    reasons: list[str]
    risks: list[str]
    greeting: str


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
                greeting="",
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
        if job.city not in preference.target_cities:
            reasons.append("城市不匹配")
        blocked_companies = [blocked.strip() for blocked in preference.blocked_companies if blocked.strip()]
        if any(blocked in job.company_name for blocked in blocked_companies):
            reasons.append("公司在黑名单中")
        if not any(
            keyword.lower() in f"{job.title} {job.description}".lower() for keyword in preference.keywords
        ):
            reasons.append("岗位关键词不匹配")
        if preference.require_active_boss and job.boss_active_text:
            inactive_words = ["本月活跃", "很久没活跃", "半年前活跃"]
            if any(word in job.boss_active_text for word in inactive_words):
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
        wan_range_match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*万", normalized)
        if wan_range_match:
            return self._wan_to_k(wan_range_match.group(1)), self._wan_to_k(wan_range_match.group(2))

        k_range_match = re.search(r"(\d+)\s*K?\s*-\s*(\d+)\s*K", normalized, re.IGNORECASE)
        if k_range_match:
            return int(k_range_match.group(1)), int(k_range_match.group(2))

        k_min_match = re.search(r"(\d+)\s*K\s*以上", normalized, re.IGNORECASE)
        if k_min_match:
            return int(k_min_match.group(1)), 1_000_000

        return None

    def _parse_published_days(self, published_text: str | None) -> int | None:
        if published_text is None:
            return None
        normalized = published_text.strip()
        if any(word in normalized for word in ["刚刚发布", "今日发布", "今天发布"]):
            return 0
        if "昨天" in normalized:
            return 1
        days_match = re.search(r"(\d+)\s*天前", normalized)
        if days_match:
            return int(days_match.group(1))
        return None

    def _wan_to_k(self, value: str) -> int:
        return int(float(value) * 10)
