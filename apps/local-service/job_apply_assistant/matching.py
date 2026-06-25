from __future__ import annotations

from decimal import Decimal, InvalidOperation
import re
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


MAX_MONTHLY_SALARY_K = 500
PORTFOLIO_URL = "https://heliang-pu.github.io/"
PORTFOLIO_CONTEXT = {
    "url": PORTFOLIO_URL,
    "role": "具身智能 / VLA 工程师",
    "summary": "关注机器人从数据采集、策略训练到真机部署的完整闭环，专注 LeRobot、VLA/VLM Policy、ACT、Diffusion Policy、π0/π0.5、GR00T、机器人真机部署。",
    "keywords": [
        "LeRobot",
        "ACT",
        "Diffusion Policy",
        "π0",
        "π0.5",
        "GR00T",
        "VLM / VLA",
        "RoboBrain VLM",
        "异步推理",
        "机器人真机部署",
        "灵巧手",
        "人形机器人",
    ],
    "projects": [
        "机械臂 + 智元灵巧手双臂协作：基于 LeRobot 完成 teleoperation、data collection、inference、replay、ACT/Diffusion Policy/π0.5 真机部署，并融合 tactile encoder。",
        "傅利叶 GR2 人形机器人分拣：基于 π0、GR00T、RoboOS 与 RoboBrain VLM 打通感知、控制、推理、技能调度和分拣流程。",
        "S101 单臂抓取策略验证：采集 500+ 条 demonstration，基于 ACT、Diffusion Policy、π0 完成训练、推理部署和闭环测试。",
    ],
}
PORTFOLIO_PROJECT_SUMMARY = (
    "我有 LeRobot 双臂灵巧手、ACT/Diffusion Policy/π0.5 真机部署、"
    "傅利叶 GR2 + RoboBrain VLM 分拣和 S101 500+ demonstrations 项目经验"
)
PORTFOLIO_EVIDENCE = [
    {
        "patterns": [
            "灵巧",
            "触觉",
            "双臂",
            "ACT",
            "Diffusion",
            "π0.5",
            "dexterous",
            "tactile",
        ],
        "terms": ["双臂灵巧手", "ACT/Diffusion Policy/π0.5"],
        "summary": "我做过 LeRobot 双臂灵巧手项目，覆盖 ACT/Diffusion Policy/π0.5 策略训练、触觉反馈和真机部署",
    },
    {
        "patterns": [
            "VLM",
            "视觉-语言",
            "视觉语言",
            "任务分解",
            "技能调度",
            "RoboBrain",
            "RoboOS",
            "人形",
            "humanoid",
        ],
        "terms": ["傅利叶 GR2", "RoboBrain VLM"],
        "summary": "我做过傅利叶 GR2 + RoboBrain VLM 分拣项目，打通 VLM 任务分解、多技能调度和人形机器人真实部署",
    },
    {
        "patterns": [
            "S101",
            "demonstration",
            "数据采集",
            "抓取",
            "单臂",
            "夹取",
            "入盒",
        ],
        "terms": ["S101", "500+ demonstrations"],
        "summary": "我做过 S101 单臂抓取策略验证，采集 500+ demonstrations，并完成 ACT/Diffusion Policy/π0 训练和闭环测试",
    },
]
PORTFOLIO_TERMS = [
    "LeRobot",
    "ACT",
    "Diffusion Policy",
    "π0",
    "π0.5",
    "GR00T",
    "GR2",
    "RoboBrain",
    "灵巧手",
    "双臂",
    "500+",
    "真机",
]


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
            (
                "你是求职投递助手。根据 payload 里的 resume 和 job.description/JD 深度生成结果。"
                "greeting 必须是给招聘者的第一句招呼语，结合候选人简历亮点和当前岗位 JD 的具体要求，"
                "同时结合 payload.portfolio 里个人主页的真实项目，选择和岗位最相关的 1-2 个项目或技术点，"
                f"并自然包含个人主页链接 {PORTFOLIO_URL}。不要写泛泛模板，不要编造简历和个人主页没有的信息。"
                "不要只写“个人主页展示了项目”，必须直接写出和岗位对应的主页项目名、技术点或真机平台。"
                "不同 JD 必须生成不同切入点，禁止复用同一套招呼语。"
                "只返回 JSON：score 0-100、reasons 字符串数组、risks 字符串数组、greeting 字符串。"
            ),
            {
                "resume": resume.to_wire(),
                "portfolio": PORTFOLIO_CONTEXT,
                "preference": preference.to_wire(),
                "job": job.to_wire(),
            },
        )
        validated_ai_result: AIMatchResponse | None = None
        try:
            validated_ai_result = AIMatchResponse.model_validate(ai_result)
        except ValidationError:
            pass

        if validated_ai_result is None:
            raise MatchingResponseError("Invalid AI match response")

        return MatchResult(
            passedHardFilters=True,
            hardFilterReasons=[],
            score=validated_ai_result.score,
            reasons=validated_ai_result.reasons,
            risks=validated_ai_result.risks,
            greeting=self._add_portfolio_context(validated_ai_result.greeting, job),
            shouldQueue=True,
        )

    def _add_portfolio_context(self, greeting: str, job: JobPosting) -> str:
        selected_evidence = self._select_portfolio_evidence(job)
        selected_terms = selected_evidence["terms"]
        selected_summary = selected_evidence["summary"]
        has_selected_evidence = any(term in greeting for term in selected_terms)
        has_portfolio_term = any(term in greeting for term in PORTFOLIO_TERMS)
        has_portfolio_url = PORTFOLIO_URL in greeting
        if has_selected_evidence and has_portfolio_url:
            return greeting
        if has_selected_evidence:
            return f"{greeting.rstrip()} 项目细节见：{PORTFOLIO_URL}"
        cleaned_greeting = self._remove_generic_portfolio_reference(greeting)
        if has_portfolio_term and has_portfolio_url:
            return f"{cleaned_greeting.rstrip()} 另外，{selected_summary}，项目细节见：{PORTFOLIO_URL}"
        if has_portfolio_term:
            return f"{cleaned_greeting.rstrip()} 另外，{selected_summary}，项目细节见：{PORTFOLIO_URL}"
        if has_portfolio_url:
            return f"{cleaned_greeting.rstrip()} {selected_summary}，项目细节见：{PORTFOLIO_URL}"
        return f"{cleaned_greeting.rstrip()} {selected_summary}，项目细节见：{PORTFOLIO_URL}"

    def _select_portfolio_evidence(self, job: JobPosting) -> dict[str, object]:
        job_text = f"{job.title} {job.description}".lower()
        for evidence in PORTFOLIO_EVIDENCE:
            if any(pattern.lower() in job_text for pattern in evidence["patterns"]):
                return evidence
        return {
            "terms": ["LeRobot", "RoboBrain VLM"],
            "summary": PORTFOLIO_PROJECT_SUMMARY,
        }

    def _remove_generic_portfolio_reference(self, greeting: str) -> str:
        cleaned_greeting = re.sub(
            rf"[，,。.\s]*相关项目(?:已)?在我的个人主页\s*{re.escape(PORTFOLIO_URL)}\s*展示[。.]?",
            "",
            greeting,
        )
        cleaned_greeting = re.sub(
            rf"[，,。.\s]*我的个人主页\s*[（(]?{re.escape(PORTFOLIO_URL)}[）)]?\s*展示了?更多[^。.]*(?:[。.]|$)",
            "",
            cleaned_greeting,
        )
        return cleaned_greeting.strip(" ，,。.")

    def _hard_filter(self, job: JobPosting, preference: SearchPreference) -> list[str]:
        reasons: list[str] = []
        target_cities = [city.strip() for city in preference.target_cities if city.strip()]
        if target_cities and not self._city_matches(job.city, target_cities):
            reasons.append("城市不匹配")
        blocked_companies = [blocked.strip() for blocked in preference.blocked_companies if blocked.strip()]
        if any(blocked in job.company_name for blocked in blocked_companies):
            reasons.append("公司在黑名单中")
        blocked_industries = [blocked.strip() for blocked in preference.blocked_industries if blocked.strip()]
        if blocked_industries:
            industry_text = job.industry_text.strip() if job.industry_text is not None else None
            if not industry_text:
                reasons.append("行业信息无法解析")
            elif any(blocked in industry_text for blocked in blocked_industries):
                reasons.append("行业在黑名单中")
        return reasons

    def _parse_salary_range(self, salary_text: str) -> tuple[int, int] | None:
        normalized = salary_text.strip()
        if "年薪" in normalized or re.search(r"万\s*/\s*年|/\s*天", normalized):
            return None
        normalized = self._extract_salary_fragment(normalized)
        if normalized is None:
            return None
        safe_suffix = r"(?:\s*(?:·\s*\d+薪|/\s*月))?"
        wan_range_match = re.fullmatch(
            rf"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*万{safe_suffix}", normalized
        )
        if wan_range_match:
            salary_min = self._wan_to_k(wan_range_match.group(1))
            salary_max = self._wan_to_k(wan_range_match.group(2))
            return self._valid_salary_range(
                salary_min,
                salary_max,
            )

        k_range_match = re.fullmatch(rf"(\d+)\s*K?\s*-\s*(\d+)\s*K{safe_suffix}", normalized, re.IGNORECASE)
        if k_range_match:
            return self._valid_salary_range(
                self._safe_int(k_range_match.group(1)),
                self._safe_int(k_range_match.group(2)),
            )

        k_min_match = re.fullmatch(rf"(\d+)\s*K\s*以上{safe_suffix}", normalized, re.IGNORECASE)
        if k_min_match:
            salary_min = self._safe_int(k_min_match.group(1))
            return self._valid_salary_range(salary_min, MAX_MONTHLY_SALARY_K)

        return None

    def _extract_salary_fragment(self, salary_text: str) -> str | None:
        if re.fullmatch(r"[\d.\sKk万以上/月·薪-]+", salary_text):
            return salary_text
        if re.search(r"[A-Za-z]{2,}", salary_text):
            return salary_text
        match = re.search(r"\d+(?:\.\d+)?\s*(?:K|k|万)?\s*-\s*\d+(?:\.\d+)?\s*(?:K|k|万)(?:\s*·\s*\d+薪|/\s*月)?", salary_text)
        if match:
            return match.group(0)
        min_match = re.search(r"\d+\s*K\s*以上(?:\s*·\s*\d+薪|/\s*月)?", salary_text, re.IGNORECASE)
        if min_match:
            return min_match.group(0)
        return salary_text

    def _parse_published_days(self, published_text: str | None) -> int | None:
        if published_text is None:
            return None
        normalized = published_text.strip()
        if normalized in {"刚刚发布", "今日发布", "今天发布"}:
            return 0
        minutes_match = re.fullmatch(r"(\d+)\s*分钟前(?:发布)?", normalized)
        if minutes_match:
            minutes = self._safe_int(minutes_match.group(1))
            if minutes is None:
                return None
            return 0 if minutes < 1440 else (minutes + 1439) // 1440
        hours_match = re.fullmatch(r"(\d+)\s*小时前(?:发布)?", normalized)
        if hours_match:
            hours = self._safe_int(hours_match.group(1))
            if hours is None:
                return None
            return 0 if hours < 24 else (hours + 23) // 24
        if re.fullmatch(r"昨天(?:发布)?", normalized):
            return 1
        days_match = re.fullmatch(r"(\d+)\s*天前(?:发布)?", normalized)
        if days_match:
            return self._safe_int(days_match.group(1))
        return None

    def _wan_to_k(self, value: str) -> int | None:
        if len(value) > 12:
            return None
        try:
            return int(Decimal(value) * 10)
        except (InvalidOperation, ValueError, OverflowError):
            return None

    def _valid_salary_range(self, salary_min: int | None, salary_max: int | None) -> tuple[int, int] | None:
        if salary_min is None or salary_max is None:
            return None
        if salary_min <= 0 or salary_max <= 0:
            return None
        if salary_min > salary_max:
            return None
        if salary_max > MAX_MONTHLY_SALARY_K:
            return None
        return salary_min, salary_max

    def _safe_int(self, value: str) -> int | None:
        if len(value) > 6:
            return None
        try:
            return int(value)
        except (ValueError, OverflowError):
            return None

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
            days = self._safe_int(day_match.group(1))
            return None if days is None else days <= 7

        hour_match = re.fullmatch(r"(\d+)\s*小时前活跃", normalized)
        if hour_match:
            hours = self._safe_int(hour_match.group(1))
            return None if hours is None else hours <= 168

        minute_match = re.fullmatch(r"(\d+)\s*分钟前活跃", normalized)
        if minute_match:
            minutes = self._safe_int(minute_match.group(1))
            return None if minutes is None else minutes <= 7 * 24 * 60

        active_words = {"刚刚活跃", "今日活跃", "今天活跃", "当前活跃", "在线", "刚刚在线", "本周活跃"}
        if normalized in active_words:
            return True

        return None
