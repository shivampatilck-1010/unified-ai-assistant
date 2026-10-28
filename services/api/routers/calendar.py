from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventResponse,
    CalendarEventsQueryResponse,
    CalendarEventUpdate,
)
from services.calendar_service import CalendarService

router = APIRouter(prefix="/api/calendar", tags=["Calendar"])


def default_window() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    return now - timedelta(days=15), now + timedelta(days=45)


@router.post("/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    payload: CalendarEventCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CalendarEventResponse:
    """Create a new calendar event with optional bounded recurrence."""
    try:
        event = await CalendarService.create_event(db, owner_id=user_id, data=payload)
        return CalendarEventResponse.model_validate(event)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/events", response_model=CalendarEventsQueryResponse)
async def list_calendar_events(
    start: Optional[datetime] = Query(None, description="Window start timestamp (ISO 8601)"),
    end: Optional[datetime] = Query(None, description="Window end timestamp (ISO 8601)"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CalendarEventsQueryResponse:
    """Query events and expanded occurrences within a date window."""
    def_start, def_end = default_window()
    range_start = start or def_start
    range_end = end or def_end

    if range_end < range_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query window 'end' cannot be earlier than 'start'.",
        )

    events, occurrences = await CalendarService.list_events_in_range(
        db,
        owner_id=user_id,
        range_start=range_start,
        range_end=range_end,
    )

    return CalendarEventsQueryResponse(
        events=[CalendarEventResponse.model_validate(ev) for ev in events],
        occurrences=occurrences,
    )


@router.get("/events/{event_id}", response_model=CalendarEventResponse)
async def get_calendar_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CalendarEventResponse:
    """Retrieve an event by ID within the user's boundary."""
    event = await CalendarService.get_event(db, owner_id=user_id, event_id=event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
    return CalendarEventResponse.model_validate(event)


@router.patch("/events/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: str,
    payload: CalendarEventUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CalendarEventResponse:
    """Update event properties."""
    try:
        event = await CalendarService.update_event(db, owner_id=user_id, event_id=event_id, data=payload)
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
        return CalendarEventResponse.model_validate(event)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a calendar event owned by the user."""
    deleted = await CalendarService.delete_event(db, owner_id=user_id, event_id=event_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
