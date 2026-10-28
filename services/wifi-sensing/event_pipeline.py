from collections import deque
from typing import Deque, List, Optional

from presence_estimator import BasePresenceEstimator, BaselinePresenceEstimator
from provider_base import BaseSensorProvider
from sensing_types import NormalizedSensorEvent, RawSensorSample


class SensingPipeline:
    """Bounded pipeline executing sensor acquisition, validation, normalization, and presence estimation."""

    def __init__(
        self,
        provider: BaseSensorProvider,
        estimator: Optional[BasePresenceEstimator] = None,
        max_buffer_size: int = 100,
    ) -> None:
        self.provider = provider
        self.estimator = estimator or BaselinePresenceEstimator()
        self.max_buffer_size = max_buffer_size
        self._event_buffer: Deque[NormalizedSensorEvent] = deque(maxlen=max_buffer_size)

    async def step(self) -> Optional[NormalizedSensorEvent]:
        """Captures a sample from the provider, runs estimation, and returns a normalized event."""
        sample: Optional[RawSensorSample] = await self.provider.capture_sample()
        if not sample:
            return None

        estimate = self.estimator.estimate(sample)

        raw_metrics = {
            "subcarrier_variance": sample.subcarrier_variance,
            "doppler_energy": sample.doppler_energy,
            "noise_floor_dbm": sample.noise_floor_dbm,
            "inference_note": estimate.inference_note,
            **sample.metadata,
        }

        event = NormalizedSensorEvent(
            room_id=sample.room_id,
            timestamp=sample.timestamp,
            is_simulated=sample.is_simulated,
            sensor_type=sample.sensor_type,
            presence_state=estimate.presence_state,
            presence_probability=estimate.presence_probability,
            motion_level=estimate.motion_level,
            signal_strength_dbm=sample.rssi_dbm,
            sample_count=sample.sample_count,
            quality_score=estimate.quality_score,
            raw_metrics=raw_metrics,
        )

        self._event_buffer.append(event)
        return event

    def get_recent_buffered_events(self, limit: int = 50) -> List[NormalizedSensorEvent]:
        events = list(self._event_buffer)
        return events[-limit:]

    def clear_buffer(self) -> None:
        self._event_buffer.clear()
