from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from job_apply_assistant.ai_client import AIClient, AIConfig, AIResponseError
from job_apply_assistant.matching import MatchingResponseError, MatchingService
from job_apply_assistant.models import JobPosting, MatchResult, ResumeProfile, SearchPreference


class MatchService(Protocol):
    async def match(
        self,
        job: JobPosting,
        resume: ResumeProfile,
        preference: SearchPreference,
    ) -> MatchResult:
        pass


MatchServiceFactory = Callable[[AIConfig], MatchService]


class AIConfigRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, strict=True, extra="forbid")

    base_url: str = Field(alias="baseUrl")
    api_key: str = Field(alias="apiKey")
    model: str
    timeout_seconds: int | float = Field(default=30.0, alias="timeoutSeconds", gt=0, le=300)

    def to_config(self) -> AIConfig:
        return AIConfig(
            base_url=self.base_url,
            api_key=self.api_key,
            model=self.model,
            timeout_seconds=self.timeout_seconds,
        )


class MatchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    job: JobPosting
    resume: ResumeProfile
    preference: SearchPreference
    ai_config: AIConfigRequest | None = Field(default=None, alias="aiConfig")


async def _match_with_default_service(
    config: AIConfig,
    job: JobPosting,
    resume: ResumeProfile,
    preference: SearchPreference,
) -> MatchResult:
    async with AIClient(config) as ai_client:
        return await MatchingService(ai_client).match(job, resume, preference)


def create_api_router(match_service_factory: MatchServiceFactory | None = None) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "job-apply-assistant-local-service"}

    @router.post("/match", response_model=MatchResult, response_model_by_alias=True)
    async def match(request: MatchRequest) -> MatchResult:
        if request.ai_config is None:
            raise HTTPException(status_code=400, detail="AI config is not set")

        try:
            config = request.ai_config.to_config()
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid AI config") from exc

        try:
            if match_service_factory is not None:
                service = match_service_factory(config)
                return await service.match(request.job, request.resume, request.preference)

            return await _match_with_default_service(config, request.job, request.resume, request.preference)
        except (AIResponseError, MatchingResponseError) as exc:
            raise HTTPException(status_code=502, detail="Unable to match job at this time") from exc

    return router
