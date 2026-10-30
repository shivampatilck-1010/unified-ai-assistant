import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=72)


class WifiSensorConfig(Base):
    """Persistent configuration for a designated sensing room or node."""

    __tablename__ = "wifi_sensor_configs"

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
    room_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Normalized room or zone identifier, e.g. 'office_room_a'",
    )
    room_name: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="Human-readable label for the zone",
    )
    is_authorized: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Explicit operator consent flag enabling sensing in this zone",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether active simulation or monitoring is running",
    )
    simulation_speed: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
        comment="Synthetic time scaling factor (e.g. 1.0, 2.0, 5.0)",
    )
    retention_days: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=7,
        comment="Configurable data retention cutoff in days",
    )
    authorized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Timestamp when explicit authorization was granted",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    # Relationships
    events: Mapped[List["WifiSensingEvent"]] = relationship(
        "WifiSensingEvent",
        back_populates="config",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_wifi_sensor_configs_owner_room", "owner_id", "room_id", unique=True),
    )


class WifiSensingEvent(Base):
    """Normalized, time-series sensor event generated or ingested by the service."""

    __tablename__ = "wifi_sensing_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    config_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("wifi_sensor_configs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    owner_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        index=True,
        comment="Explicit user ownership boundary",
    )
    room_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Normalized room or zone identifier",
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
        comment="Timestamp of observation in UTC",
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=default_expires_at,
        index=True,
        comment="Automatic data deletion timestamp (72 hours after sensing event)",
    )
    is_simulated: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Unmistakable flag indicating whether this is synthetic data",
    )
    sensor_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="synthetic_csi",
        comment="'synthetic_csi' or 'hardware_csi'",
    )
    presence_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="unknown",
        comment="'vacant', 'presence', 'motion', 'unknown'",
    )
    presence_probability: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="Statistical presence probability estimate [0.0, 1.0], None if unknown",
    )
    motion_level: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="none",
        comment="'none', 'low', 'medium', 'high'",
    )
    signal_strength_dbm: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=-55.0,
        comment="Signal strength indicator in dBm",
    )
    sample_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=100,
        comment="Number of subcarrier or packet samples ingested in this window",
    )
    quality_score: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
        comment="Measurement quality/validity score [0.0, 1.0]",
    )
    raw_metrics: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="Subcarrier variance, noise floor, Doppler proxy, and simulation metadata",
    )

    # Relationships
    config: Mapped[Optional["WifiSensorConfig"]] = relationship(
        "WifiSensorConfig",
        back_populates="events",
    )

    @property
    def estimated_x(self) -> Optional[float]:
        if isinstance(self.raw_metrics, dict):
            val = self.raw_metrics.get("position_x")
            return float(val) if val is not None else None
        return None

    @property
    def estimated_y(self) -> Optional[float]:
        if isinstance(self.raw_metrics, dict):
            val = self.raw_metrics.get("position_y")
            return float(val) if val is not None else None
        return None

    @property
    def velocity_mps(self) -> Optional[float]:
        if isinstance(self.raw_metrics, dict):
            val = self.raw_metrics.get("velocity_mps")
            return float(val) if val is not None else None
        return None

    @property
    def uncertainty_radius_m(self) -> Optional[float]:
        if isinstance(self.raw_metrics, dict):
            val = self.raw_metrics.get("uncertainty_radius_m")
            return float(val) if val is not None else None
        return None

    __table_args__ = (
        Index("ix_wifi_sensing_events_owner_room_ts", "owner_id", "room_id", "timestamp"),
        Index("ix_wifi_sensing_events_owner_ts", "owner_id", "timestamp"),
    )


class WifiSensingAudit(Base):
    """Immutable audit trail for authorization, session lifecycle, and retention purges."""

    __tablename__ = "wifi_sensing_audits"

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
    room_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        index=True,
        comment="Room associated with this action, if applicable",
    )
    action: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        comment="Action key e.g. 'session_started', 'session_stopped', 'history_purged'",
    )
    details: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment="Structured metadata for the action",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
    )
