from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from job_apply_assistant.api import MatchServiceFactory, create_api_router


def create_app(match_service_factory: MatchServiceFactory | None = None) -> FastAPI:
    app = FastAPI(title="Job Apply Assistant Local Service")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_origin_regex=r"chrome-extension://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(create_api_router(match_service_factory=match_service_factory))
    return app


app = create_app()
