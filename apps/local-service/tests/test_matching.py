import pytest

from job_apply_assistant.matching import MatchingResponseError, MatchingService
from job_apply_assistant.models import ApplyTask, JobPosting, ResumeProfile, SearchPreference


class FakeAIClient:
    def __init__(self, response: dict | None = None) -> None:
        self.calls = 0
        self.last_system_prompt: str | None = None
        self.last_payload: dict | None = None
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
        self.last_system_prompt = system_prompt
        self.last_payload = payload
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
    assert ai_client.last_payload is not None
    assert "companyName" in ai_client.last_payload["job"]
    assert "company_name" not in ai_client.last_payload["job"]
    assert "experienceText" not in ai_client.last_payload["job"]
    assert "fileName" in ai_client.last_payload["resume"]
    assert "file_name" not in ai_client.last_payload["resume"]


@pytest.mark.asyncio
async def test_match_adds_portfolio_url_to_greeting() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/portfolio.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert "https://heliang-pu.github.io/" in result.greeting


@pytest.mark.asyncio
async def test_match_adds_portfolio_project_context_to_greeting() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/portfolio-summary.html",
        title="多模态大模型算法工程师",
        companyName="示例科技",
        city="上海",
        salaryText="30-60K",
        description="负责 VLA/VLM 策略、机器人任务分解与真实平台部署",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    result = await MatchingService(FakeAIClient()).match(job, make_resume(), make_preference())

    assert "https://heliang-pu.github.io/" in result.greeting
    assert any(term in result.greeting for term in ["LeRobot", "傅利叶 GR2", "RoboBrain VLM"])


@pytest.mark.asyncio
async def test_match_replaces_generic_portfolio_reference_with_project_context() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/generic-portfolio.html",
        title="VLA 资深工程师",
        companyName="示例科技",
        city="上海",
        salaryText="40-70K",
        description="需要熟悉 VLA、机器人真机部署、VLM 任务分解",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient(
        {
            "score": 85,
            "reasons": ["VLA 方向匹配"],
            "risks": [],
            "greeting": "您好，我对贵司岗位很感兴趣，相关项目已在我的个人主页 https://heliang-pu.github.io/ 展示。",
        }
    )

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert "傅利叶 GR2" in result.greeting
    assert "RoboBrain VLM" in result.greeting
    assert "项目细节见" in result.greeting
    assert "主页展示" not in result.greeting


@pytest.mark.asyncio
async def test_match_makes_generic_greetings_specific_to_each_jd() -> None:
    ai_client = FakeAIClient(
        {
            "score": 86,
            "reasons": ["方向匹配"],
            "risks": [],
            "greeting": "您好，我是蒲贺良，具身智能全栈工程师，希望能进一步沟通这个岗位。",
        }
    )
    vlm_job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/vlm-task.html",
        title="VLA 资深工程师（视觉-语言-动作工程师）",
        companyName="示例科技",
        city="上海",
        salaryText="40-70K",
        description="负责 VLM 任务分解、RoboBrain 接入、多技能调度和人形机器人真实部署",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    dexterous_job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/dexterous.html",
        title="具身智能算法专家",
        companyName="示例科技",
        city="上海",
        salaryText="45-75K",
        description="负责双臂灵巧手、触觉反馈、ACT 与 Diffusion Policy 在真实平台上的策略训练与部署",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    service = MatchingService(ai_client)
    vlm_result = await service.match(vlm_job, make_resume(), make_preference())
    dexterous_result = await service.match(dexterous_job, make_resume(), make_preference())

    assert vlm_result.greeting != dexterous_result.greeting
    assert "RoboBrain VLM" in vlm_result.greeting
    assert "傅利叶 GR2" in vlm_result.greeting
    assert "双臂灵巧手" in dexterous_result.greeting
    assert "ACT/Diffusion Policy/π0.5" in dexterous_result.greeting


@pytest.mark.asyncio
async def test_match_sends_portfolio_context_to_ai_for_greeting() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/portfolio-context.html",
        title="多模态 VLA 算法工程师",
        companyName="示例科技",
        city="上海",
        salaryText="30-60K",
        description="负责 VLA/VLM 策略、机器人真机推理部署、任务分解与技能调度",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert ai_client.last_system_prompt is not None
    assert "个人主页" in ai_client.last_system_prompt
    assert "不要只写" in ai_client.last_system_prompt
    assert "不同 JD" in ai_client.last_system_prompt
    assert "禁止复用同一套招呼语" in ai_client.last_system_prompt
    assert ai_client.last_payload is not None
    portfolio = ai_client.last_payload["portfolio"]
    assert portfolio["url"] == "https://heliang-pu.github.io/"
    assert "LeRobot" in portfolio["keywords"]
    assert "RoboBrain VLM" in portfolio["keywords"]
    assert any("傅利叶 GR2" in project for project in portfolio["projects"])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("city", "target_city"),
    [
        ("上海·浦东新区", "上海"),
        (" 上海 浦东新区 ", "上海"),
        ("上海市浦东新区", "上海"),
        ("北京市朝阳区", "北京"),
    ],
)
async def test_match_accepts_district_level_city_matches(city: str, target_city: str) -> None:
    preference = make_preference()
    preference.target_cities[:] = [target_city]
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/7.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city=city,
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("city", ["北京", "苏州", "杭州·余杭区", "深圳市南山区"])
async def test_match_filters_jobs_outside_target_cities_before_ai_call(city: str) -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/off-city.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city=city,
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is False
    assert result.passed_hard_filters is False
    assert "城市不匹配" in result.hard_filter_reasons
    assert ai_client.calls == 0


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
    task = ApplyTask.create(job=job, match=result, greeting=result.greeting)
    assert task.status == "filtered"


@pytest.mark.asyncio
async def test_match_filters_blocked_industry_before_ai_call() -> None:
    preference = make_preference()
    preference.blocked_industries[:] = ["金融"]
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/industry-blocked.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        industryText="互联网金融",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is False
    assert "行业在黑名单中" in result.hard_filter_reasons
    assert ai_client.calls == 0


@pytest.mark.asyncio
async def test_match_fails_closed_when_blocked_industries_configured_and_job_industry_missing() -> None:
    preference = make_preference()
    preference.blocked_industries[:] = ["金融"]
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/industry-missing.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is False
    assert "行业信息无法解析" in result.hard_filter_reasons
    assert ai_client.calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "salary_text",
    [
        "25-40K",
        "25K-40K",
        "2-4万",
        "2.5-4万",
        "20K以上",
        "25-40K·13薪",
        "25-40K/月",
        "薪资：█30-45K·15薪█",
        "10-15K",
        "0-40K",
        "1-999999K",
        "1-999999万",
        "40-25K",
        "30-50万/年",
        "年薪30-50万",
        "25-40K/天",
        "abc25-40Kzzz",
        "薪资面议",
    ],
)
async def test_match_queues_jobs_without_salary_hard_filter(salary_text: str) -> None:
    job = JobPosting(
        source="boss",
        url=f"https://www.zhipin.com/job_detail/{salary_text}.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText=salary_text,
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


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
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is True
    assert ai_client.calls == 1


@pytest.mark.asyncio
async def test_match_ignores_blank_blocked_industry_entries() -> None:
    preference = make_preference()
    preference.blocked_industries[:] = ["", "   "]
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/blank-industry-block.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "ai_response",
    [
        {},
        {"score": 101, "reasons": [], "risks": [], "greeting": "您好"},
        {"score": "high", "reasons": [], "risks": [], "greeting": "您好"},
        {"score": 88, "reasons": "匹配", "risks": [], "greeting": "您好"},
        {"score": 88, "reasons": [], "risks": [], "greeting": "您好", "extra": "nope"},
        {"score": 88, "reasons": [], "risks": [], "greeting": ""},
        {"score": 88, "reasons": [], "risks": [], "greeting": "   "},
        {"score": 88, "reasons": ["   "], "risks": [], "greeting": "您好"},
        {"score": 88, "reasons": [], "risks": [""], "greeting": "您好"},
        {"score": 88, "reasons": ["匹配"] * 11, "risks": [], "greeting": "您好"},
        {"score": 88, "reasons": [], "risks": [], "greeting": "您" * 501},
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
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )

    with pytest.raises(MatchingResponseError, match="Invalid AI match response"):
        await MatchingService(FakeAIClient(ai_response)).match(job, make_resume(), make_preference())


@pytest.mark.asyncio
async def test_match_wraps_invalid_ai_match_output_without_leaking_validation_context() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/secret.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_response = {
        "score": 88,
        "reasons": [],
        "risks": [],
        "greeting": "您好",
        "secret": "secret",
    }

    with pytest.raises(MatchingResponseError, match="Invalid AI match response") as exc_info:
        await MatchingService(FakeAIClient(ai_response)).match(job, make_resume(), make_preference())

    assert "secret" not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__context__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("published_text", "recency_days"),
    [
        ("今日发布", 1),
        ("刚刚发布", 1),
        ("30分钟前发布", 1),
        ("30分钟前", 1),
        ("1小时前发布", 1),
        ("1小时前", 1),
        ("23小时前发布", 1),
        ("24小时前发布", 1),
        ("25小时前发布", 1),
        ("47小时前发布", 1),
        ("不是今日发布", 1),
        ("今日发布 30天前", 1),
        ("昨天发布", 1),
        ("昨天发布 30天前", 1),
        ("9999分钟前发布", 1),
        (f"{'9' * 5000}分钟前发布", 1),
        ("3天前", 3),
        ("30天前", 7),
        ("未知发布", 7),
        (None, 7),
    ],
)
async def test_match_queues_jobs_without_published_recency_hard_filter(
    published_text: str | None, recency_days: int
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
        "bossActiveText": "刚刚活跃",
    }
    if published_text is not None:
        job_kwargs["publishedText"] = published_text
    job = JobPosting(**job_kwargs)
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), preference)

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_updates", "expected_reason"),
    [
        ({"title": "后端工程师", "description": "Java 服务端开发"}, "岗位关键词不匹配"),
        ({"bossActiveText": "很久没活跃"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "不在线"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "当前不在线"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "未在线"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "999小时前活跃"}, "Boss 活跃度不满足"),
        ({"bossActiveText": f"{'9' * 5000}小时前活跃"}, "Boss 活跃度无法解析"),
        ({"bossActiveText": "10081分钟前活跃"}, "Boss 活跃度不满足"),
        ({"bossActiveText": f"{'9' * 5000}分钟前活跃"}, "Boss 活跃度无法解析"),
        ({"bossActiveText": "很久没在线"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "上月在线"}, "Boss 活跃度不满足"),
        ({"bossActiveText": "活跃状态未知"}, "Boss 活跃度无法解析"),
        ({"bossActiveText": None}, "Boss 活跃度无法解析"),
    ],
)
async def test_match_queues_jobs_without_direct_hard_filters(job_updates: dict, expected_reason: str) -> None:
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

    assert expected_reason
    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "boss_active_text",
    ["30分钟前活跃", "1小时前活跃", "3日内活跃", "7日内活跃", "本周活跃"],
)
async def test_match_accepts_recent_boss_active_texts(boss_active_text: str) -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/8.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText="25-40K",
        description="ROS Python 机器人控制",
        bossActiveText=boss_active_text,
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1


@pytest.mark.asyncio
async def test_match_queues_unparseable_oversized_salary_number() -> None:
    job = JobPosting(
        source="boss",
        url="https://www.zhipin.com/job_detail/oversized-salary.html",
        title="机器人软件工程师",
        companyName="示例科技",
        city="上海",
        salaryText=f"{'9' * 5000}-40K",
        description="ROS Python 机器人控制",
        bossActiveText="刚刚活跃",
        publishedText="今日发布",
    )
    ai_client = FakeAIClient()

    result = await MatchingService(ai_client).match(job, make_resume(), make_preference())

    assert result.should_queue is True
    assert result.hard_filter_reasons == []
    assert ai_client.calls == 1
