import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ResearchJob(Base):
    __tablename__ = "research_jobs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    owner_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        comment="Explicit user ownership boundary",
    )
    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Target research question or objective",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="draft",
        index=True,
        comment="draft, planning, awaiting_approval, running, synthesizing, completed, failed, cancelled",
    )
    depth: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="standard",
        comment="quick, standard, deep",
    )
    allowed_domains: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        default=list,
        comment="User-specified domain allowlist",
    )
    file_ids: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        default=list,
        comment="Attached user uploaded document IDs for comparison",
    )
    max_sources: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
        comment="Configurable maximum source discovery limit",
    )
    requires_approval: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether execution pauses for human plan approval",
    )
    plan: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Structured plan: steps, queries, domains, rationale",
    )
    final_report: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSON,
        nullable=True,
        comment="Synthesized report with executive summary, findings, evidence, citations",
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
        comment="Sanitized error description",
    )
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sources: Mapped[List["ResearchSource"]] = relationship(
        "ResearchSource",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ResearchSource.created_at",
    )
    events: Mapped[List["ResearchEvent"]] = relationship(
        "ResearchEvent",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ResearchEvent.created_at",
    )

    __table_args__ = (
        Index("ix_research_jobs_owner_status", "owner_id", "status"),
    )


class ResearchSource(Base):
    __tablename__ = "research_sources"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    job_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("research_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        comment="Ownership isolation matching research job",
    )
    canonical_url: Mapped[str] = mapped_column(
        String(2048),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        default="Untitled Web Source",
    )
    publisher: Mapped[str] = mapped_column(
        String(256),
        nullable=False,
        default="Unknown Publisher",
    )
    retrieval_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    publication_date: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        comment="Extracted publication date or None if unverified",
    )
    content_hash: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="pending",
        index=True,
        comment="pending, retrieved, failed, rejected",
    )
    validation_status: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="valid",
        comment="valid, flagged_injection, unreachable, unsupported_content_type",
    )
    snippets: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True,
        default=list,
        comment="Extracted evidence quotations and snippets",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    job: Mapped["ResearchJob"] = relationship("ResearchJob", back_populates="sources")

    __table_args__ = (
        Index("ix_research_sources_job_url", "job_id", "canonical_url"),
    )


class ResearchEvent(Base):
    __tablename__ = "research_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    job_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("research_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="status_changed, plan_created, source_discovered, source_retrieved, evidence_extracted, synthesis_started, report_generated, error, cancelled",
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

    job: Mapped["ResearchJob"] = relationship("ResearchJob", back_populates="events")

    __table_args__ = (
        Index("ix_research_events_job_created", "job_id", "created_at"),
    )
