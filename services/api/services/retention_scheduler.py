import asyncio
import logging
from typing import Optional

from database import async_session_factory
from services.data_retention_service import DataRetentionService

logger = logging.getLogger("retention_scheduler")


class RetentionScheduler:
    """Background task runner that executes periodic 72-hour data retention cleanups."""

    def __init__(self, interval_seconds: int = 1800):
        self.interval_seconds = interval_seconds
        self._task: Optional[asyncio.Task] = None
        self._running = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("RetentionScheduler started with %ds interval", self.interval_seconds)

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("RetentionScheduler stopped")

    async def run_once(self) -> None:
        """Executes a single cleanup cycle."""
        async with async_session_factory() as db:
            try:
                await DataRetentionService.cleanup_expired_data(db)
            except Exception as exc:
                logger.error("RetentionScheduler run_once failed: %s", exc)

    async def _run_loop(self) -> None:
        # Run once shortly after startup (after 5 seconds to let server settle)
        try:
            await asyncio.sleep(5)
            await self.run_once()
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.error("Initial retention cleanup failed: %s", exc)

        while self._running:
            try:
                await asyncio.sleep(self.interval_seconds)
                if not self._running:
                    break
                await self.run_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Periodic retention cleanup error: %s", exc)


retention_scheduler_instance = RetentionScheduler()
