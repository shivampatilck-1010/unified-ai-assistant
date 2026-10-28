from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CalendarEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Event title")
    description: Optional[str] = Field(None, description="Event notes or description")
    start_time: datetime = Field(..., description="Event start timestamp")
    end_time: datetime = Field(..., description="Event end timestamp")
    timezone: str = Field("UTC", description="Event timezone (IANA format)")
    all_day: bool = Field(False, description="Whether this is an all-day event")
    location: Optional[str] = Field(None, max_length=255, description="Physical or virtual location")
    recurrence_rule: Optional[str] = Field(None, description="Bounded iCalendar RRULE, e.g. FREQ=WEEKLY;INTERVAL=1;COUNT=10")
    color: Optional[str] = Field(None, max_length=32, description="Event display color token")
    conversation_id: Optional[str] = Field(None, description="Linked conversation ID")

    @model_validator(mode="after")
    def validate_time_range(self) -> "CalendarEventCreate":
        if self.end_time < self.start_time:
            raise ValueError("end_time cannot be earlier than start_time.")
        return self


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    timezone: Optional[str] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    recurrence_rule: Optional[str] = None
    color: Optional[str] = None
    conversation_id: Optional[str] = None

    @model_validator(mode="after")
    def validate_time_range(self) -> "CalendarEventUpdate":
        if self.start_time is not None and self.end_time is not None:
            if self.end_time < self.start_time:
                raise ValueError("end_time cannot be earlier than start_time.")
        return self


class CalendarEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    timezone: str = "UTC"
    all_day: bool = False
    location: Optional[str] = None
    recurrence_rule: Optional[str] = None
    color: Optional[str] = None
    conversation_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CalendarEventOccurrence(BaseModel):
    event_id: str
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    timezone: str = "UTC"
    all_day: bool = False
    location: Optional[str] = None
    color: Optional[str] = None
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None


class CalendarEventsQueryResponse(BaseModel):
    events: List[CalendarEventResponse]
    occurrences: List[CalendarEventOccurrence]
