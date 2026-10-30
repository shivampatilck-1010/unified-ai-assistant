import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.document_chunk import DocumentChunk


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=72)


class FileRecord(Base):
    __tablename__ = "files"

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
    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    file_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Normalized format extension: pdf, docx, txt, md, csv, py, etc.",
    )
    mime_type: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    file_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    content_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="SHA-256 hex digest of file bytes",
    )
    storage_path: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        comment="Relative private storage path on disk",
    )
    status: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="uploaded",
        index=True,
        comment="uploaded, processing, ready, failed",
    )
    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    page_count: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
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
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=default_expires_at,
        nullable=False,
        index=True,
        comment="Automatic file deletion timestamp (72 hours after upload/access)",
    )

    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk",
        back_populates="file",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )


Index("ix_files_owner_status", FileRecord.owner_id, FileRecord.status)
Index("ix_files_owner_hash", FileRecord.owner_id, FileRecord.content_hash)
