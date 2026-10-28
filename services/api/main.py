from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Unified AI Assistant API",
    description="Core backend API service for Unified AI Assistant",
    version="0.1.0",
)

# Allow local frontend during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str = Field(default="ok", description="Operational status of the API")
    service: str = Field(default="unified-ai-assistant-api", description="Service identifier")
    version: str = Field(default="0.1.0", description="Service version")
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO 8601 UTC timestamp of check",
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def get_health() -> HealthResponse:
    """Basic health check endpoint to verify backend operational readiness."""
    return HealthResponse()


@app.get("/", tags=["Root"])
def get_root():
    """Root entrypoint returning basic service descriptor."""
    return {
        "service": "unified-ai-assistant-api",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }
