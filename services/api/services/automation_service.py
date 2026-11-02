import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("services.automation")


class AutomationSchedule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_id: str
    name: str
    schedule_cron: Optional[str] = None  # e.g., "0 9 * * 1" (Every Monday at 9am)
    interval_hours: Optional[int] = None
    task_goal: str
    capability: str  # research | browser | report | coding
    status: str = "active"  # active | paused | cancelled
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    execution_history: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AutomationService:
    """Manages authorized background automations, recurring tasks, and schedule execution history."""

    _automations: Dict[str, AutomationSchedule] = {}

    @classmethod
    def register_automation(
        cls,
        owner_id: str,
        name: str,
        task_goal: str,
        capability: str,
        schedule_cron: Optional[str] = None,
        interval_hours: Optional[int] = 24,
    ) -> AutomationSchedule:
        # Check duplicate
        for existing in cls._automations.values():
            if existing.owner_id == owner_id and existing.name.lower() == name.lower() and existing.status == "active":
                logger.info("Automation '%s' already exists for user %s.", name, owner_id)
                return existing

        now = datetime.now(timezone.utc)
        next_run = (now + timedelta(hours=interval_hours or 24)).isoformat()

        schedule = AutomationSchedule(
            owner_id=owner_id,
            name=name,
            schedule_cron=schedule_cron,
            interval_hours=interval_hours,
            task_goal=task_goal,
            capability=capability,
            status="active",
            next_run_at=next_run,
        )
        cls._automations[schedule.id] = schedule
        logger.info("Registered scheduled automation '%s' (id: %s)", name, schedule.id)
        return schedule

    @classmethod
    def get_user_automations(cls, owner_id: str) -> List[AutomationSchedule]:
        return [a for a in cls._automations.values() if a.owner_id == owner_id]

    @classmethod
    def record_execution(
        cls,
        automation_id: str,
        status: str,
        outcome_summary: str,
        artifacts: Optional[List[str]] = None,
    ) -> Optional[AutomationSchedule]:
        sched = cls._automations.get(automation_id)
        if not sched:
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        sched.last_run_at = now_iso
        sched.execution_history.append({
            "run_at": now_iso,
            "status": status,
            "summary": outcome_summary,
            "artifacts": artifacts or [],
        })
        # Set next run
        delta = timedelta(hours=sched.interval_hours or 24)
        sched.next_run_at = (datetime.now(timezone.utc) + delta).isoformat()
        return sched

    @classmethod
    def toggle_status(cls, automation_id: str, owner_id: str, pause: bool = True) -> Optional[AutomationSchedule]:
        sched = cls._automations.get(automation_id)
        if sched and sched.owner_id == owner_id:
            sched.status = "paused" if pause else "active"
            return sched
        return None
