import asyncio
from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.browser_task import BrowserTask
from models.conversation import Conversation
from models.file_record import FileRecord
from models.research import ResearchJob
from models.wifi_sensing import WifiSensingEvent, WifiSensorConfig
from models.workflow import Workflow
from services.file_storage import get_storage_backend

logger = logging.getLogger("data_retention")

RETENTION_HOURS = 72  # 3 days inactivity lifecycle


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def calculate_expiry(from_time: Optional[datetime] = None, hours: int = RETENTION_HOURS) -> datetime:
    base = from_time or utc_now()
    return base + timedelta(hours=hours)


class DataRetentionService:
    """Enforces mandatory 72-hour (3-day) data retention and privacy lifecycle."""

    @classmethod
    async def cleanup_expired_data(cls, db: AsyncSession) -> Dict[str, Any]:
        """Finds and purges all records whose expires_at timestamp has passed.

        Idempotent and safe to run on an hourly schedule or server startup.
        Deletes physical storage files when file records expire.
        """
        now = utc_now()
        results: Dict[str, Any] = {
            "timestamp": now.isoformat(),
            "expired_conversations": 0,
            "expired_files": 0,
            "physical_files_deleted": 0,
            "expired_sensing_events": 0,
            "expired_browser_tasks": 0,
            "expired_research_jobs": 0,
            "expired_workflows": 0,
        }

        # 1. Expired Conversations (cascades Messages)
        try:
            conv_stmt = select(Conversation.id).where(Conversation.expires_at <= now)
            conv_res = await db.execute(conv_stmt)
            expired_conv_ids = [row[0] for row in conv_res.fetchall()]

            if expired_conv_ids:
                del_conv_stmt = delete(Conversation).where(Conversation.id.in_(expired_conv_ids))
                del_res = await db.execute(del_conv_stmt)
                results["expired_conversations"] = del_res.rowcount or len(expired_conv_ids)
        except Exception as exc:
            logger.error("Error cleaning up expired conversations: %s", exc)

        # 2. Expired Files (cascades DocumentChunks and purges physical storage)
        try:
            file_stmt = select(FileRecord).where(FileRecord.expires_at <= now)
            file_res = await db.execute(file_stmt)
            expired_files: List[FileRecord] = list(file_res.scalars().all())

            if expired_files:
                storage = get_storage_backend()
                physical_deleted = 0
                for f_rec in expired_files:
                    storage_path = f_rec.storage_path
                    # Check reference count to ensure file deduplication safety
                    ref_stmt = select(func.count(FileRecord.id)).where(
                        FileRecord.storage_path == storage_path,
                        FileRecord.id != f_rec.id,
                    )
                    other_refs = (await db.execute(ref_stmt)).scalar_one() or 0
                    if other_refs == 0:
                        try:
                            storage.delete_file(storage_path)
                            physical_deleted += 1
                        except Exception as storage_exc:
                            logger.warning("Could not delete physical file '%s': %s", storage_path, storage_exc)

                    await db.delete(f_rec)

                results["expired_files"] = len(expired_files)
                results["physical_files_deleted"] = physical_deleted
        except Exception as exc:
            logger.error("Error cleaning up expired files: %s", exc)

        # 3. Expired Wi-Fi Sensing Events
        try:
            del_events_stmt = delete(WifiSensingEvent).where(WifiSensingEvent.expires_at <= now)
            del_ev_res = await db.execute(del_events_stmt)
            results["expired_sensing_events"] = del_ev_res.rowcount or 0
        except Exception as exc:
            logger.error("Error cleaning up expired sensing events: %s", exc)

        # 4. Expired Browser Tasks (cascades Events)
        try:
            del_bt_stmt = delete(BrowserTask).where(BrowserTask.expires_at <= now)
            del_bt_res = await db.execute(del_bt_stmt)
            results["expired_browser_tasks"] = del_bt_res.rowcount or 0
        except Exception as exc:
            logger.error("Error cleaning up expired browser tasks: %s", exc)

        # 5. Expired Research Jobs (cascades Sources & Events)
        try:
            del_rj_stmt = delete(ResearchJob).where(ResearchJob.expires_at <= now)
            del_rj_res = await db.execute(del_rj_stmt)
            results["expired_research_jobs"] = del_rj_res.rowcount or 0
        except Exception as exc:
            logger.error("Error cleaning up expired research jobs: %s", exc)

        # 6. Expired Workflows (cascades Steps & Events)
        try:
            del_wf_stmt = delete(Workflow).where(Workflow.expires_at <= now)
            del_wf_res = await db.execute(del_wf_stmt)
            results["expired_workflows"] = del_wf_res.rowcount or 0
        except Exception as exc:
            logger.error("Error cleaning up expired workflows: %s", exc)

        await db.commit()
        logger.info(
            "Data retention cleanup completed: purged %d convs, %d files (%d disk files), %d sensing events, %d tasks/jobs/workflows",
            results["expired_conversations"],
            results["expired_files"],
            results["physical_files_deleted"],
            results["expired_sensing_events"],
            results["expired_browser_tasks"] + results["expired_research_jobs"] + results["expired_workflows"],
        )
        return results

    @classmethod
    async def get_retention_status(cls, db: AsyncSession, owner_id: str) -> Dict[str, Any]:
        """Returns the retention policy summary and active user data expiry status."""
        now = utc_now()

        # Counts
        conv_count = (await db.execute(
            select(func.count(Conversation.id)).where(Conversation.owner_id == owner_id)
        )).scalar_one() or 0

        file_count_stmt = select(
            func.count(FileRecord.id),
            func.coalesce(func.sum(FileRecord.file_size), 0)
        ).where(FileRecord.owner_id == owner_id)
        file_res = (await db.execute(file_count_stmt)).one()
        file_count, storage_bytes = file_res

        sensing_events_count = (await db.execute(
            select(func.count(WifiSensingEvent.id)).where(WifiSensingEvent.owner_id == owner_id)
        )).scalar_one() or 0

        # Earliest expiry
        earliest_conv_exp = (await db.execute(
            select(func.min(Conversation.expires_at)).where(Conversation.owner_id == owner_id)
        )).scalar_one_or_none()

        earliest_file_exp = (await db.execute(
            select(func.min(FileRecord.expires_at)).where(FileRecord.owner_id == owner_id)
        )).scalar_one_or_none()

        candidates = [t for t in [earliest_conv_exp, earliest_file_exp] if t is not None]
        earliest_expiry = min(candidates).isoformat() if candidates else None

        return {
            "policy": "Your stored data is automatically deleted after 72 hours of inactivity.",
            "retention_period_hours": RETENTION_HOURS,
            "active_conversations_count": conv_count,
            "active_files_count": file_count,
            "storage_bytes_used": storage_bytes,
            "sensing_events_count": sensing_events_count,
            "earliest_data_expiry": earliest_expiry,
            "current_time_utc": now.isoformat(),
            "auto_cleanup_active": True,
        }

    @classmethod
    async def purge_all_user_data(cls, db: AsyncSession, owner_id: str) -> Dict[str, Any]:
        """User-directed complete purge of all their data across all tables and physical file storage."""
        # 1. Purge physical files
        file_stmt = select(FileRecord).where(FileRecord.owner_id == owner_id)
        files = list((await db.execute(file_stmt)).scalars().all())
        storage = get_storage_backend()
        physical_files_deleted = 0

        for f_rec in files:
            path = f_rec.storage_path
            ref_stmt = select(func.count(FileRecord.id)).where(
                FileRecord.storage_path == path,
                FileRecord.owner_id != owner_id,
            )
            other_refs = (await db.execute(ref_stmt)).scalar_one() or 0
            if other_refs == 0:
                try:
                    storage.delete_file(path)
                    physical_files_deleted += 1
                except Exception:
                    pass
            await db.delete(f_rec)

        # 2. Delete conversations (cascades messages)
        del_conv = await db.execute(delete(Conversation).where(Conversation.owner_id == owner_id))
        conv_deleted = del_conv.rowcount or 0

        # 3. Delete sensing events & configs
        del_events = await db.execute(delete(WifiSensingEvent).where(WifiSensingEvent.owner_id == owner_id))
        events_deleted = del_events.rowcount or 0

        del_configs = await db.execute(delete(WifiSensorConfig).where(WifiSensorConfig.owner_id == owner_id))
        configs_deleted = del_configs.rowcount or 0

        # 4. Delete browser tasks, research jobs, workflows
        del_bt = await db.execute(delete(BrowserTask).where(BrowserTask.owner_id == owner_id))
        del_rj = await db.execute(delete(ResearchJob).where(ResearchJob.owner_id == owner_id))
        del_wf = await db.execute(delete(Workflow).where(Workflow.owner_id == owner_id))

        await db.commit()

        return {
            "status": "success",
            "message": "All user data and associated physical storage files have been permanently deleted.",
            "conversations_deleted": conv_deleted,
            "files_deleted": len(files),
            "physical_files_deleted": physical_files_deleted,
            "sensing_events_deleted": events_deleted,
            "sensing_configs_deleted": configs_deleted,
            "browser_tasks_deleted": del_bt.rowcount or 0,
            "research_jobs_deleted": del_rj.rowcount or 0,
            "workflows_deleted": del_wf.rowcount or 0,
        }
