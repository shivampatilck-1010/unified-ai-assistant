from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from schemas.task import TaskPriority


class ExtractedTaskProposal(BaseModel):
    title: str = Field(..., description="Actionable title of proposed task")
    description: Optional[str] = Field(None, description="Detailed notes or context")
    priority: TaskPriority = Field("medium", description="Proposed priority level")
    due_date: Optional[datetime] = Field(None, description="Inferred due date/time (ISO 8601)")
    timezone: str = Field("UTC", description="Target timezone")


class ExtractedEventProposal(BaseModel):
    title: str = Field(..., description="Title of proposed calendar event")
    description: Optional[str] = Field(None, description="Event notes or description")
    start_time: datetime = Field(..., description="Inferred start time")
    end_time: datetime = Field(..., description="Inferred end time")
    timezone: str = Field("UTC", description="Event timezone")
    all_day: bool = Field(False, description="Whether event spans full day")
    location: Optional[str] = Field(None, description="Physical or virtual meeting location")
    recurrence_rule: Optional[str] = Field(None, description="Proposed RRULE string if recurring")


class ExtractedReminderProposal(BaseModel):
    title: str = Field(..., description="Subject of the reminder")
    scheduled_time: datetime = Field(..., description="When the reminder should fire")
    timezone: str = Field("UTC", description="Reminder timezone")


class ExtractRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Natural language prompt describing tasks, events, or reminders")
    reference_time: Optional[datetime] = Field(None, description="Client reference timestamp for relative date resolution")
    timezone: Optional[str] = Field("UTC", description="Client IANA timezone, e.g. America/New_York")
    conversation_id: Optional[str] = Field(None, description="Optional conversation context")
    message_id: Optional[str] = Field(None, description="Optional message context")


class ExtractResponse(BaseModel):
    tasks: List[ExtractedTaskProposal] = Field(default_factory=list)
    events: List[ExtractedEventProposal] = Field(default_factory=list)
    reminders: List[ExtractedReminderProposal] = Field(default_factory=list)
    reference_time: datetime
    timezone: str
    explanation: Optional[str] = None
    requires_confirmation: bool = True
