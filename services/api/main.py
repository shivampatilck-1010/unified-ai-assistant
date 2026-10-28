import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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


# ---------------------------------------------------------------------------
# SSE Streaming Models
# ---------------------------------------------------------------------------


class SSEEventType(str, Enum):
    MESSAGE_START = "message_start"
    TEXT_DELTA = "text_delta"
    MESSAGE_COMPLETE = "message_complete"
    ERROR = "error"


class ChatMessage(BaseModel):
    role: str = Field(description="Message role: 'user' or 'assistant'")
    content: str = Field(description="Message text content")


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = Field(default=None, description="Existing conversation ID, or null for new")
    message: str = Field(min_length=1, max_length=32000, description="User message content")


class SSEEvent(BaseModel):
    event: SSEEventType
    conversation_id: str
    message_id: str
    data: dict = Field(default_factory=dict)


class ProviderConfigStatus(BaseModel):
    configured: bool = Field(default=False)
    provider: Optional[str] = Field(default=None)
    message: str = Field(default="No AI provider configured")


# ---------------------------------------------------------------------------
# SSE Helpers
# ---------------------------------------------------------------------------

_PROVIDER_ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
_PROVIDER_NAMES = {"OPENAI_API_KEY": "openai", "ANTHROPIC_API_KEY": "anthropic", "GEMINI_API_KEY": "gemini"}


def format_sse(event_type: str | SSEEventType, data: dict) -> str:
    etype = event_type.value if isinstance(event_type, SSEEventType) else event_type
    return f"event: {etype}\ndata: {json.dumps(data)}\n\n"


def _detect_provider() -> Optional[str]:
    """Return the name of the first configured provider, or None."""
    for key in _PROVIDER_ENV_KEYS:
        if os.environ.get(key):
            return _PROVIDER_NAMES[key]
    return None


# ---------------------------------------------------------------------------
# SSE Streaming Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/provider/status", response_model=ProviderConfigStatus, tags=["Provider"])
def get_provider_status() -> ProviderConfigStatus:
    """Check whether an AI provider API key is configured."""
    provider = _detect_provider()
    if provider:
        return ProviderConfigStatus(configured=True, provider=provider, message=f"{provider} provider configured")
    return ProviderConfigStatus()


@app.post("/api/chat/stream", tags=["Chat"])
async def chat_stream(request: ChatRequest):
    """Stream chat responses as Server-Sent Events."""
    conversation_id = request.conversation_id or str(uuid.uuid4())
    message_id = str(uuid.uuid4())

    provider = _detect_provider()

    async def _generate():
        # Always emit message_start
        yield format_sse(
            SSEEventType.MESSAGE_START,
            SSEEvent(event=SSEEventType.MESSAGE_START, conversation_id=conversation_id, message_id=message_id).model_dump(),
        )

        if provider is None:
            # No provider configured – emit error then complete
            yield format_sse(
                SSEEventType.ERROR,
                SSEEvent(
                    event=SSEEventType.ERROR,
                    conversation_id=conversation_id,
                    message_id=message_id,
                    data={
                        "code": "PROVIDER_NOT_CONFIGURED",
                        "message": "No AI model provider is configured. Add an API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) to the server environment to enable AI responses.",
                    },
                ).model_dump(),
            )
            yield format_sse(
                SSEEventType.MESSAGE_COMPLETE,
                SSEEvent(
                    event=SSEEventType.MESSAGE_COMPLETE,
                    conversation_id=conversation_id,
                    message_id=message_id,
                    data={"finish_reason": "error"},
                ).model_dump(),
            )
            return

        # If a provider IS configured, future AI integration will go here.
        # For now we simply complete without streaming any text.
        yield format_sse(
            SSEEventType.MESSAGE_COMPLETE,
            SSEEvent(
                event=SSEEventType.MESSAGE_COMPLETE,
                conversation_id=conversation_id,
                message_id=message_id,
                data={"finish_reason": "end_turn"},
            ).model_dump(),
        )

    return StreamingResponse(_generate(), media_type="text/event-stream")
