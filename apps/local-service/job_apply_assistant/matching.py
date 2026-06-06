from __future__ import annotations

import re
from typing import Protocol

from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


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
        score = int(ai_result["score"])
        return MatchResult(
            passedHardFilters=True,
            hardFilterReasons=[],
            score=score,
            reasons=list(ai_result.get("reasons", [])),
            risks=list(ai_result.get("risks", [])),
            greeting=str(ai_result.get("greeting", "")),
            shouldQueue=score >= preference.match_threshold,
        )

    def _hard_filter(self, job: JobPosting, preference: SearchPreference) -> list[str]:
        reasons: list[str] = []
        if job.city not in preference.target_cities:
            reasons.append("城市不匹配")
        if any(blocked in job.company_name for blocked in preference.blocked_companies):
            reasons.append("公司在黑名单中")
        if not any(
            keyword.lower() in f"{job.title} {job.description}".lower() for keyword in preference.keywords
        ):
            reasons.append("岗位关键词不匹配")
        if preference.require_active_boss and job.boss_active_text:
            inactive_words = ["本月活跃", "很久没活跃", "半年前活跃"]
            if any(word in job.boss_active_text for word in inactive_words):
                reasons.append("Boss 活跃度不满足")
        salary_range = self._parse_salary_range(job.salary_text)
        if salary_range is not None:
            salary_min, salary_max = salary_range
            if salary_max < preference.salary_min_k or salary_min > preference.salary_max_k:
                reasons.append("薪资范围不匹配")
        return reasons

    def _parse_salary_range(self, salary_text: str) -> tuple[int, int] | None:
        match = re.search(r"(\d+)\s*-\s*(\d+)\s*K", salary_text, re.IGNORECASE)
        if not match:
            return None
        return int(match.group(1)), int(match.group(2))
