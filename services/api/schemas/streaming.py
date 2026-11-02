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
    use_research: Optional[bool] = Field(default=False, description="Whether to invoke autonomous web research and synthesis")
    research_depth: Optional[str] = Field(default="standard", description="Research depth: quick, standard, deep")
    use_sensing: Optional[bool] = Field(default=False, description="Whether to ground answer in Wi-Fi sensing status/occupancy")
    sensing_room_id: Optional[str] = Field(default=None, description="Optional target room ID for sensing queries")
    use_orchestration: Optional[bool] = Field(default=False, description="Whether to invoke unified multi-capability orchestration engine")
    project_id: Optional[str] = Field(default=None, description="Optional project context to scope system guidance and memory")


class SSEEventPayload(BaseModel):
    event: SSEEventType
    conversation_id: str
    message_id: str
    data: Dict[str, Any] = Field(default_factory=dict)
