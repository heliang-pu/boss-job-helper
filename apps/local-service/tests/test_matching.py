import pytest

from job_apply_assistant.matching import MatchingService
from job_apply_assistant.models import JobPosting, ResumeProfile, SearchPreference


class FakeAIClient:
    async def complete_json(self, system_prompt: str, payload: dict) -> dict:
        return {
            "score": 88,
            "reasons": ["ROS 和机器人项目经验匹配"],
            "risks": [],
            "greeting": "您好，我有 ROS 和机器人项目经验，和岗位方向匹配，期待沟通。",
        }


def make_preference() -> SearchPreference:
    return SearchPreference(
        targetCities=["上海"],
        keywords=["机器人", "ROS"],
        salaryMinK=20,
        salaryMaxK=45,
        blockedCompanies=["黑名单公司"],
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


def make_resume() -> ResumeProfile:
    return ResumeProfile(
        id="resume_1",
        fileName="resume.pdf",
        rawText="机器人 ROS Python 项目经验",
        summary="机器人 ROS Python",
        skills=["Python", "ROS", "机器人"],
        yearsOfExperience=3,
        projectHighlights=["机器人项目"],
        education=["本科"],
        targetRoleSuggestions=["机器人软件工程师"],
    )


@pytest.mark.asyncio
async def test_match_passes_when_hard_filters_and_ai_score_pass() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/1.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.score == 88


@pytest.mark.asyncio
async def test_match_filters_blocked_company_before_ai_call() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/2.html",
        title="机器人软件工程师",
        companyName="黑名单公司",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert result.should_queue is False
    assert "公司在黑名单中" in result.hard_filter_reasons
