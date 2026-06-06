import json

import httpx
import pytest

from job_apply_assistant.ai_client import AIClient, AIConfig, AIResponseError


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

    client = AIClient(
        AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
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
