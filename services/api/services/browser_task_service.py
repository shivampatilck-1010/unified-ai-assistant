import asyncio
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure services/agent-worker is accessible
_agent_worker_dir = str(Path(__file__).resolve().parent.parent.parent / "services" / "agent-worker")
if _agent_worker_dir not in sys.path:
    sys.path.insert(0, _agent_worker_dir)

from models.browser_task import BrowserTask, BrowserTaskEvent
from schemas.browser_task import (
    BrowserPlan,
    BrowserTaskApproveRequest,
    BrowserTaskCancelRequest,
    BrowserTaskConfirmationRequest,
    BrowserTaskCreateRequest,
    BrowserTaskStatus,
)
from planner import generate_browser_plan
from policy import ALLOWED_ACTION_TYPES, validate_action, validate_url
from worker import BrowserWorkerRunner


class BrowserTaskService:
    """Service layer for Browser Task lifecycle, approval workflow, and event retrieval."""

    def __init__(self, db: AsyncSession, model_gateway: Optional[Any] = None):
        self.db = db
        self.model_gateway = model_gateway

    async def create_task(self, user_id: str, req: BrowserTaskCreateRequest) -> BrowserTask:
        """Creates a browser task and generates a structured plan awaiting user approval."""
        # 1. Validate initial URL if provided
        if req.initial_url:
            validate_url(req.initial_url, allowed_domains=req.allowed_domains, allow_local=True)

        # 2. Generate structured plan (model-based or deterministic template)
        plan: BrowserPlan = await generate_browser_plan(
            task_description=req.task_description,
            initial_url=req.initial_url,
            allowed_domains=req.allowed_domains,
            model_gateway=self.model_gateway,
        )

        # 3. Formulate approved scope
        approved_scope = {
            "allowed_domains": plan.allowed_domains,
            "max_steps": 15,
            "allowed_actions": list(ALLOWED_ACTION_TYPES),
        }

        # 4. Persist task with status AWAITING_APPROVAL
        task = BrowserTask(
            owner_id=user_id,
            task_description=req.task_description,
            status=BrowserTaskStatus.AWAITING_APPROVAL.value,
            current_step=0,
            plan=plan.model_dump(),
            approved_scope=approved_scope,
            evidence=[],
        )
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def get_task(self, user_id: str, task_id: str) -> BrowserTask:
        """Retrieves task ensuring strict ownership isolation."""
        stmt = select(BrowserTask).where(BrowserTask.id == task_id, BrowserTask.owner_id == user_id)
        result = await self.db.execute(stmt)
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Browser task '{task_id}' not found.",
            )
        return task

    async def list_tasks(self, user_id: str, limit: int = 20, offset: int = 0) -> Tuple[List[BrowserTask], int]:
        """Lists browser tasks for the authenticated user with pagination."""
        total_stmt = select(func.count(BrowserTask.id)).where(BrowserTask.owner_id == user_id)
        total_res = await self.db.execute(total_stmt)
        total = total_res.scalar() or 0

        stmt = (
            select(BrowserTask)
            .where(BrowserTask.owner_id == user_id)
            .order_by(desc(BrowserTask.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        tasks = list(result.scalars().all())
        return tasks, total

    async def approve_task(
        self, user_id: str, task_id: str, req: BrowserTaskApproveRequest, runner: BrowserWorkerRunner
    ) -> BrowserTask:
        """Approves a pending plan and starts asynchronous execution in the background worker."""
        task = await self.get_task(user_id, task_id)

        # Validate state transition
        if task.status != BrowserTaskStatus.AWAITING_APPROVAL.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve task in state '{task.status}'. Expected 'awaiting_approval'.",
            )

        if not req.approved:
            task.status = BrowserTaskStatus.CANCELLED.value
            task.cancellation_reason = "User rejected proposed execution plan"
            await self.db.commit()
            await self.db.refresh(task)
            return task

        if req.modified_plan:
            task.plan = req.modified_plan.model_dump()

        # Update status to RUNNING
        task.status = BrowserTaskStatus.RUNNING.value
        await self.db.commit()
        await self.db.refresh(task)

        # Trigger background execution without blocking API request loop
        asyncio.create_task(runner.execute_task(task_id))
        return task

    async def confirm_action(
        self, user_id: str, task_id: str, req: BrowserTaskConfirmationRequest, runner: BrowserWorkerRunner
    ) -> BrowserTask:
        """Delivers user confirmation for a consequential action awaiting confirmation."""
        task = await self.get_task(user_id, task_id)

        if task.status != BrowserTaskStatus.AWAITING_CONFIRMATION.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot confirm task in state '{task.status}'. Expected 'awaiting_confirmation'.",
            )

        conf_payload = task.pending_confirmation or {}
        confirmation_id = conf_payload.get("confirmation_id")
        if not confirmation_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task has no active confirmation request.",
            )

        runner.respond_confirmation(confirmation_id, req.approved)
        await self.db.refresh(task)
        return task

    async def cancel_task(
        self, user_id: str, task_id: str, req: BrowserTaskCancelRequest, runner: BrowserWorkerRunner
    ) -> BrowserTask:
        """Cancels a pending or running browser task."""
        task = await self.get_task(user_id, task_id)

        if task.status in (BrowserTaskStatus.COMPLETED.value, BrowserTaskStatus.FAILED.value):
            return task

        runner.request_cancellation(task_id)

        task.status = BrowserTaskStatus.CANCELLED.value
        task.cancellation_reason = req.reason or "Cancelled by user"
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def list_task_events(self, user_id: str, task_id: str) -> List[BrowserTaskEvent]:
        """Returns ordered progress events for a task ensuring ownership."""
        # Verify ownership
        await self.get_task(user_id, task_id)

        stmt = (
            select(BrowserTaskEvent)
            .where(BrowserTaskEvent.task_id == task_id)
            .order_by(BrowserTaskEvent.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def pause_task(self, user_id: str, task_id: str, runner: BrowserWorkerRunner) -> BrowserTask:
        """Pauses an active task."""
        task = await self.get_task(user_id, task_id)
        if task.status in (BrowserTaskStatus.COMPLETED.value, BrowserTaskStatus.FAILED.value, BrowserTaskStatus.CANCELLED.value):
            return task
        runner.pause_task(task_id)
        task.status = BrowserTaskStatus.PAUSED.value
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def resume_task(self, user_id: str, task_id: str, runner: BrowserWorkerRunner) -> BrowserTask:
        """Resumes a paused task."""
        task = await self.get_task(user_id, task_id)
        if task.status != BrowserTaskStatus.PAUSED.value:
            return task
        runner.resume_task(task_id)
        task.status = BrowserTaskStatus.RUNNING.value
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def get_latest_screenshot(self, user_id: str, task_id: str, runner: BrowserWorkerRunner) -> Dict[str, Any]:
        """Retrieves the latest captured screenshot frame for a task."""
        task = await self.get_task(user_id, task_id)
        screenshot = runner.get_latest_screenshot(task_id)
        if not screenshot and task.evidence:
            for item in reversed(task.evidence):
                if isinstance(item, dict) and item.get("screenshot_data_url"):
                    screenshot = item["screenshot_data_url"]
                    break
        return {"screenshot_data_url": screenshot, "task_id": task_id, "status": task.status}
