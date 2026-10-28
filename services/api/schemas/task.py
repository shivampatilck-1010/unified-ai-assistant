from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

TaskPriority = Literal["low", "medium", "high", "urgent"]
TaskStatus = Literal["pending", "in_progress", "completed", "cancelled"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the task")
    description: Optional[str] = Field(None, description="Detailed task description")
    priority: TaskPriority = Field("medium", description="Priority level")
    status: TaskStatus = Field("pending", description="Initial task status")
    due_date: Optional[datetime] = Field(None, description="Due date/time with optional timezone")
    start_date: Optional[datetime] = Field(None, description="Target start date/time")
    timezone: Optional[str] = Field("UTC", description="User local timezone")
    conversation_id: Optional[str] = Field(None, description="Linked conversation ID")
    message_id: Optional[str] = Field(None, description="Originating message ID")


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    timezone: Optional[str] = None
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    timezone: Optional[str] = "UTC"
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class TaskListResponse(BaseModel):
    items: List[TaskResponse]
    total: int
    page: int
    page_size: int
