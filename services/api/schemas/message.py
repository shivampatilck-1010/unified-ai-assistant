from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class MessageBase(BaseModel):
    role: str = Field(description="Role: 'user' or 'assistant'")
    content: str = Field(min_length=1, max_length=32000, description="Message text content")


class MessageCreate(MessageBase):
    pass


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: str
    content: str
    status: str
    provider: Optional[str] = None
    model: Optional[str] = None
    created_at: datetime
