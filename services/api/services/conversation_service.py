import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.conversation import Conversation
from models.message import Message
from schemas.conversation import (
    ConversationDetail,
    ConversationSummary,
    SearchMatch,
)
from schemas.message import MessageResponse


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ConversationService:
    """Service layer managing persistent conversation and message lifecycle."""

    @staticmethod
    async def create_conversation(
        db: AsyncSession,
        owner_id: str,
        title: str = "New conversation",
    ) -> ConversationSummary:
        conv = Conversation(
            id=str(uuid.uuid4()),
            owner_id=owner_id,
            title=title.strip() or "New conversation",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

        return ConversationSummary(
            id=conv.id,
            owner_id=conv.owner_id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            message_count=0,
        )

    @staticmethod
    async def list_conversations(
        db: AsyncSession,
        owner_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[ConversationSummary], int]:
        # Count total
        count_stmt = (
            select(func.count(Conversation.id))
            .where(Conversation.owner_id == owner_id)
        )
        total_res = await db.execute(count_stmt)
        total = total_res.scalar_one_or_none() or 0

        # Fetch items with message count
        stmt = (
            select(
                Conversation,
                func.count(Message.id).label("message_count"),
            )
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .where(Conversation.owner_id == owner_id)
            .group_by(Conversation.id)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await db.execute(stmt)
        rows = result.all()

        items = [
            ConversationSummary(
                id=conv.id,
                owner_id=conv.owner_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=msg_count,
            )
            for conv, msg_count in rows
        ]

        return items, total

    @staticmethod
    async def get_conversation(
        db: AsyncSession,
        conversation_id: str,
        owner_id: str,
    ) -> Optional[ConversationDetail]:
        stmt = (
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(
                Conversation.id == conversation_id,
                Conversation.owner_id == owner_id,
            )
        )
        result = await db.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return None

        messages_resp = [
            MessageResponse(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                status=m.status,
                provider=m.provider,
                model=m.model,
                created_at=m.created_at,
            )
            for m in conv.messages
        ]

        return ConversationDetail(
            id=conv.id,
            owner_id=conv.owner_id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=messages_resp,
        )

    @staticmethod
    async def update_conversation_title(
        db: AsyncSession,
        conversation_id: str,
        owner_id: str,
        title: str,
    ) -> Optional[ConversationSummary]:
        stmt = (
            update(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.owner_id == owner_id,
            )
            .values(title=title.strip(), updated_at=utc_now())
            .returning(Conversation)
        )
        result = await db.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            return None
        await db.commit()

        return ConversationSummary(
            id=conv.id,
            owner_id=conv.owner_id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
        )

    @staticmethod
    async def delete_conversation(
        db: AsyncSession,
        conversation_id: str,
        owner_id: str,
    ) -> bool:
        stmt = (
            delete(Conversation)
            .where(
                Conversation.id == conversation_id,
                Conversation.owner_id == owner_id,
            )
        )
        result = await db.execute(stmt)
        await db.commit()
        return bool(result.rowcount and result.rowcount > 0)

    @staticmethod
    async def search(
        db: AsyncSession,
        owner_id: str,
        query: str,
        limit: int = 50,
    ) -> List[SearchMatch]:
        q = f"%{query.strip()}%"
        matches: List[SearchMatch] = []

        # 1. Search conversation titles
        title_stmt = (
            select(Conversation)
            .where(
                Conversation.owner_id == owner_id,
                Conversation.title.ilike(q),
            )
            .limit(limit)
        )
        title_res = await db.execute(title_stmt)
        for conv in title_res.scalars():
            matches.append(
                SearchMatch(
                    conversation_id=conv.id,
                    conversation_title=conv.title,
                    matched_type="title",
                    snippet=conv.title,
                    created_at=conv.created_at,
                )
            )

        # 2. Search message contents
        msg_stmt = (
            select(Message, Conversation.title.label("conv_title"))
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Conversation.owner_id == owner_id,
                Message.content.ilike(q),
            )
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        msg_res = await db.execute(msg_stmt)
        for msg, conv_title in msg_res.all():
            idx = msg.content.lower().find(query.strip().lower())
            start = max(0, idx - 40)
            end = min(len(msg.content), idx + 80)
            snippet = ("..." if start > 0 else "") + msg.content[start:end] + ("..." if end < len(msg.content) else "")

            matches.append(
                SearchMatch(
                    conversation_id=msg.conversation_id,
                    conversation_title=conv_title,
                    matched_type="message",
                    message_id=msg.id,
                    snippet=snippet,
                    created_at=msg.created_at,
                )
            )

        return matches[:limit]

    @staticmethod
    async def add_message(
        db: AsyncSession,
        conversation_id: str,
        role: str,
        content: str,
        status: str = "completed",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        message_id: Optional[str] = None,
        extra_metadata: Optional[str] = None,
    ) -> Message:
        msg = Message(
            id=message_id or str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            status=status,
            provider=provider,
            model=model,
            extra_metadata=extra_metadata,
            created_at=utc_now(),
        )
        db.add(msg)
        # Touch conversation updated_at
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=utc_now())
        )
        await db.commit()
        await db.refresh(msg)
        return msg

    @staticmethod
    async def update_message(
        db: AsyncSession,
        message_id: str,
        content: str,
        status: str,
        extra_metadata: Optional[str] = None,
    ) -> Optional[Message]:
        stmt = (
            update(Message)
            .where(Message.id == message_id)
            .values(content=content, status=status, extra_metadata=extra_metadata)
            .returning(Message)
        )
        result = await db.execute(stmt)
        msg = result.scalar_one_or_none()
        if msg:
            await db.commit()
        return msg
