import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.conversation import Conversation


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=72)


class Project(Base):
    """Isolated project workspace with scoped instructions, pinned knowledge, and conversation memory."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    owner_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        comment="Explicit ownership identity boundary",
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="New Project",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    system_prompt: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Scoped system instructions injected into project conversations",
    )
    icon: Mapped[str] = mapped_column(
        String(64),
        default="folder",
        nullable=False,
    )
    color: Mapped[str] = mapped_column(
        String(32),
        default="#6366f1",
        nullable=False,
    )
    pinned_file_ids: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        default="[]",
        comment="JSON array of pinned FileRecord IDs",
    )
    extra_metadata: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Optional JSON serialized metadata",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=default_expires_at,
        nullable=False,
        index=True,
        comment="Automatic data retention timestamp (72 hours after last activity)",
    )

    __table_args__ = (
        Index("ix_projects_owner_updated", "owner_id", "updated_at"),
    )
