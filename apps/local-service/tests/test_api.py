from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from job_apply_assistant.ai_client import AIConfig, AIResponseError
from job_apply_assistant.main import create_app
from job_apply_assistant.matching import MatchingResponseError
from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


def make_job_payload() -> dict[str, object]:
    return {
        "source": "boss",
        "url": "https://www.zhipin.com/job_detail/abc.html",
        "title": "机器人软件工程师",
        "companyName": "示例科技",
        "city": "上海",
        "salaryText": "25-40K",
        "description": "ROS Python 机器人控制",
        "bossActiveText": "刚刚活跃",
        "publishedText": "今日发布",
    }


def make_resume_payload() -> dict[str, object]:
    return {
        "id": "resume_1",
        "fileName": "resume.pdf",
        "rawText": "机器人 ROS Python 项目经验",
        "summary": "机器人 ROS Python",
        "skills": ["Python", "ROS", "机器人"],
        "yearsOfExperience": 3,
        "projectHighlights": ["机器人项目"],
        "education": ["本科"],
        "targetRoleSuggestions": ["机器人软件工程师"],
    }


def make_preference_payload() -> dict[str, object]:
    return {
        "targetCities": ["上海"],
        "keywords": ["机器人", "ROS"],
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


def make_ai_config_payload(api_key: str = "test-secret-key") -> dict[str, object]:
    return {
        "baseUrl": "https://api.example.com/v1",
        "apiKey": api_key,
        "model": "test-model",
        "timeoutSeconds": 12.5,
    }


def make_match_payload(*, api_key: str = "test-secret-key") -> dict[str, object]:
    return {
        "job": make_job_payload(),
        "resume": make_resume_payload(),
        "preference": make_preference_payload(),
        "aiConfig": make_ai_config_payload(api_key),
    }


class FakeMatchingService:
    def __init__(
        self,
        result: MatchResult | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result or MatchResult(
            passedHardFilters=True,
            hardFilterReasons=[],
            score=91,
            reasons=["机器人项目经验匹配"],
            risks=[],
            greeting="您好，我有机器人项目经验，期待沟通。",
            shouldQueue=True,
        )
        self.error = error
        self.calls: list[tuple[JobPosting, ResumeProfile, SearchPreference]] = []

    async def match(
        self,
        job: JobPosting,
        resume: ResumeProfile,
        preference: SearchPreference,
    ) -> MatchResult:
        self.calls.append((job, resume, preference))
        if self.error is not None:
            raise self.error
        return self.result


def test_health_returns_ok_status() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "job-apply-assistant-local-service"}


def test_match_without_ai_config_returns_400_before_matching() -> None:
    created_services: list[FakeMatchingService] = []

    def factory(config: AIConfig) -> FakeMatchingService:
        service = FakeMatchingService()
        created_services.append(service)
        return service

    client = TestClient(create_app(match_service_factory=factory))
    payload = {
        "job": make_job_payload(),
        "resume": make_resume_payload(),
        "preference": make_preference_payload(),
    }

    response = client.post("/match", json=payload)

    assert response.status_code == 400
    assert response.json() == {"detail": "AI config is not set"}
    assert created_services == []


def test_match_uses_fake_service_and_returns_camel_case_result() -> None:
    created_services: list[FakeMatchingService] = []

    def factory(config: AIConfig) -> FakeMatchingService:
        service = FakeMatchingService()
        created_services.append(service)
        return service

    client = TestClient(create_app(match_service_factory=factory))

    response = client.post("/match", json=make_match_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["passedHardFilters"] is True
    assert body["hardFilterReasons"] == []
    assert body["shouldQueue"] is True
    assert "passed_hard_filters" not in body
    assert "hard_filter_reasons" not in body
    assert "should_queue" not in body
    assert len(created_services) == 1
    assert len(created_services[0].calls) == 1


def test_match_accepts_camel_case_ai_config_and_converts_to_dataclass() -> None:
    captured_configs: list[AIConfig] = []

    def factory(config: AIConfig) -> FakeMatchingService:
        captured_configs.append(config)
        return FakeMatchingService()

    client = TestClient(create_app(match_service_factory=factory))

    response = client.post("/match", json=make_match_payload())

    assert response.status_code == 200
    assert captured_configs == [
        AIConfig(
            base_url="https://api.example.com/v1",
            api_key="test-secret-key",
            model="test-model",
            timeout_seconds=12.5,
        )
    ]


def test_match_accepts_snake_case_ai_config() -> None:
    captured_configs: list[AIConfig] = []
    payload = make_match_payload()
    payload["ai_config"] = {
        "base_url": "https://api.example.com/v1",
        "api_key": "test-secret-key",
        "model": "test-model",
        "timeout_seconds": 18,
    }
    payload.pop("aiConfig")

    def factory(config: AIConfig) -> FakeMatchingService:
        captured_configs.append(config)
        return FakeMatchingService()

    client = TestClient(create_app(match_service_factory=factory))

    response = client.post("/match", json=payload)

    assert response.status_code == 200
    assert captured_configs == [
        AIConfig(
            base_url="https://api.example.com/v1",
            api_key="test-secret-key",
            model="test-model",
            timeout_seconds=18,
        )
    ]


@pytest.mark.parametrize(
    "error",
    [
        AIResponseError("AI HTTP error: status 500 with test-secret-key", status_code=500),
        MatchingResponseError("Invalid AI match response with test-secret-key"),
    ],
)
def test_match_domain_errors_return_sanitized_502(error: Exception) -> None:
    def factory(config: AIConfig) -> FakeMatchingService:
        return FakeMatchingService(error=error)

    client = TestClient(create_app(match_service_factory=factory))

    response = client.post("/match", json=make_match_payload(api_key="test-secret-key"))

    assert response.status_code == 502
    assert response.json() == {"detail": "Unable to match job at this time"}
    assert "test-secret-key" not in response.text


def test_match_validation_errors_do_not_leak_ai_config_secret() -> None:
    client = TestClient(create_app())
    payload = make_match_payload(api_key="secret-key")
    assert isinstance(payload["aiConfig"], dict)
    payload["aiConfig"].pop("model")

    response = client.post("/match", json=payload)

    assert response.status_code == 422
    assert "secret-key" not in response.text
    assert '"input"' not in response.text


def test_match_validation_errors_do_not_echo_extra_field_names() -> None:
    client = TestClient(create_app())
    payload = make_match_payload()
    assert isinstance(payload["aiConfig"], dict)
    payload["aiConfig"]["secret-value-as-field"] = "x"

    response = client.post("/match", json=payload)

    assert response.status_code == 422
    assert "secret-value-as-field" not in response.text
    assert '"input"' not in response.text


@pytest.mark.parametrize(
    ("config_key", "config_payload"),
    [
        (
            "aiConfig",
            {
                "baseUrl": "https://api.example.com/v1",
                "apiKey": {"secret": "value"},
                "model": "test-model",
                "timeoutSeconds": 12.5,
            },
        ),
        (
            "ai_config",
            {
                "base_url": "https://api.example.com/v1",
                "api_key": {"secret": "value"},
                "model": "test-model",
                "timeout_seconds": 12.5,
            },
        ),
    ],
)
def test_match_validation_errors_redact_ai_config_key_locations(
    config_key: str,
    config_payload: dict[str, object],
) -> None:
    client = TestClient(create_app())
    payload = make_match_payload()
    payload.pop("aiConfig")
    payload[config_key] = config_payload

    response = client.post("/match", json=payload)

    assert response.status_code == 422
    assert "apiKey" not in response.text
    assert "api_key" not in response.text
    assert '"input"' not in response.text
    detail = response.json()["detail"]
    assert any("<secret>" in error["loc"] for error in detail)


def test_chrome_extension_cors_preflight_is_allowed() -> None:
    client = TestClient(create_app())

    response = client.options(
        "/match",
        headers={
            "Origin": "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == (
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    )


@pytest.mark.parametrize(
    "origin",
    [
        "chrome-extension://",
        "chrome-extension://not-a-valid-extension-id",
    ],
)
def test_malformed_chrome_extension_cors_preflight_is_not_allowed(origin: str) -> None:
    client = TestClient(create_app())

    response = client.options(
        "/match",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )

    assert "access-control-allow-origin" not in response.headers
