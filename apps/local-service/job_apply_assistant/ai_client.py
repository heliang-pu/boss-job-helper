from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


class AIResponseError(RuntimeError):
    pass


@dataclass(frozen=True)
class AIConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float = 30.0


class AIClient:
    def __init__(self, config: AIConfig, http_client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self._owns_http_client = http_client is None
        self.http_client = http_client or httpx.AsyncClient(timeout=config.timeout_seconds, trust_env=False)

    async def __aenter__(self) -> AIClient:
        return self

    async def __aexit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_http_client:
            await self.http_client.aclose()

    async def complete_json(self, system_prompt: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/chat/completions"
        response = await self.http_client.post(
            url,
            headers={"Authorization": f"Bearer {self.config.api_key}"},
            json={
                "model": self.config.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        try:
            content = response.json()["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("message content must be a string")
            parsed_content = json.loads(content)
            if not isinstance(parsed_content, dict):
                raise TypeError("message content must decode to a JSON object")
            return parsed_content
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise AIResponseError("Invalid AI response") from exc
