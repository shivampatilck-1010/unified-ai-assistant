from abc import ABC, abstractmethod
from typing import Optional

from sensing_types import PresenceEstimate, RawSensorSample


class BasePresenceEstimator(ABC):
    """Abstract interface for inferring occupancy and motion from normalized CSI/RF features."""

    @abstractmethod
    def estimate(self, sample: RawSensorSample) -> PresenceEstimate:
        """Infers presence probability and motion state from raw sensor measurements."""
        ...


class BaselinePresenceEstimator(BasePresenceEstimator):
    """Statistical energy and subcarrier variance baseline estimator.

    Phase 7 Constraints:
    - Uses synthetic features; makes NO claims of identifying individuals or biometrics.
    - Explicitly returns an 'unknown' presence state when measurements are degraded or absent.
    - Distinguishes heuristic estimation from calibrated laboratory ground truth.
    """

    def estimate(self, sample: RawSensorSample) -> PresenceEstimate:
        # Check measurement validity
        if (
            sample is None
            or sample.quality_score < 0.4
            or sample.sample_count <= 0
            or sample.rssi_dbm < -120.0
            or sample.rssi_dbm > -10.0
        ):
            return PresenceEstimate(
                presence_state="unknown",
                presence_probability=None,
                motion_level="none",
                quality_score=0.0,
                inference_note="Sensor telemetry degraded or missing; presence state unknown.",
                is_simulated=sample.is_simulated if sample else True,
            )

        # Normalize variance and Doppler components to compute aggregate RF perturbation score
        # Baselines: ambient floor ~0.02, stationary breathing ~0.15, active walk ~0.6+
        norm_var = min(1.0, max(0.0, sample.subcarrier_variance / 0.5))
        norm_doppler = min(1.0, max(0.0, sample.doppler_energy / 0.5))
        rf_perturbation = (norm_var * 0.6) + (norm_doppler * 0.4)

        if rf_perturbation < 0.15:
            # Ambient vacant floor
            prob = round(rf_perturbation * 0.5, 3)
            return PresenceEstimate(
                presence_state="vacant",
                presence_probability=prob,
                motion_level="none",
                quality_score=sample.quality_score,
                inference_note="RF metrics match ambient noise baseline; no occupancy detected.",
                is_simulated=sample.is_simulated,
            )
        elif rf_perturbation < 0.50:
            # Stationary / breathing perturbation
            prob = round(0.50 + ((rf_perturbation - 0.15) / 0.35) * 0.30, 3)
            return PresenceEstimate(
                presence_state="presence",
                presence_probability=prob,
                motion_level="low",
                quality_score=sample.quality_score,
                inference_note="Low-frequency periodic perturbation detected; stationary presence inferred.",
                is_simulated=sample.is_simulated,
            )
        else:
            # Dynamic movement
            prob = round(min(0.99, 0.80 + ((rf_perturbation - 0.50) / 0.50) * 0.19), 3)
            motion_level = "high" if rf_perturbation > 0.75 else "medium"
            return PresenceEstimate(
                presence_state="motion",
                presence_probability=prob,
                motion_level=motion_level,
                quality_score=sample.quality_score,
                inference_note="Broadband Doppler shift and high subcarrier variance detected; active motion inferred.",
                is_simulated=sample.is_simulated,
            )
