from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class SensorCapabilities:
    """Declared capabilities and hardware detection status of a sensing provider."""

    provider_id: str
    name: str
    is_hardware: bool
    is_simulated: bool
    is_available: bool
    unavailability_reason: Optional[str] = None
    supported_measurements: List[str] = field(default_factory=list)
    sampling_rate_hz: float = 1.0
    requires_authorization: bool = True


@dataclass
class ProviderHealth:
    """Operational health status of a sensing provider."""

    provider_id: str
    status: str  # "healthy", "degraded", "unavailable", "stopped"
    is_running: bool = False
    error_message: Optional[str] = None
    last_sample_time: Optional[datetime] = None
    packets_captured: int = 0


@dataclass
class RawSensorSample:
    """Ingested sensor observation prior to higher-level occupancy estimation."""

    timestamp: datetime
    room_id: str
    sensor_type: str
    is_simulated: bool
    rssi_dbm: float
    sample_count: int
    subcarrier_variance: float
    doppler_energy: float
    noise_floor_dbm: float
    quality_score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PresenceEstimate:
    """Estimated presence probability and motion intensity."""

    presence_state: str  # "vacant", "presence", "motion", "unknown"
    presence_probability: Optional[float]  # 0.0 - 1.0, or None if unknown
    motion_level: str  # "none", "low", "medium", "high"
    quality_score: float  # 0.0 - 1.0
    inference_note: str
    is_simulated: bool = True


@dataclass
class NormalizedSensorEvent:
    """Normalized, validated event combining raw measurements and presence estimation."""

    room_id: str
    timestamp: datetime
    is_simulated: bool
    sensor_type: str
    presence_state: str
    presence_probability: Optional[float]
    motion_level: str
    signal_strength_dbm: float
    sample_count: int
    quality_score: float
    raw_metrics: Dict[str, Any] = field(default_factory=dict)
