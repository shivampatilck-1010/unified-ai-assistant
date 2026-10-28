from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.reminder import (
    ReminderCreate,
    ReminderListResponse,
    ReminderResponse,
    ReminderUpdate,
)
from services.reminder_service import ReminderService

router = APIRouter(prefix="/api/reminders", tags=["Reminders"])


@router.post("", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    payload: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ReminderResponse:
    """Create a new internal reminder."""
    try:
        reminder = await ReminderService.create_reminder(db, owner_id=user_id, data=payload)
        return ReminderResponse.model_validate(reminder)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=ReminderListResponse)
async def list_reminders(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    active_only: bool = Query(False, description="Filter for scheduled or delivered active reminders"),
    limit: int = Query(100, ge=1, le=200, description="Max reminders to return"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ReminderListResponse:
    """List reminders owned by the current user."""
    items, total = await ReminderService.list_reminders(
        db,
        owner_id=user_id,
        status=status_filter,
        active_only=active_only,
        limit=limit,
    )
    return ReminderListResponse(
        items=[ReminderResponse.model_validate(rem) for rem in items],
        total=total,
    )


@router.get("/{reminder_id}", response_model=ReminderResponse)
async def get_reminder(
    reminder_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ReminderResponse:
    """Retrieve a single reminder by ID."""
    reminder = await ReminderService.get_reminder(db, owner_id=user_id, reminder_id=reminder_id)
    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return ReminderResponse.model_validate(reminder)


@router.patch("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ReminderResponse:
    """Update a reminder."""
    try:
        reminder = await ReminderService.update_reminder(db, owner_id=user_id, reminder_id=reminder_id, data=payload)
        if not reminder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
        return ReminderResponse.model_validate(reminder)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{reminder_id}/dismiss", response_model=ReminderResponse)
async def dismiss_reminder(
    reminder_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ReminderResponse:
    """Dismiss an active or delivered reminder."""
    reminder = await ReminderService.dismiss_reminder(db, owner_id=user_id, reminder_id=reminder_id)
    if not reminder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
    return ReminderResponse.model_validate(reminder)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(
    reminder_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a reminder owned by the user."""
    deleted = await ReminderService.delete_reminder(db, owner_id=user_id, reminder_id=reminder_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reminder not found")
