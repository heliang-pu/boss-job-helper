from __future__ import annotations

import json
import math
from ipaddress import ip_address
from dataclasses import dataclass
from numbers import Real
from typing import Any
from urllib.parse import urlparse

import httpx


class AIResponseError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_type: str = "invalid_response",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_type = error_type


@dataclass(frozen=True)
class AIConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float = 30.0

    def __post_init__(self) -> None:
        for field_name in ["api_key", "model"]:
            raw_value = getattr(self, field_name)
            if not isinstance(raw_value, str):
                raise ValueError(f"{field_name} must be a string")
            if any(ord(character) < 32 or ord(character) == 127 for character in raw_value):
                raise ValueError(f"{field_name} must not contain control characters")
            value = raw_value.strip()
            if not value:
                raise ValueError(f"{field_name} must not be empty")
            if any(ord(character) < 33 or ord(character) > 126 for character in value):
                raise ValueError(f"{field_name} must contain only visible ASCII characters")
            object.__setattr__(self, field_name, value)

        if not isinstance(self.base_url, str):
            raise ValueError("base_url must be a string")
        if not self.base_url:
            raise ValueError("base_url must not be empty")
        if any(
            character.isspace() or ord(character) < 32 or ord(character) == 127 for character in self.base_url
        ):
            raise ValueError("base_url must not contain whitespace or control characters")
        parsed_base_url = urlparse(self.base_url)
        try:
            parsed_base_url.port
        except ValueError as exc:
            raise ValueError("base_url must be a valid HTTP or HTTPS URL") from exc
        if (
            parsed_base_url.query
            or parsed_base_url.fragment
            or parsed_base_url.username
            or parsed_base_url.password
        ):
            raise ValueError("base_url must not contain query, fragment, or userinfo")
        if parsed_base_url.scheme not in {"http", "https"} or not parsed_base_url.hostname:
            raise ValueError("base_url must be an HTTP or HTTPS URL with a host")
        if parsed_base_url.scheme == "http" and not self._is_loopback_host(parsed_base_url.hostname):
            raise ValueError("http base_url is only allowed for loopback hosts")
        if (
            isinstance(self.timeout_seconds, bool)
            or not isinstance(self.timeout_seconds, Real)
            or not math.isfinite(self.timeout_seconds)
        ):
            raise ValueError("timeout_seconds must be a finite number")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")
        if self.timeout_seconds > 300:
            raise ValueError("timeout_seconds must be <= 300")

    def _is_loopback_host(self, hostname: str) -> bool:
        if hostname.lower() == "localhost":
            return True
        try:
            return ip_address(hostname).is_loopback
        except ValueError:
            return False


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
        transport_error: AIResponseError | None = None
        try:
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
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            transport_error = AIResponseError(
                f"AI HTTP error: status {status_code}",
                status_code=status_code,
                error_type="http_status",
            )
        except httpx.TimeoutException:
            transport_error = AIResponseError("AI HTTP error: timeout", error_type="timeout")
        except httpx.HTTPError:
            transport_error = AIResponseError("AI HTTP error: network", error_type="network")

        if transport_error is not None:
            raise transport_error

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
