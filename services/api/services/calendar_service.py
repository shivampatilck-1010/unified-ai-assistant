from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.calendar_event import CalendarEvent
from schemas.calendar_event import (
    CalendarEventCreate,
    CalendarEventOccurrence,
    CalendarEventUpdate,
)
from services.calendar_utils import (
    ensure_utc,
    expand_recurrence,
    parse_rrule,
    validate_timezone,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CalendarService:
    @staticmethod
    async def create_event(
        db: AsyncSession,
        owner_id: str,
        data: CalendarEventCreate,
    ) -> CalendarEvent:
        tz = validate_timezone(data.timezone)
        start_utc = ensure_utc(data.start_time, tz)
        end_utc = ensure_utc(data.end_time, tz)

        if end_utc < start_utc:
            raise ValueError("end_time cannot be earlier than start_time.")

        if data.recurrence_rule:
            # Validate RRULE syntax and bounds
            parse_rrule(data.recurrence_rule)

        event = CalendarEvent(
            owner_id=owner_id,
            title=data.title.strip(),
            description=data.description.strip() if data.description else None,
            start_time=start_utc,
            end_time=end_utc,
            timezone=tz,
            all_day=data.all_day,
            location=data.location.strip() if data.location else None,
            recurrence_rule=data.recurrence_rule.strip() if data.recurrence_rule else None,
            color=data.color.strip() if data.color else None,
            conversation_id=data.conversation_id,
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        return event

    @staticmethod
    async def get_event(
        db: AsyncSession,
        owner_id: str,
        event_id: str,
    ) -> Optional[CalendarEvent]:
        stmt = select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.owner_id == owner_id,
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_events_in_range(
        db: AsyncSession,
        owner_id: str,
        range_start: datetime,
        range_end: datetime,
    ) -> Tuple[List[CalendarEvent], List[CalendarEventOccurrence]]:
        r_start_utc = ensure_utc(range_start)
        r_end_utc = ensure_utc(range_end)

        # Non-recurring: overlap window (start <= r_end and end >= r_start)
        # Recurring: start_time <= r_end
        stmt = select(CalendarEvent).where(
            CalendarEvent.owner_id == owner_id,
            or_(
                # Non-recurring overlapping
                (CalendarEvent.recurrence_rule.is_(None) & (CalendarEvent.start_time <= r_end_utc) & (CalendarEvent.end_time >= r_start_utc)),
                # Recurring that started before or within the window
                (CalendarEvent.recurrence_rule.is_not(None) & (CalendarEvent.start_time <= r_end_utc)),
            ),
        ).order_by(CalendarEvent.start_time.asc())

        result = await db.execute(stmt)
        events = list(result.scalars().all())

        occurrences: List[CalendarEventOccurrence] = []
        for ev in events:
            if ev.recurrence_rule:
                expanded = expand_recurrence(
                    start_time=ev.start_time,
                    end_time=ev.end_time,
                    rrule_str=ev.recurrence_rule,
                    window_start=r_start_utc,
                    window_end=r_end_utc,
                )
                for occ_start, occ_end in expanded:
                    occurrences.append(
                        CalendarEventOccurrence(
                            event_id=ev.id,
                            title=ev.title,
                            description=ev.description,
                            start_time=occ_start,
                            end_time=occ_end,
                            timezone=ev.timezone,
                            all_day=ev.all_day,
                            location=ev.location,
                            color=ev.color,
                            is_recurring=True,
                            recurrence_rule=ev.recurrence_rule,
                        )
                    )
            else:
                occurrences.append(
                    CalendarEventOccurrence(
                        event_id=ev.id,
                        title=ev.title,
                        description=ev.description,
                        start_time=ev.start_time,
                        end_time=ev.end_time,
                        timezone=ev.timezone,
                        all_day=ev.all_day,
                        location=ev.location,
                        color=ev.color,
                        is_recurring=False,
                        recurrence_rule=None,
                    )
                )

        # Sort occurrences chronologically
        occurrences.sort(key=lambda o: o.start_time)
        return events, occurrences

    @staticmethod
    async def update_event(
        db: AsyncSession,
        owner_id: str,
        event_id: str,
        data: CalendarEventUpdate,
    ) -> Optional[CalendarEvent]:
        event = await CalendarService.get_event(db, owner_id, event_id)
        if not event:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        tz = validate_timezone(update_dict.get("timezone", event.timezone))

        if "title" in update_dict and update_dict["title"] is not None:
            event.title = update_dict["title"].strip()
        if "description" in update_dict:
            event.description = update_dict["description"].strip() if update_dict["description"] else None
        if "all_day" in update_dict and update_dict["all_day"] is not None:
            event.all_day = update_dict["all_day"]
        if "location" in update_dict:
            event.location = update_dict["location"].strip() if update_dict["location"] else None
        if "color" in update_dict:
            event.color = update_dict["color"].strip() if update_dict["color"] else None
        if "conversation_id" in update_dict:
            event.conversation_id = update_dict["conversation_id"]

        new_start = event.start_time
        new_end = event.end_time

        if "start_time" in update_dict and update_dict["start_time"] is not None:
            new_start = ensure_utc(update_dict["start_time"], tz)
        if "end_time" in update_dict and update_dict["end_time"] is not None:
            new_end = ensure_utc(update_dict["end_time"], tz)

        if new_end < new_start:
            raise ValueError("end_time cannot be earlier than start_time.")

        event.start_time = new_start
        event.end_time = new_end
        event.timezone = tz

        if "recurrence_rule" in update_dict:
            rrule_val = update_dict["recurrence_rule"]
            if rrule_val:
                parse_rrule(rrule_val)
                event.recurrence_rule = rrule_val.strip()
            else:
                event.recurrence_rule = None

        event.updated_at = utc_now()
        await db.commit()
        await db.refresh(event)
        return event

    @staticmethod
    async def delete_event(db: AsyncSession, owner_id: str, event_id: str) -> bool:
        event = await CalendarService.get_event(db, owner_id, event_id)
        if not event:
            return False
        await db.delete(event)
        await db.commit()
        return True
