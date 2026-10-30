"""
CSI (Channel State Information) Domain Types & Structures.
Represents physical 802.11 OFDM subcarrier metrics, phase/amplitude tensors,
preprocessing filters, and spatial uncertainty geometry.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
from typing import Any, Dict, List, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class CsiSubcarrierFrame:
    """Raw PHY Layer CSI Frame containing complex IQ subcarrier observations."""

    timestamp: datetime
    device_id: str
    channel: int
    rssi_dbm: float
    noise_floor_dbm: float
    subcarrier_count: int
    amplitudes: List[float] = field(default_factory=list)
    phases: List[float] = field(default_factory=list)
    sanitized_phases: List[float] = field(default_factory=list)
    mac_address: Optional[str] = None
    frame_sequence: int = 0
    is_simulated: bool = False


@dataclass
class CsiFeatureVector:
    """Statistical and spectral features extracted from processed CSI subcarrier tensors."""

    timestamp: datetime
    subcarrier_variance: float
    doppler_energy: float
    pca_first_component_ratio: float
    respiration_energy: float  # Spectral energy in [0.2, 0.5] Hz
    walking_energy: float      # Spectral energy in [1.0, 5.0] Hz
    snr_db: float
    quality_score: float
    sample_window_size: int = 30


@dataclass
class FresnelUncertaintyRegion:
    """Spatial ambiguity geometry for single-link or multi-link RF reflection paths.

    In a single-link topology (1 Tx, 1 Rx), precise (x, y) localization is physically
    indeterminate without multi-antenna AoA arrays or multiple links. This geometry
    represents the 1st Fresnel zone boundary where human perturbation occurs.
    """

    region_type: str  # "fresnel_ellipsoid" or "centroid_confidence_circle"
    focus_tx: Tuple[float, float]
    focus_rx: Tuple[float, float]
    semi_major_axis_m: float
    semi_minor_axis_m: float
    rotation_deg: float
    center_x: float
    center_y: float
    confidence: float  # [0.0, 1.0]


@dataclass
class TrackedHumanSubject:
    """Anonymous tracking state for an individual detected human occupant.

    Strict Privacy Guarantee:
    - Never collects biometric or biometric-adjacent identity data.
    - Assigned ephemeral, anonymous identifiers (e.g. 'Subject #1').
    """

    subject_id: str  # e.g. "Subject #1"
    presence_state: str  # "stationary", "motion", "respiration_detected"
    confidence: float
    x_m: Optional[float]
    y_m: Optional[float]
    velocity_mps: float
    heading_deg: Optional[float]
    uncertainty_radius_m: float
    fresnel_region: Optional[FresnelUncertaintyRegion] = None
    last_detected: datetime = field(default_factory=utc_now)
