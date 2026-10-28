from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.extraction import ExtractRequest, ExtractResponse
from schemas.task import (
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
)
from services.nl_extractor import nl_extractor_instance
from services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> TaskResponse:
    """Create a new task belonging to the authenticated identity."""
    try:
        task = await TaskService.create_task(db, owner_id=user_id, data=payload)
        return TaskResponse.model_validate(task)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    priority_filter: Optional[str] = Query(None, alias="priority", description="Filter by priority"),
    search: Optional[str] = Query(None, description="Search term in title"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Page size"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> TaskListResponse:
    """List paginated tasks belonging to the current user."""
    items, total = await TaskService.list_tasks(
        db,
        owner_id=user_id,
        status=status_filter,
        priority=priority_filter,
        search=search,
        page=page,
        page_size=page_size,
    )
    return TaskListResponse(
        items=[TaskResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/extract", response_model=ExtractResponse)
async def extract_tasks_and_events(
    payload: ExtractRequest,
    user_id: str = Depends(get_current_user_id),
) -> ExtractResponse:
    """
    Extract tasks, calendar events, and reminders from natural language using the configured ModelGateway.
    Does NOT persist items directly — returns structured proposals requiring explicit operator confirmation.
    """
    try:
        return await nl_extractor_instance.extract(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(exc)}",
        )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> TaskResponse:
    """Retrieve a single task by ID within the user's ownership boundary."""
    task = await TaskService.get_task(db, owner_id=user_id, task_id=task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return TaskResponse.model_validate(task)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> TaskResponse:
    """Update task details."""
    try:
        task = await TaskService.update_task(db, owner_id=user_id, task_id=task_id, data=payload)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        return TaskResponse.model_validate(task)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{task_id}/toggle", response_model=TaskResponse)
async def toggle_task_completion(
    task_id: str,
    completed: Optional[bool] = Query(None, description="Explicit target completed boolean; toggles if omitted"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> TaskResponse:
    """Idempotently toggle or set task completion."""
    task = await TaskService.toggle_completion(db, owner_id=user_id, task_id=task_id, completed=completed)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return TaskResponse.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a task owned by the user."""
    deleted = await TaskService.delete_task(db, owner_id=user_id, task_id=task_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
