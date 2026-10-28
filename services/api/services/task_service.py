from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.task import Task
from schemas.task import TaskCreate, TaskUpdate
from services.calendar_utils import ensure_utc, validate_timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TaskService:
    @staticmethod
    async def create_task(db: AsyncSession, owner_id: str, data: TaskCreate) -> Task:
        tz = validate_timezone(data.timezone)
        due_utc = ensure_utc(data.due_date, tz) if data.due_date else None
        start_utc = ensure_utc(data.start_date, tz) if data.start_date else None

        task = Task(
            owner_id=owner_id,
            title=data.title.strip(),
            description=data.description.strip() if data.description else None,
            priority=data.priority,
            status=data.status,
            due_date=due_utc,
            start_date=start_utc,
            timezone=tz,
            conversation_id=data.conversation_id,
            message_id=data.message_id,
            completed_at=utc_now() if data.status == "completed" else None,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def get_task(db: AsyncSession, owner_id: str, task_id: str) -> Optional[Task]:
        stmt = select(Task).where(Task.id == task_id, Task.owner_id == owner_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_tasks(
        db: AsyncSession,
        owner_id: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[Task], int]:
        query = select(Task).where(Task.owner_id == owner_id)

        if status:
            query = query.where(Task.status == status)
        if priority:
            query = query.where(Task.priority == priority)
        if search and search.strip():
            query = query.where(Task.title.ilike(f"%{search.strip()}%"))

        count_stmt = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar_one() or 0

        # Sort: pending first or by due date, then created_at desc
        query = query.order_by(
            Task.due_date.asc().nullslast(),
            Task.created_at.desc(),
        )
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await db.execute(query)
        items = list(result.scalars().all())
        return items, total

    @staticmethod
    async def update_task(
        db: AsyncSession,
        owner_id: str,
        task_id: str,
        data: TaskUpdate,
    ) -> Optional[Task]:
        task = await TaskService.get_task(db, owner_id, task_id)
        if not task:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        tz = validate_timezone(update_dict.get("timezone", task.timezone))

        if "title" in update_dict and update_dict["title"] is not None:
            task.title = update_dict["title"].strip()
        if "description" in update_dict:
            task.description = update_dict["description"].strip() if update_dict["description"] else None
        if "priority" in update_dict and update_dict["priority"] is not None:
            task.priority = update_dict["priority"]
        if "timezone" in update_dict and update_dict["timezone"] is not None:
            task.timezone = tz

        if "due_date" in update_dict:
            task.due_date = ensure_utc(update_dict["due_date"], tz) if update_dict["due_date"] else None
        if "start_date" in update_dict:
            task.start_date = ensure_utc(update_dict["start_date"], tz) if update_dict["start_date"] else None

        if "status" in update_dict and update_dict["status"] is not None:
            new_status = update_dict["status"]
            if new_status == "completed" and task.status != "completed":
                task.completed_at = utc_now()
            elif new_status != "completed" and task.status == "completed":
                task.completed_at = None
            task.status = new_status

        if "conversation_id" in update_dict:
            task.conversation_id = update_dict["conversation_id"]
        if "message_id" in update_dict:
            task.message_id = update_dict["message_id"]

        task.updated_at = utc_now()
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def toggle_completion(
        db: AsyncSession,
        owner_id: str,
        task_id: str,
        completed: Optional[bool] = None,
    ) -> Optional[Task]:
        task = await TaskService.get_task(db, owner_id, task_id)
        if not task:
            return None

        if completed is not None:
            target_status = "completed" if completed else "pending"
        else:
            target_status = "pending" if task.status == "completed" else "completed"

        if target_status == "completed":
            task.status = "completed"
            task.completed_at = utc_now()
        else:
            task.status = "pending"
            task.completed_at = None

        task.updated_at = utc_now()
        await db.commit()
        await db.refresh(task)
        return task

    @staticmethod
    async def delete_task(db: AsyncSession, owner_id: str, task_id: str) -> bool:
        task = await TaskService.get_task(db, owner_id, task_id)
        if not task:
            return False
        await db.delete(task)
        await db.commit()
        return True
