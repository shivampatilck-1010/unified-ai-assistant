import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=72)


class BrowserTask(Base):
    __tablename__ = "browser_tasks"

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
    task_description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="User goal/intent description",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
        index=True,
        comment="pending, awaiting_approval, running, awaiting_confirmation, completed, failed, cancelled",
    )
    current_step: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    plan: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Validated structured execution plan",
    )
    approved_scope: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Approved execution scope (domains, actions, max_steps)",
    )
    pending_confirmation: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Details of consequential action requiring confirmation",
    )
    result_summary: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Final outcome summary verified against browser state",
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Sanitized error message without secrets",
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    claimed_by_worker: Mapped[Optional[str]] = mapped_column(
        String(128),
        nullable=True,
        index=True,
        comment="Identifier of worker process currently holding execution claim",
    )
    retry_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="Count of retry attempts on retryable failures",
    )
    max_retries: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
        comment="Maximum bounded retries permitted before terminal failure",
    )
    evidence: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSON,
        nullable=True,
        default=list,
        comment="Visited URLs, observed elements, screenshots",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=default_expires_at,
        nullable=False,
        index=True,
        comment="Automatic data deletion timestamp (72 hours after task creation)",
    )

    events: Mapped[List["BrowserTaskEvent"]] = relationship(
        "BrowserTaskEvent",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="BrowserTaskEvent.created_at",
    )


class BrowserTaskEvent(Base):
    __tablename__ = "browser_task_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("browser_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_index: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="task_started, plan_approved, step_started, step_completed, confirmation_required, recoverable_error, task_completed, task_failed, task_cancelled",
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )

    task: Mapped["BrowserTask"] = relationship(
        "BrowserTask",
        back_populates="events",
    )


Index("ix_browser_tasks_owner_status", BrowserTask.owner_id, BrowserTask.status)
Index("ix_browser_task_events_task_created", BrowserTaskEvent.task_id, BrowserTaskEvent.created_at)
