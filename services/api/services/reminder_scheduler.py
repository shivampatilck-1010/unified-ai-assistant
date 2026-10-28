import asyncio
from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_factory
from models.reminder import Reminder

logger = logging.getLogger("reminder_scheduler")

MAX_DELIVERY_ATTEMPTS = 3
POLL_INTERVAL_SECONDS = 5


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReminderScheduler:
    def __init__(self, poll_interval: float = POLL_INTERVAL_SECONDS):
        self.poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop(), name="reminder-scheduler")
        logger.info("ReminderScheduler started with %ss polling interval", self.poll_interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("ReminderScheduler stopped")

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                await self.tick()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in reminder scheduler tick: %s", e, exc_info=True)

            try:
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break

    async def tick(self) -> int:
        """
        Processes any overdue scheduled reminders.
        Returns the number of reminders successfully processed.
        """
        now = utc_now()
        async with async_session_factory() as db:
            # 1. Find candidates due for delivery
            stmt = select(Reminder.id).where(
                Reminder.status == "scheduled",
                Reminder.scheduled_time <= now,
            ).order_by(Reminder.scheduled_time.asc()).limit(50)

            result = await db.execute(stmt)
            candidate_ids = list(result.scalars().all())

            if not candidate_ids:
                return 0

            processed_count = 0
            for rem_id in candidate_ids:
                # 2. Atomic claim: transition scheduled -> processing
                claim_stmt = (
                    update(Reminder)
                    .where(
                        Reminder.id == rem_id,
                        Reminder.status == "scheduled",
                    )
                    .values(
                        status="processing",
                        delivery_attempts=Reminder.delivery_attempts + 1,
                        updated_at=now,
                    )
                )
                claim_res = await db.execute(claim_stmt)
                await db.commit()

                if claim_res.rowcount == 0:
                    # Claimed by another worker or updated in parallel
                    continue

                # 3. Deliver (internal in-app reminder)
                try:
                    # Mark delivered
                    deliver_stmt = (
                        update(Reminder)
                        .where(Reminder.id == rem_id)
                        .values(
                            status="delivered",
                            delivered_at=utc_now(),
                            updated_at=utc_now(),
                        )
                    )
                    await db.execute(deliver_stmt)
                    await db.commit()
                    processed_count += 1
                    logger.info("Reminder %s successfully delivered", rem_id)
                except Exception as exc:
                    logger.error("Failed delivering reminder %s: %s", rem_id, exc)
                    # Check retry attempts
                    rem_stmt = select(Reminder).where(Reminder.id == rem_id)
                    rem = (await db.execute(rem_stmt)).scalar_one_or_none()
                    if rem:
                        if rem.delivery_attempts >= MAX_DELIVERY_ATTEMPTS:
                            rem.status = "failed"
                        else:
                            rem.status = "scheduled"
                        rem.last_error = str(exc)
                        rem.updated_at = utc_now()
                        await db.commit()

            return processed_count


scheduler_instance = ReminderScheduler()
