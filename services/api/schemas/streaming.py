from enum import Enum
from typing import Any, Dict, List, Optional
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
    use_knowledge: Optional[bool] = Field(default=False, description="Whether to ground answer in indexed document knowledge")
    selected_file_ids: Optional[List[str]] = Field(default=None, description="Optional target file IDs for document grounding")


class SSEEventPayload(BaseModel):
    event: SSEEventType
    conversation_id: str
    message_id: str
    data: Dict[str, Any] = Field(default_factory=dict)
