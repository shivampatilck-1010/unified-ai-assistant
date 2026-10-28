from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.calendar_event import CalendarEvent
from models.reminder import Reminder
from models.task import Task
from schemas.reminder import ReminderCreate, ReminderUpdate
from services.calendar_utils import ensure_utc, validate_timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReminderService:
    @staticmethod
    async def create_reminder(
        db: AsyncSession,
        owner_id: str,
        data: ReminderCreate,
    ) -> Reminder:
        # Check idempotency key if specified
        if data.idempotency_key:
            stmt = select(Reminder).where(
                Reminder.owner_id == owner_id,
                Reminder.idempotency_key == data.idempotency_key,
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()
            if existing:
                return existing

        # Validate linked task ownership
        if data.task_id:
            task_stmt = select(Task).where(Task.id == data.task_id, Task.owner_id == owner_id)
            task = (await db.execute(task_stmt)).scalar_one_or_none()
            if not task:
                raise ValueError("Linked task not found or unauthorized.")

        # Validate linked event ownership
        if data.event_id:
            event_stmt = select(CalendarEvent).where(CalendarEvent.id == data.event_id, CalendarEvent.owner_id == owner_id)
            event = (await db.execute(event_stmt)).scalar_one_or_none()
            if not event:
                raise ValueError("Linked event not found or unauthorized.")

        tz = validate_timezone(data.timezone)
        sched_utc = ensure_utc(data.scheduled_time, tz)

        reminder = Reminder(
            owner_id=owner_id,
            title=data.title.strip(),
            task_id=data.task_id,
            event_id=data.event_id,
            scheduled_time=sched_utc,
            timezone=tz,
            status="scheduled",
            idempotency_key=data.idempotency_key.strip() if data.idempotency_key else None,
        )
        db.add(reminder)
        await db.commit()
        await db.refresh(reminder)
        return reminder

    @staticmethod
    async def get_reminder(
        db: AsyncSession,
        owner_id: str,
        reminder_id: str,
    ) -> Optional[Reminder]:
        stmt = select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.owner_id == owner_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_reminders(
        db: AsyncSession,
        owner_id: str,
        status: Optional[str] = None,
        active_only: bool = False,
        limit: int = 100,
    ) -> Tuple[List[Reminder], int]:
        query = select(Reminder).where(Reminder.owner_id == owner_id)

        if active_only:
            query = query.where(Reminder.status.in_(["scheduled", "delivered"]))
        elif status:
            query = query.where(Reminder.status == status)

        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar_one() or 0

        query = query.order_by(Reminder.scheduled_time.asc()).limit(limit)
        items = list((await db.execute(query)).scalars().all())
        return items, total

    @staticmethod
    async def update_reminder(
        db: AsyncSession,
        owner_id: str,
        reminder_id: str,
        data: ReminderUpdate,
    ) -> Optional[Reminder]:
        reminder = await ReminderService.get_reminder(db, owner_id, reminder_id)
        if not reminder:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        tz = validate_timezone(update_dict.get("timezone", reminder.timezone))

        if "title" in update_dict and update_dict["title"] is not None:
            reminder.title = update_dict["title"].strip()
        if "timezone" in update_dict and update_dict["timezone"] is not None:
            reminder.timezone = tz
        if "scheduled_time" in update_dict and update_dict["scheduled_time"] is not None:
            reminder.scheduled_time = ensure_utc(update_dict["scheduled_time"], tz)
        if "status" in update_dict and update_dict["status"] is not None:
            new_status = update_dict["status"]
            if new_status == "dismissed":
                reminder.dismissed_at = utc_now()
            elif new_status == "delivered":
                reminder.delivered_at = utc_now()
            reminder.status = new_status

        reminder.updated_at = utc_now()
        await db.commit()
        await db.refresh(reminder)
        return reminder

    @staticmethod
    async def dismiss_reminder(
        db: AsyncSession,
        owner_id: str,
        reminder_id: str,
    ) -> Optional[Reminder]:
        reminder = await ReminderService.get_reminder(db, owner_id, reminder_id)
        if not reminder:
            return None
        reminder.status = "dismissed"
        reminder.dismissed_at = utc_now()
        reminder.updated_at = utc_now()
        await db.commit()
        await db.refresh(reminder)
        return reminder

    @staticmethod
    async def delete_reminder(
        db: AsyncSession,
        owner_id: str,
        reminder_id: str,
    ) -> bool:
        reminder = await ReminderService.get_reminder(db, owner_id, reminder_id)
        if not reminder:
            return False
        await db.delete(reminder)
        await db.commit()
        return True
