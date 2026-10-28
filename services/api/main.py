import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Ensure services/api and services/agent-worker are in sys.path when imported
_api_dir = str(Path(__file__).resolve().parent)
if _api_dir not in sys.path:
    sys.path.insert(0, _api_dir)

_worker_dir = str(Path(__file__).resolve().parent.parent / "agent-worker")
if _worker_dir not in sys.path:
    sys.path.insert(0, _worker_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import get_settings
from database import check_db_readiness, create_tables
from routers import browser_tasks_router, chat_router, conversations_router, providers_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup (ensuring dev SQLite / fallback is ready)
    await create_tables()
    yield


app = FastAPI(
    title="Unified AI Assistant API",
    description="Core backend API service for Unified AI Assistant",
    version="0.1.0",
    lifespan=lifespan,
)

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


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Operational status of the API")
    service: str = Field(default="unified-ai-assistant-api", description="Service identifier")
    version: str = Field(default="0.1.0", description="Service version")
    database: Optional[str] = Field(default="connected", description="Database connection state")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 UTC timestamp of check",
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def get_health() -> HealthResponse:
    """Basic health check endpoint verifying backend and database operational readiness."""
    db_ok = await check_db_readiness()
    return HealthResponse(
        status="ok" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
    )


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
    }
