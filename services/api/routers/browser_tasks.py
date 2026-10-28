import asyncio
import json
import sys
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure services/agent-worker is in sys.path
_worker_dir = str(Path(__file__).resolve().parent.parent.parent / "services" / "agent-worker")
if _worker_dir not in sys.path:
    sys.path.insert(0, _worker_dir)

from config import get_settings
from database import get_db
from routers.deps import get_current_user
from schemas.browser_task import (
    BrowserTaskApproveRequest,
    BrowserTaskCancelRequest,
    BrowserTaskConfirmationRequest,
    BrowserTaskCreateRequest,
    BrowserTaskEventResponse,
    BrowserTaskListResponse,
    BrowserTaskResponse,
    WorkerStatusResponse,
)
from services.browser_task_service import BrowserTaskService
from services.model_gateway import get_model_gateway
from worker import BrowserWorkerRunner, get_worker_runner

router = APIRouter(prefix="/api/browser", tags=["browser"])
settings = get_settings()


def get_runner() -> BrowserWorkerRunner:
    return get_worker_runner(
        headless=settings.browser_headless,
        allow_local=settings.allow_local_browser_targets,
        max_concurrency=settings.browser_worker_concurrency,
    )


@router.get("/worker/status", response_model=WorkerStatusResponse)
async def get_browser_worker_status(runner: BrowserWorkerRunner = Depends(get_runner)):
    """Returns local browser worker health and runtime status."""
    return runner.get_status()


@router.post("/tasks", response_model=BrowserTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_browser_task(
    req: BrowserTaskCreateRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creates a new browser task and generates a structured plan awaiting review."""
    gateway = get_model_gateway()
    svc = BrowserTaskService(db=db, model_gateway=gateway)
    task = await svc.create_task(user_id=user_id, req=req)
    return task


@router.get("/tasks", response_model=BrowserTaskListResponse)
async def list_browser_tasks(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists browser tasks for the authenticated user."""
    svc = BrowserTaskService(db=db)
    items, total = await svc.list_tasks(user_id=user_id, limit=limit, offset=offset)
    return BrowserTaskListResponse(items=items, total=total)


@router.get("/tasks/{task_id}", response_model=BrowserTaskResponse)
async def get_browser_task(
    task_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves status, evidence, and details for a specific browser task."""
    svc = BrowserTaskService(db=db)
    return await svc.get_task(user_id=user_id, task_id=task_id)


@router.get("/tasks/{task_id}/plan")
async def get_browser_task_plan(
    task_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieves the proposed structured plan for a browser task."""
    svc = BrowserTaskService(db=db)
    task = await svc.get_task(user_id=user_id, task_id=task_id)
    return task.plan or {}


@router.post("/tasks/{task_id}/approve", response_model=BrowserTaskResponse)
async def approve_browser_task(
    task_id: str,
    req: BrowserTaskApproveRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    runner: BrowserWorkerRunner = Depends(get_runner),
):
    """Approves a proposed browser plan and initiates asynchronous execution."""
    svc = BrowserTaskService(db=db)
    return await svc.approve_task(user_id=user_id, task_id=task_id, req=req, runner=runner)


@router.post("/tasks/{task_id}/confirm", response_model=BrowserTaskResponse)
async def confirm_browser_task_action(
    task_id: str,
    req: BrowserTaskConfirmationRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    runner: BrowserWorkerRunner = Depends(get_runner),
):
    """Provides human confirmation for a consequential browser action."""
    svc = BrowserTaskService(db=db)
    return await svc.confirm_action(user_id=user_id, task_id=task_id, req=req, runner=runner)


@router.post("/tasks/{task_id}/cancel", response_model=BrowserTaskResponse)
async def cancel_browser_task(
    task_id: str,
    req: BrowserTaskCancelRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    runner: BrowserWorkerRunner = Depends(get_runner),
):
    """Cancels a pending, running, or awaiting-confirmation browser task."""
    svc = BrowserTaskService(db=db)
    return await svc.cancel_task(user_id=user_id, task_id=task_id, req=req, runner=runner)


@router.get("/tasks/{task_id}/events", response_model=list[BrowserTaskEventResponse])
async def get_browser_task_events(
    task_id: str,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns chronological progress events for a task."""
    svc = BrowserTaskService(db=db)
    return await svc.list_task_events(user_id=user_id, task_id=task_id)


@router.get("/tasks/{task_id}/stream")
async def stream_browser_task_progress(
    task_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    runner: BrowserWorkerRunner = Depends(get_runner),
):
    """Streams real-time SSE progress events for an active browser task."""
    svc = BrowserTaskService(db=db)
    task = await svc.get_task(user_id=user_id, task_id=task_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        queue = runner.subscribe(task_id)
        try:
            # First replay existing events so reconnecting clients get full history
            existing_events = await svc.list_task_events(user_id=user_id, task_id=task_id)
            seen_ids = set()
            for ev in existing_events:
                seen_ids.add(ev.id)
                data = {
                    "id": ev.id,
                    "task_id": ev.task_id,
                    "step_index": ev.step_index,
                    "event_type": ev.event_type,
                    "message": ev.message,
                    "payload": ev.payload or {},
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                }
                yield f"event: {ev.event_type}\ndata: {json.dumps(data)}\n\n"

            # Check if task is already in a terminal state
            terminal_states = {"completed", "failed", "cancelled"}
            if task.status in terminal_states:
                return

            # Listen for live events
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event_data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    if event_data.get("id") not in seen_ids:
                        seen_ids.add(event_data.get("id"))
                        ev_type = event_data.get("event_type", "message")
                        yield f"event: {ev_type}\ndata: {json.dumps(event_data)}\n\n"

                        if ev_type in ("task_completed", "task_failed", "task_cancelled"):
                            break
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield ": keep-alive\n\n"

        finally:
            runner.unsubscribe(task_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
