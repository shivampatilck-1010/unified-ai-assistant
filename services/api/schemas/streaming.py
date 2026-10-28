from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class SSEEventType(str, Enum):
    MESSAGE_START = "message_start"
    TEXT_DELTA = "text_delta"
    MESSAGE_COMPLETE = "message_complete"
    ERROR = "error"


class ChatStreamRequest(BaseModel):
    conversation_id: Optional[str] = Field(default=None, description="Existing conversation ID, or null to create new")
    message: str = Field(min_length=1, max_length=32000, description="User message content")
    provider: Optional[str] = Field(default=None, description="Requested provider: openai, anthropic, gemini")
    model: Optional[str] = Field(default=None, description="Requested model ID")


class SSEEventPayload(BaseModel):
    event: SSEEventType
    conversation_id: str
    message_id: str
    data: Dict[str, Any] = Field(default_factory=dict)
