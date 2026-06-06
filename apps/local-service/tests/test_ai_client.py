import httpx
import pytest

from job_apply_assistant.ai_client import AIClient, AIConfig


@pytest.mark.asyncio
async def test_chat_completion_uses_openai_compatible_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.example.com/v1/chat/completions"
        payload = request.read().decode("utf-8")
        assert "机器人算法工程师" in payload
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
    client = AIClient(
        AIConfig(base_url="https://api.example.com/v1", api_key="secret", model="test-model"),
        http_client=httpx.AsyncClient(transport=transport),
    )

    content = await client.complete_json("分析岗位", {"title": "机器人算法工程师"})

    assert content["score"] == 86
