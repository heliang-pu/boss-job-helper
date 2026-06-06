import pytest

from job_apply_assistant.matching import MatchingResponseError, MatchingService
from job_apply_assistant.models import JobPosting, ResumeProfile, SearchPreference


class FakeAIClient:
    def __init__(self, response: dict | None = None) -> None:
        self.calls = 0
        self.response = (
            response
            if response is not None
            else {
                "score": 88,
                "reasons": ["ROS 和机器人项目经验匹配"],
                "risks": [],
                "greeting": "您好，我有 ROS 和机器人项目经验，和岗位方向匹配，期待沟通。",
            }
        )

    async def complete_json(self, system_prompt: str, payload: dict) -> dict:
        self.calls += 1
        return self.response


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

    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.score == 88
    assert ai_client.calls == 1


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
        publishedText="今日发布",
    )

    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is False
    assert "公司在黑名单中" in result.hard_filter_reasons
    assert ai_client.calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("salary_text", "should_queue", "expected_reason"),
    [
        ("25-40K", True, None),
        ("25K-40K", True, None),
        ("2-4万", True, None),
        ("2.5-4万", True, None),
        ("20K以上", True, None),
        ("10-15K", False, "薪资范围不匹配"),
        ("薪资面议", False, "薪资无法解析"),
    ],
)
async def test_match_filters_common_salary_formats(
    salary_text: str, should_queue: bool, expected_reason: str | None
) -> None:
    job = JobPosting(
        source="boss",
        url=f"https://www.zhipin.com/job_detail/{salary_text}.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText=salary_text,
        description="ROS Python 机器人控制",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is should_queue
    if expected_reason is None:
        assert result.hard_filter_reasons == []
        assert ai_client.calls == 1
    else:
        assert expected_reason in result.hard_filter_reasons
        assert ai_client.calls == 0


@pytest.mark.asyncio
async def test_match_ignores_blank_blocked_company_entries() -> None:
    preference = make_preference()
    preference.blocked_companies[:] = ["", "   "]
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/3.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is True
    assert ai_client.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "ai_response",
    [
        {},
        {"score": 101, "reasons": [], "risks": [], "greeting": "您好"},
        {"score": "high", "reasons": [], "risks": [], "greeting": "您好"},
        {"score": 88, "reasons": "匹配", "risks": [], "greeting": "您好"},
    ],
)
async def test_match_wraps_invalid_ai_match_output(ai_response: dict) -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/4.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        publishedText="今日发布",
    )

    with pytest.raises(MatchingResponseError, match="Invalid AI match response"):
        await MatchingService(FakeAIClient(ai_response)).match(job, make_resume(), make_preference())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("published_text", "recency_days", "should_queue", "expected_reason"),
    [
        ("今日发布", 1, True, None),
        ("刚刚发布", 1, True, None),
        ("3天前", 3, True, None),
        ("30天前", 7, False, "发布时间不满足"),
        ("未知发布", 7, False, "发布时间无法解析"),
        (None, 7, False, "发布时间无法解析"),
    ],
)
async def test_match_filters_by_published_recency(
    published_text: str | None, recency_days: int, should_queue: bool, expected_reason: str | None
) -> None:
    preference = make_preference()
    preference.recency_days = recency_days
    job_kwargs = {
        "source": "boss",
        "url": "https://www.zhipin.com/job_detail/5.html",
        "title": "机器人软件工程师",
        "companyName": "示例科技",
        "city": "上海",
        "salaryText": "25-40K",
        "description": "ROS Python 机器人控制",
    }
    if published_text is not None:
        job_kwargs["publishedText"] = published_text
    job = JobPosting(**job_kwargs)
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is should_queue
    if expected_reason is None:
        assert result.hard_filter_reasons == []
        assert ai_client.calls == 1
    else:
        assert expected_reason in result.hard_filter_reasons
        assert ai_client.calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_updates", "expected_reason"),
    [
        ({"city": "北京"}, "城市不匹配"),
        ({"title": "后端工程师", "description": "Java 服务端开发"}, "岗位关键词不匹配"),
        ({"bossActiveText": "很久没活跃"}, "Boss 活跃度不满足"),
    ],
)
async def test_match_applies_direct_hard_filters(job_updates: dict, expected_reason: str) -> None:
    job_data = {
        "source": "boss",
        "url": "https://www.zhipin.com/job_detail/6.html",
        "title": "机器人软件工程师",
        "companyName": "示例科技",
        "city": "上海",
        "salaryText": "25-40K",
        "description": "ROS Python 机器人控制",
        "bossActiveText": "刚刚活跃",
        "publishedText": "今日发布",
    }
    job_data.update(job_updates)
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(JobPosting(**job_data), make_resume(), make_preference())

    assert result.should_queue is False
    assert expected_reason in result.hard_filter_reasons
    assert ai_client.calls == 0
