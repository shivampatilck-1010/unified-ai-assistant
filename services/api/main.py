import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure services/api and services/agent-worker are in sys.path when imported
_api_dir = str(Path(__file__).resolve().parent)
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)

_worker_dir = str(Path(__file__).resolve().parent.parent / "agent-worker")
if _worker_dir not in sys.path:
    sys.path.insert(0, _worker_dir)

_wifi_sensing_dir = str(Path(__file__).resolve().parent.parent / "wifi-sensing")
if _wifi_sensing_dir not in sys.path:
    sys.path.insert(0, _wifi_sensing_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import get_settings
from database import check_db_readiness, create_tables
from logging_config import configure_logging
from middleware import (
    PayloadSizeLimitMiddleware,
    RateLimitingMiddleware,
    RequestCorrelationMiddleware,
    SecurityHeadersMiddleware,
)
from routers import (
    browser_tasks_router,
    calendar_router,
    chat_router,
    conversations_router,
    files_router,
    knowledge_router,
    orchestration_router,
    providers_router,
    reminders_router,
    research_router,
    tasks_router,
    wifi_sensing_router,
    retention_router,
)
from services.model_gateway import get_model_gateway
from services.orchestration.engine import OrchestrationEngine
from services.reminder_scheduler import scheduler_instance
from services.retention_scheduler import retention_scheduler_instance
from services.research.job_service import ResearchJobService
from worker import get_worker_runner

settings = get_settings()
configure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup (ensuring dev SQLite / fallback is ready)
    await create_tables()
    # Reconcile dangling research jobs from previous sessions
    await ResearchJobService.recover_dangling_jobs()
    # Reconcile dangling orchestrated workflows from previous sessions
    await OrchestrationEngine.recover_dangling_workflows()
    # Reconcile dangling browser tasks from previous sessions
    worker_runner = get_worker_runner(
        headless=settings.browser_headless,
        allow_local=settings.allow_local_browser_targets,
        max_concurrency=settings.browser_worker_concurrency,
    )
    await worker_runner.recover_dangling_tasks()
    # Start background reminder scheduler
    scheduler_instance.start()
    # Start background 72-hour data retention scheduler
    retention_scheduler_instance.start()
    try:
        yield
    finally:
        # Graceful shutdown of schedulers
        await scheduler_instance.stop()
        await retention_scheduler_instance.stop()


app = FastAPI(
    title="Unified AI Assistant API",
    description="Core backend API service for Unified AI Assistant",
    version="0.1.0",
    lifespan=lifespan,
)

# Defensive security and operational middlewares
app.add_middleware(
    RateLimitingMiddleware,
    requests_per_minute=settings.rate_limit_per_minute,
    enabled=True,
)
app.add_middleware(
    PayloadSizeLimitMiddleware,
    max_body_bytes=settings.max_request_body_bytes,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestCorrelationMiddleware)

# Narrow CORS configuration for local development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount modular routers
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(providers_router)
app.include_router(browser_tasks_router)
app.include_router(tasks_router)
app.include_router(calendar_router)
app.include_router(reminders_router)
app.include_router(files_router)
app.include_router(knowledge_router)
app.include_router(research_router)
app.include_router(wifi_sensing_router)
app.include_router(orchestration_router)
app.include_router(retention_router)


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Operational status of the API")
    service: str = Field(default="unified-ai-assistant-api", description="Service identifier")
    version: str = Field(default="0.1.0", description="Service version")
    database: Optional[str] = Field(default="connected", description="Database connection state")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 UTC timestamp of check",
    )


class ReadinessResponse(BaseModel):
    status: str = Field(default="ready", description="Readiness status ('ready' or 'not_ready')")
    service: str = Field(default="unified-ai-assistant-api", description="Service identifier")
    database: str = Field(description="Database connectivity status")
    model_gateway: Dict[str, Any] = Field(description="AI Model Gateway configuration status")
    browser_worker: Dict[str, Any] = Field(description="Browser worker readiness status")
    scheduler: str = Field(description="Background scheduler state")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 UTC timestamp of readiness probe",
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Liveness probe endpoint verifying backend process is alive."""
    db_ok = await check_db_readiness()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
    )


@app.get("/ready", response_model=ReadinessResponse, tags=["Health"])
async def get_readiness():
    """Readiness probe endpoint verifying all critical subsystems and dependencies."""
    db_ok = await check_db_readiness()

    # Model gateway status
    gateway = get_model_gateway()
    gateway_status = gateway.get_status()

    # Browser worker status
    worker_runner = get_worker_runner(
        headless=settings.browser_headless,
        allow_local=settings.allow_local_browser_targets,
        max_concurrency=settings.browser_worker_concurrency,
    )
    worker_status = worker_runner.get_status()

    # Scheduler state
    scheduler_status = "running" if scheduler_instance._running else "stopped"

    is_ready = db_ok

    readiness_payload = ReadinessResponse(
        status="ready" if is_ready else "not_ready",
        database="connected" if db_ok else "disconnected",
        model_gateway={
            "default_provider": getattr(gateway_status, "active_provider", None) or getattr(gateway_status, "provider", None),
            "configured_providers": [p for p, enabled in getattr(gateway_status, "providers", {}).items() if enabled],
        },
        browser_worker={
            "available": worker_status.get("available", False),
            "worker_id": worker_status.get("worker_id"),
            "max_concurrency": worker_status.get("max_concurrency"),
        },
        scheduler=scheduler_status,
    )

    if not is_ready:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content=readiness_payload.model_dump(),
        )

    return readiness_payload


@app.get("/", tags=["Root"])
def get_root():
    """Root entrypoint returning basic service descriptor."""
    return {
        "service": "unified-ai-assistant-api",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_url": "/health",
        "conversations_url": "/api/conversations",
        "provider_status_url": "/api/provider/status",
        "chat_stream_url": "/api/chat/stream",
        "tasks_url": "/api/tasks",
        "calendar_events_url": "/api/calendar/events",
        "reminders_url": "/api/reminders",
        "files_url": "/api/files",
        "knowledge_search_url": "/api/knowledge/search",
        "knowledge_answer_url": "/api/knowledge/answer",
    }
