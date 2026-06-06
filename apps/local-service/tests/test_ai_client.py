import json

import httpx
import pytest

from job_apply_assistant.ai_client import AIClient, AIConfig, AIResponseError


@pytest.mark.parametrize(
    "config_kwargs",
    [
        {"base_url": "", "api_key": "secret", "model": "test-model"},
        {"base_url": "ftp://api.example.com/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https:///v1", "api_key": "secret", "model": "test-model"},
        {"base_url": " https://api.example.com/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1\n", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com:bad/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1?x=1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1#frag", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://user:pass@api.example.com/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "http://api.example.com/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api example.com/v1", "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1 bad", "api_key": "secret", "model": "test-model"},
        {"base_url": "http://exa\tmple.com", "api_key": "secret", "model": "test-model"},
        {"base_url": 123, "api_key": "secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": " ", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": " secret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret ", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "sec\nret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "sec ret", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "密钥", "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": 123, "model": "test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": ""},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": " test-model"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": "test-model "},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": "test\nmodel"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": "test model"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": "模型"},
        {"base_url": "https://api.example.com/v1", "api_key": "secret", "model": 123},
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": "30",
        },
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": True,
        },
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": float("inf"),
        },
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": float("nan"),
        },
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": 0,
        },
        {
            "base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "model": "test-model",
            "timeout_seconds": 301,
        },
    ],
)
def test_ai_config_rejects_invalid_values(config_kwargs: dict) -> None:
    with pytest.raises(ValueError):
        AIConfig(**config_kwargs)


@pytest.mark.parametrize(
    "base_url",
    [
        "http://localhost:8000/v1",
        "http://127.0.0.1:8000/v1",
        "http://127.0.0.2:8000/v1",
        "http://[::1]:8000/v1",
        "https://api.example.com/v1",
    ],
)
def test_ai_config_accepts_https_and_loopback_http(base_url: str) -> None:
    assert AIConfig(base_url=base_url, api_key="secret", model="test-model").base_url == base_url


def assert_no_transport_error_leak(error: AIResponseError) -> None:
    assert "secret" not in str(error)
    assert error.__cause__ is None
    assert error.__context__ is None


@pytest.mark.asyncio
async def test_chat_completion_uses_openai_compatible_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.example.com/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer secret"
        payload = request.read()
        request_json = json.loads(payload.decode("utf-8"))
        assert request_json["model"] == "test-model"
        assert request_json["messages"] == [
            {"role": "system", "content": "分析岗位"},
            {"role": "user", "content": '{"title": "机器人算法工程师"}'},
        ]
        assert request_json["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"score":86,"reasons":["技能匹配"],"risks":[],"greeting":"您好，期待沟通。"}'
                        }
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        content = await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert content["score"] == 86


@pytest.mark.asyncio
async def test_closes_owned_http_client_from_context_manager() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        async with client as entered:
            assert entered is client
            assert client.http_client.is_closed is False

        assert client.http_client.is_closed is False

    owned_client = AIClient(
        AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model")
    )
    async with owned_client:
        owned_http_client = owned_client.http_client
        assert owned_http_client.is_closed is False

    assert owned_http_client.is_closed is True


@pytest.mark.asyncio
async def test_aclose_does_not_close_injected_http_client() -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200))
    ) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        await client.aclose()

        assert http_client.is_closed is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response_json",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {}}]},
        {"choices": [{"message": {"content": "not json"}}]},
    ],
)
async def test_complete_json_wraps_bad_ai_responses(response_json: dict) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=response_json))

    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        with pytest.raises(AIResponseError, match="Invalid AI response"):
            await client.complete_json("分析岗位", {"title": "机器人算法工程师"})


@pytest.mark.asyncio
async def test_complete_json_wraps_invalid_json_without_leaking_response_content() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"secret":"secret","score":'}}]},
        )
    )

    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        with pytest.raises(AIResponseError, match="Invalid AI response") as exc_info:
            await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert_no_transport_error_leak(exc_info.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [401, 429])
async def test_complete_json_wraps_http_status_errors_without_leaking_api_key(status_code: int) -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(status_code, request=request))

    async with httpx.AsyncClient(transport=transport) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        with pytest.raises(AIResponseError, match=f"AI HTTP error: status {status_code}") as exc_info:
            await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert exc_info.value.status_code == status_code
    assert exc_info.value.error_type == "http_status"
    assert_no_transport_error_leak(exc_info.value)


@pytest.mark.asyncio
async def test_complete_json_wraps_timeout_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        with pytest.raises(AIResponseError, match="AI HTTP error: timeout") as exc_info:
            await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert exc_info.value.status_code is None
    assert exc_info.value.error_type == "timeout"
    assert_no_transport_error_leak(exc_info.value)


@pytest.mark.asyncio
async def test_complete_json_wraps_network_errors_without_leaking_transport_context() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("network down", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = AIClient(
            AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
            http_client=http_client,
        )

        with pytest.raises(AIResponseError, match="AI HTTP error: network") as exc_info:
            await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert exc_info.value.status_code is None
    assert exc_info.value.error_type == "network"
    assert_no_transport_error_leak(exc_info.value)
