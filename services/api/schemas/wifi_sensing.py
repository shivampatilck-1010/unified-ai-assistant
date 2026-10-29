import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SensorCapabilityItem(BaseModel):
    provider_id: str
    name: str
    is_hardware: bool
    is_simulated: bool
    is_available: bool
    unavailability_reason: Optional[str] = None
    supported_measurements: List[str] = Field(default_factory=list)
    sampling_rate_hz: float = 1.0
    requires_authorization: bool = True


class SensingCapabilitiesResponse(BaseModel):
    providers: List[SensorCapabilityItem]
    active_provider_id: str = "synthetic_csi_simulator"
    simulation_mode: bool = True
    hardware_available: bool = False


class WifiSensingStatusResponse(BaseModel):
    status: str = "operational"
    service: str = "wifi-sensing-subsystem"
    simulation_mode: bool = True
    active_simulations_count: int = 0
    active_rooms: List[str] = Field(default_factory=list)
    hardware_detected: bool = False
    timestamp: str


class SensorConfigCreate(BaseModel):
    room_id: str = Field(..., min_length=2, max_length=64, description="Alphanumeric room key e.g. office_a")
    room_name: str = Field(..., min_length=2, max_length=128, description="Human friendly room name")
    is_authorized: bool = Field(False, description="Explicit operator consent flag")
    simulation_speed: float = Field(1.0, ge=0.1, le=10.0, description="Synthetic speed multiplier")
    retention_days: int = Field(7, ge=1, le=365, description="Event retention window in days")

    @field_validator("room_id")
    @classmethod
    def validate_room_id(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[a-z0-9_-]+$", clean):
            raise ValueError("room_id must contain only lowercase alphanumeric characters, dashes, and underscores")
        return clean


class SensorConfigUpdate(BaseModel):
    room_name: Optional[str] = Field(None, min_length=2, max_length=128)
    is_authorized: Optional[bool] = None
    simulation_speed: Optional[float] = Field(None, ge=0.1, le=10.0)
    retention_days: Optional[int] = Field(None, ge=1, le=365)


class SensorConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    room_id: str
    room_name: str
    is_authorized: bool
    is_active: bool
    simulation_speed: float
    retention_days: int
    authorized_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class SimulationControlRequest(BaseModel):
    room_id: str = Field(..., min_length=1, max_length=64)
    speed: Optional[float] = Field(1.0, ge=0.1, le=10.0)
    provider_id: Optional[str] = Field(
        "synthetic_csi_simulator",
        description="Provider to use: 'synthetic_csi_simulator' or 'real_wifi_rssi_hardware'",
    )


class SimulationControlResponse(BaseModel):
    room_id: str
    is_active: bool
    simulation_mode: bool = True
    action: str  # "started", "stopped", "reset"
    speed: float
    message: str


class SensingEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
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
    raw_metrics: Dict[str, Any] = Field(default_factory=dict)


class SensingEventListResponse(BaseModel):
    events: List[SensingEventResponse]
    total: int
    room_id: Optional[str] = None
    simulation_mode: bool = True


class SensingOccupancySummary(BaseModel):
    room_id: str
    is_simulated: bool = True
    total_events: int
    current_state: str
    current_probability: Optional[float] = None
    average_signal_dbm: float
    state_breakdown: Dict[str, int]
    last_event_time: Optional[datetime] = None


class SensingPurgeRequest(BaseModel):
    room_id: Optional[str] = None
    before_date: Optional[datetime] = None
    confirm_purge: bool = False


class SensingPurgeResponse(BaseModel):
    purged_count: int
    message: str


class WifiSensingAuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    room_id: Optional[str]
    action: str
    details: Dict[str, Any]
    created_at: datetime
