from __future__ import annotations

import logging
import json
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

from .diagnostics import build_diagnostic_sink
from .model import EmbeddingModel
from .pipeline import RecognitionPipeline
from .repositories import CandidateRepository, StackrApiRepository
from .schemas import (
    EmbedRequest,
    EmbedResponse,
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    IdentifyRequest,
    IdentifyResponse,
    ReadyResponse,
)
from .scoring import load_scoring_config
from .service_auth import GatewayServiceAuthenticator, ServiceAuthenticationError
from .settings import Settings, get_settings
from .storage import build_storage_client
from .tracing import bind_request_trace, reset_trace, traceparent

logger = logging.getLogger("stackr.recognition")
logging.basicConfig(level=logging.INFO, format="%(message)s")

REQUEST_COUNTER = Counter(
    "stackr_recognition_requests_total",
    "Stackr recognition service requests",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "stackr_recognition_request_duration_seconds",
    "Stackr recognition service request duration",
    ["method", "path"],
)
OUTCOME_COUNTER = Counter(
    "stackr_recognition_outcomes_total",
    "Recognition outcomes by path and match status",
    ["path_kind", "match_status"],
)
AUTO_CONFIRM_COUNTER = Counter(
    "stackr_recognition_auto_confirm_total",
    "Recognition responses by whether automatic confirmation was allowed",
    ["allowed"],
)
IMAGE_FALLBACK_COUNTER = Counter(
    "stackr_recognition_image_fallback_total",
    "Recognition identify requests that required a private fallback image",
    ["used"],
)
ACTIVE_MODEL_INDEX = Gauge(
    "stackr_recognition_active_model_index",
    "Active recognition model and index version",
    ["model_version", "index_version"],
)


def error_envelope(code: str, message: str, request_id: str, details=None):
    return {
        "error": {
            "code": code,
            "message": message,
            "requestId": request_id,
            **({"details": details} if details is not None else {}),
        },
        "meta": {
            "apiVersion": "1",
        },
    }


def create_pipeline(
    settings: Settings,
    repository: CandidateRepository | None = None,
    storage=None,
    diagnostics=None,
    model: EmbeddingModel | None = None,
) -> RecognitionPipeline:
    scoring_config = load_scoring_config(settings.scoring_config_path)
    model_runner = model or EmbeddingModel(settings)
    model_runner.load()
    return RecognitionPipeline(
        settings=settings,
        scoring_config=scoring_config,
        repository=repository or StackrApiRepository(settings),
        storage=storage or build_storage_client(settings),
        model=model_runner,
        diagnostics=diagnostics or build_diagnostic_sink(settings),
    )


def create_app(
    *,
    settings: Settings | None = None,
    repository: CandidateRepository | None = None,
    storage=None,
    diagnostics=None,
    model: EmbeddingModel | None = None,
) -> FastAPI:
    service_settings = settings or get_settings()
    gateway_authenticator = GatewayServiceAuthenticator(service_settings)
    ACTIVE_MODEL_INDEX.labels(
        service_settings.model_version,
        service_settings.active_index_version or "unselected",
    ).set(1)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = service_settings
        app.state.pipeline = create_pipeline(
            service_settings,
            repository=repository,
            storage=storage,
            diagnostics=diagnostics,
            model=model,
        )
        try:
            await app.state.pipeline.repository.open()
            logger.info(json.dumps({
                "event": "recognition_service_started",
                "service_version": service_settings.service_version,
                "model_version": service_settings.model_version,
                "index_version": service_settings.active_index_version,
                "concurrency_hint": service_settings.concurrency_hint,
            }))
            yield
        finally:
            try:
                await app.state.pipeline.repository.close()
            finally:
                app.state.pipeline.model.close()
                logger.info(json.dumps({
                    "event": "recognition_service_stopped",
                    "service_version": service_settings.service_version,
                }))

    app = FastAPI(
        title="Stackr Private Recognition Service",
        version=service_settings.service_version,
        docs_url=None if service_settings.environment == "production" else "/docs",
        redoc_url=None,
        openapi_url="/openapi.json" if service_settings.environment != "production" else None,
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid4())
        trace, trace_token = bind_request_trace(request.headers.get("traceparent"))
        request.state.request_id = request_id
        started = time.perf_counter()
        body_guard_paths = {
            "/v1/recognition/identify",
            "/v1/recognition/embed",
            "/v1/recognition/feedback",
        }
        if request.url.path in body_guard_paths:
            body = await request.body()
            try:
                actor = gateway_authenticator.verify(request.headers, request.method, request.url.path, body)
            except ServiceAuthenticationError as exc:
                response = JSONResponse(
                    status_code=exc.status_code,
                    content=error_envelope(exc.code, exc.message, request_id),
                    headers={"X-Request-Id": request_id, "Cache-Control": "no-store", "Traceparent": traceparent() or "", "X-Trace-Id": trace.trace_id},
                )
                reset_trace(trace_token)
                return response

            lowered = body.lower() if request.headers.get("content-type", "").startswith("application/json") else b""
            if b"base64" in lowered or b"data:image" in lowered or b"imagebytes" in lowered:
                response = JSONResponse(
                    status_code=413,
                    content=error_envelope("image_payload_not_allowed", "Use a private uploaded-image key instead of image bytes in JSON.", request_id),
                    headers={"X-Request-Id": request_id, "Traceparent": traceparent() or "", "X-Trace-Id": trace.trace_id},
                )
                reset_trace(trace_token)
                return response

            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}

            request = Request(request.scope, receive)
            request.state.request_id = request_id
            request.state.gateway_actor = actor
        response = await call_next(request)
        elapsed = time.perf_counter() - started
        REQUEST_COUNTER.labels(request.method, request.url.path, str(response.status_code)).inc()
        REQUEST_LATENCY.labels(request.method, request.url.path).observe(elapsed)
        response.headers["X-Request-Id"] = request_id
        response.headers["Traceparent"] = traceparent() or ""
        response.headers["X-Trace-Id"] = trace.trace_id
        logger.info(json.dumps({
            "event": "recognition_request",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(elapsed * 1000),
            "trace_id": trace.trace_id,
            "span_id": trace.span_id,
        }))
        reset_trace(trace_token)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        details = jsonable_encoder(exc.errors(), custom_encoder={ValueError: str})
        return JSONResponse(
            status_code=422,
            content=error_envelope("validation_error", "Recognition request validation failed.", request.state.request_id, details),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "request_error", "message": str(exc.detail)}
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(
                str(detail.get("code", "request_error")),
                str(detail.get("message", "Recognition request failed.")),
                request.state.request_id,
                {key: value for key, value in detail.items() if key not in {"code", "message"}},
            ),
        )

    def pipeline(request: Request) -> RecognitionPipeline:
        return request.app.state.pipeline

    @app.get("/health", response_model=HealthResponse)
    async def health():
        return HealthResponse(
            ok=True,
            service=service_settings.service_name,
            version=service_settings.service_version,
        )

    @app.get("/ready", response_model=ReadyResponse)
    async def ready(pipeline: RecognitionPipeline = Depends(pipeline)):
        components = await pipeline.ready()
        ready_ok = bool(components.pop("ok"))
        if not ready_ok:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content=ReadyResponse(
                    ok=False,
                    service=service_settings.service_name,
                    version=service_settings.service_version,
                    components=components,
                ).model_dump(),
            )
        return ReadyResponse(
            ok=True,
            service=service_settings.service_name,
            version=service_settings.service_version,
            components=components,
        )

    @app.post("/v1/recognition/identify", response_model=IdentifyResponse)
    async def identify(payload: IdentifyRequest, request: Request, pipeline: RecognitionPipeline = Depends(pipeline)):
        actor = getattr(request.state, "gateway_actor", None)
        result = await pipeline.identify(
            payload,
            request.state.request_id,
            actor_user_id=actor.user_id if actor else None,
        )
        used_image_fallback = not payload.embedding and bool(payload.resolved_private_image_keys())
        path_kind = "fallback" if used_image_fallback else "fast"
        OUTCOME_COUNTER.labels(path_kind, result.matchStatus).inc()
        AUTO_CONFIRM_COUNTER.labels("true" if result.autoAddAllowed else "false").inc()
        IMAGE_FALLBACK_COUNTER.labels("true" if used_image_fallback else "false").inc()
        return result

    @app.post("/v1/recognition/embed", response_model=EmbedResponse)
    async def embed(payload: EmbedRequest, request: Request, pipeline: RecognitionPipeline = Depends(pipeline)):
        actor = getattr(request.state, "gateway_actor", None)
        return await pipeline.embed(payload, actor_user_id=actor.user_id if actor else None)

    @app.post("/v1/recognition/feedback", response_model=FeedbackResponse)
    async def feedback(payload: FeedbackRequest, pipeline: RecognitionPipeline = Depends(pipeline)):
        return await pipeline.feedback(payload)

    @app.get("/metrics")
    async def metrics(request: Request):
        token = service_settings.metrics_secret
        supplied = request.headers.get("x-stackr-metrics-key") or request.headers.get("authorization", "").replace("Bearer ", "")
        if service_settings.metrics_public_mode != "token" or not token or supplied != token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "metrics_auth_required", "message": "metrics endpoint requires a private token"},
            )
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
