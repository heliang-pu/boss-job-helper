from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from job_apply_assistant.api import MatchServiceFactory, create_api_router


EXTRA_FIELD_LOC_PLACEHOLDER = "<extra>"
SECRET_LOC_PLACEHOLDER = "<secret>"
SECRET_LOC_SEGMENTS = {"apiKey", "api_key"}


def _sanitize_validation_loc(error: dict[str, object]) -> object:
    loc = error.get("loc")
    if not isinstance(loc, (list, tuple)):
        return loc

    sanitized_loc = [
        SECRET_LOC_PLACEHOLDER if segment in SECRET_LOC_SEGMENTS else segment for segment in loc
    ]
    if error.get("type") == "extra_forbidden" and sanitized_loc:
        sanitized_loc[-1] = EXTRA_FIELD_LOC_PLACEHOLDER
    return sanitized_loc


def _sanitize_validation_error(error: dict[str, object]) -> dict[str, object]:
    sanitized_error: dict[str, object] = {}
    if "type" in error:
        sanitized_error["type"] = error["type"]
    if "loc" in error:
        sanitized_error["loc"] = _sanitize_validation_loc(error)
    if "msg" in error:
        sanitized_error["msg"] = error["msg"]
    return sanitized_error


async def _validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": [_sanitize_validation_error(error) for error in exc.errors()]},
    )


def create_app(match_service_factory: MatchServiceFactory | None = None) -> FastAPI:
    app = FastAPI(title="Job Apply Assistant Local Service")
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_origin_regex=r"^chrome-extension://[a-p]{32}$",
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )
    app.include_router(create_api_router(match_service_factory=match_service_factory))
    return app


app = create_app()
