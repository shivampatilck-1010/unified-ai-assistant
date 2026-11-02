import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.conversation import Conversation
from models.file_record import FileRecord
from models.message import Message
from models.project import Project
from schemas.conversation import ConversationSummary
from schemas.project import (
    PinnedFileInfo,
    ProjectCreate,
    ProjectDetail,
    ProjectSummary,
    ProjectUpdate,
)

logger = logging.getLogger("project_service")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProjectService:
    """Service layer managing isolated project workspaces and scoped guidance memory."""

    @staticmethod
    def _parse_pinned_ids(raw: Optional[str]) -> List[str]:
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    @staticmethod
    def _serialize_pinned_ids(ids: List[str]) -> str:
        # Deduplicate while preserving order
        seen = set()
        deduped = [x for x in ids if not (x in seen or seen.add(x))]
        return json.dumps(deduped)

    @classmethod
    async def create_project(
        cls,
        db: AsyncSession,
        owner_id: str,
        payload: ProjectCreate,
    ) -> ProjectSummary:
        now = utc_now()
        pinned_json = cls._serialize_pinned_ids(payload.pinned_file_ids or [])
        project = Project(
            id=str(uuid.uuid4()),
            owner_id=owner_id,
            name=payload.name.strip() or "New Project",
            description=payload.description.strip() if payload.description else None,
            system_prompt=payload.system_prompt.strip() if payload.system_prompt else None,
            icon=payload.icon or "folder",
            color=payload.color or "#6366f1",
            pinned_file_ids=pinned_json,
            created_at=now,
            updated_at=now,
            expires_at=now + timedelta(hours=72),
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)

        pinned_list = cls._parse_pinned_ids(project.pinned_file_ids)
        return ProjectSummary(
            id=project.id,
            owner_id=project.owner_id,
            name=project.name,
            description=project.description,
            system_prompt=project.system_prompt,
            icon=project.icon,
            color=project.color,
            conversation_count=0,
            pinned_file_count=len(pinned_list),
            pinned_file_ids=pinned_list,
            created_at=project.created_at,
            updated_at=project.updated_at,
        )

    @classmethod
    async def list_projects(
        cls,
        db: AsyncSession,
        owner_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[ProjectSummary], int]:
        count_stmt = select(func.count(Project.id)).where(Project.owner_id == owner_id)
        total_res = await db.execute(count_stmt)
        total = total_res.scalar_one_or_none() or 0

        # Subquery for conversation counts per project
        conv_counts = (
            select(
                Conversation.project_id,
                func.count(Conversation.id).label("cnt"),
            )
            .where(Conversation.owner_id == owner_id, Conversation.project_id.isnot(None))
            .group_by(Conversation.project_id)
            .subquery()
        )

        stmt = (
            select(
                Project,
                func.coalesce(conv_counts.c.cnt, 0).label("conv_cnt"),
            )
            .outerjoin(conv_counts, Project.id == conv_counts.c.project_id)
            .where(Project.owner_id == owner_id)
            .order_by(Project.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        rows = result.all()

        items = []
        for proj, conv_cnt in rows:
            pinned = cls._parse_pinned_ids(proj.pinned_file_ids)
            items.append(
                ProjectSummary(
                    id=proj.id,
                    owner_id=proj.owner_id,
                    name=proj.name,
                    description=proj.description,
                    system_prompt=proj.system_prompt,
                    icon=proj.icon,
                    color=proj.color,
                    conversation_count=int(conv_cnt),
                    pinned_file_count=len(pinned),
                    pinned_file_ids=pinned,
                    created_at=proj.created_at,
                    updated_at=proj.updated_at,
                )
            )

        return items, total

    @classmethod
    async def get_project(
        cls,
        db: AsyncSession,
        project_id: str,
        owner_id: str,
    ) -> Optional[ProjectDetail]:
        stmt = select(Project).where(
            Project.id == project_id,
            Project.owner_id == owner_id,
        )
        result = await db.execute(stmt)
        proj = result.scalar_one_or_none()
        if not proj:
            return None

        # Fetch conversations in this project
        conv_stmt = (
            select(
                Conversation,
                func.count(Message.id).label("msg_cnt"),
            )
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .where(
                Conversation.project_id == project_id,
                Conversation.owner_id == owner_id,
            )
            .group_by(Conversation.id)
            .order_by(Conversation.updated_at.desc())
        )
        conv_res = await db.execute(conv_stmt)
        conv_rows = conv_res.all()

        conv_summaries = [
            ConversationSummary(
                id=c.id,
                owner_id=c.owner_id,
                title=c.title,
                project_id=c.project_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=m_cnt,
            )
            for c, m_cnt in conv_rows
        ]

        # Fetch pinned files metadata
        pinned_ids = cls._parse_pinned_ids(proj.pinned_file_ids)
        pinned_files: List[PinnedFileInfo] = []
        if pinned_ids:
            files_stmt = select(FileRecord).where(
                FileRecord.id.in_(pinned_ids),
                FileRecord.owner_id == owner_id,
            )
            files_res = await db.execute(files_stmt)
            for f in files_res.scalars().all():
                pinned_files.append(
                    PinnedFileInfo(
                        id=f.id,
                        filename=f.filename,
                        file_type=f.file_type,
                        file_size=f.file_size,
                        created_at=f.created_at,
                    )
                )

        return ProjectDetail(
            id=proj.id,
            owner_id=proj.owner_id,
            name=proj.name,
            description=proj.description,
            system_prompt=proj.system_prompt,
            icon=proj.icon,
            color=proj.color,
            conversation_count=len(conv_summaries),
            pinned_file_count=len(pinned_files),
            pinned_file_ids=pinned_ids,
            created_at=proj.created_at,
            updated_at=proj.updated_at,
            conversations=conv_summaries,
            pinned_files=pinned_files,
        )

    @classmethod
    async def update_project(
        cls,
        db: AsyncSession,
        project_id: str,
        owner_id: str,
        payload: ProjectUpdate,
    ) -> Optional[ProjectSummary]:
        now = utc_now()
        values: dict = {
            "updated_at": now,
            "expires_at": now + timedelta(hours=72),
        }
        if payload.name is not None:
            values["name"] = payload.name.strip() or "Untitled Project"
        if payload.description is not None:
            values["description"] = payload.description.strip() if payload.description else None
        if payload.system_prompt is not None:
            values["system_prompt"] = payload.system_prompt.strip() if payload.system_prompt else None
        if payload.icon is not None:
            values["icon"] = payload.icon
        if payload.color is not None:
            values["color"] = payload.color
        if payload.pinned_file_ids is not None:
            values["pinned_file_ids"] = cls._serialize_pinned_ids(payload.pinned_file_ids)

        stmt = (
            update(Project)
            .where(Project.id == project_id, Project.owner_id == owner_id)
            .values(**values)
            .returning(Project)
        )
        res = await db.execute(stmt)
        proj = res.scalar_one_or_none()
        if not proj:
            return None
        await db.commit()

        # Count conversations
        c_count_stmt = select(func.count(Conversation.id)).where(
            Conversation.project_id == project_id,
            Conversation.owner_id == owner_id,
        )
        c_count = (await db.execute(c_count_stmt)).scalar_one_or_none() or 0
        pinned = cls._parse_pinned_ids(proj.pinned_file_ids)

        return ProjectSummary(
            id=proj.id,
            owner_id=proj.owner_id,
            name=proj.name,
            description=proj.description,
            system_prompt=proj.system_prompt,
            icon=proj.icon,
            color=proj.color,
            conversation_count=c_count,
            pinned_file_count=len(pinned),
            pinned_file_ids=pinned,
            created_at=proj.created_at,
            updated_at=proj.updated_at,
        )

    @classmethod
    async def delete_project(
        cls,
        db: AsyncSession,
        project_id: str,
        owner_id: str,
    ) -> bool:
        # Unbind conversations from this project (keep conversations safe per data loss prevention)
        unbind_stmt = (
            update(Conversation)
            .where(Conversation.project_id == project_id, Conversation.owner_id == owner_id)
            .values(project_id=None)
        )
        await db.execute(unbind_stmt)

        stmt = delete(Project).where(
            Project.id == project_id,
            Project.owner_id == owner_id,
        )
        res = await db.execute(stmt)
        await db.commit()
        return res.rowcount > 0

    @classmethod
    async def pin_file(
        cls,
        db: AsyncSession,
        project_id: str,
        owner_id: str,
        file_id: str,
    ) -> Optional[ProjectDetail]:
        proj_stmt = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        proj = (await db.execute(proj_stmt)).scalar_one_or_none()
        if not proj:
            return None

        # Verify file belongs to owner
        f_stmt = select(FileRecord).where(FileRecord.id == file_id, FileRecord.owner_id == owner_id)
        file_record = (await db.execute(f_stmt)).scalar_one_or_none()
        if not file_record:
            return None

        current_pinned = cls._parse_pinned_ids(proj.pinned_file_ids)
        if file_id not in current_pinned:
            current_pinned.append(file_id)
            proj.pinned_file_ids = cls._serialize_pinned_ids(current_pinned)
            proj.updated_at = utc_now()
            proj.expires_at = utc_now() + timedelta(hours=72)
            await db.commit()

        return await cls.get_project(db, project_id, owner_id)

    @classmethod
    async def unpin_file(
        cls,
        db: AsyncSession,
        project_id: str,
        owner_id: str,
        file_id: str,
    ) -> Optional[ProjectDetail]:
        proj_stmt = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        proj = (await db.execute(proj_stmt)).scalar_one_or_none()
        if not proj:
            return None

        current_pinned = cls._parse_pinned_ids(proj.pinned_file_ids)
        if file_id in current_pinned:
            current_pinned.remove(file_id)
            proj.pinned_file_ids = cls._serialize_pinned_ids(current_pinned)
            proj.updated_at = utc_now()
            proj.expires_at = utc_now() + timedelta(hours=72)
            await db.commit()

        return await cls.get_project(db, project_id, owner_id)
