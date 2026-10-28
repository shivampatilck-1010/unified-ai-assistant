from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from schemas.message import MessageResponse


class ConversationCreate(BaseModel):
    title: Optional[str] = Field(default="New conversation", max_length=255, description="Initial conversation title")


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=255, description="Updated conversation title")


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: Optional[int] = 0


class ConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[MessageResponse] = Field(default_factory=list)


class ConversationListResponse(BaseModel):
    items: List[ConversationSummary]
    total: int
    limit: int
    offset: int


class SearchMatch(BaseModel):
    conversation_id: str
    conversation_title: str
    matched_type: str  # 'title' or 'message'
    message_id: Optional[str] = None
    snippet: str
    created_at: datetime


class SearchResponse(BaseModel):
    query: str
    matches: List[SearchMatch]
    total: int
