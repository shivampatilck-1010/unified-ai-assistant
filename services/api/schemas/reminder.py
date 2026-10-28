from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

ReminderStatus = Literal["scheduled", "processing", "delivered", "dismissed", "failed"]


class ReminderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Reminder subject/title")
    scheduled_time: datetime = Field(..., description="Timestamp when reminder triggers")
    timezone: str = Field("UTC", description="Timezone name")
    task_id: Optional[str] = Field(None, description="Optional linked task ID")
    event_id: Optional[str] = Field(None, description="Optional linked event ID")
    idempotency_key: Optional[str] = Field(None, max_length=128, description="Optional client idempotency key")


class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    scheduled_time: Optional[datetime] = None
    timezone: Optional[str] = None
    status: Optional[ReminderStatus] = None


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    scheduled_time: datetime
    timezone: str = "UTC"
    status: str
    delivery_attempts: int
    last_error: Optional[str] = None
    delivered_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None
    idempotency_key: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReminderListResponse(BaseModel):
    items: List[ReminderResponse]
    total: int
