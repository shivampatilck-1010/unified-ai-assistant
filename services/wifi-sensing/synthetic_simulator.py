import math
import random
from typing import Dict, List, Optional

from provider_base import BaseSensorProvider
from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities, utc_now


class SyntheticSensorSimulator(BaseSensorProvider):
    """Deterministic, configurable synthetic Wi-Fi sensing generator.

    Produces realistic CSI amplitude variance, Doppler proxies, and RSSI fluctuations
    with explicit labeling that all observations are synthetic.
    """

    def __init__(self, seed: Optional[int] = 42) -> None:
        self._initial_seed = seed
        self._rng = random.Random(seed)
        self._is_running = False
        self._room_id: str = "default_sim_room"
        self._speed: float = 1.0
        self._tick: int = 0
        self._packets_captured: int = 0
        self._last_sample_time = None
        self._forced_state: Optional[str] = None  # For testing: "vacant", "stationary", "motion", "invalid"

    @property
    def provider_id(self) -> str:
        return "synthetic_csi_simulator"

    @property
    def name(self) -> str:
        return "Synthetic CSI Simulator"

    @property
    def is_hardware(self) -> bool:
        return False

    @property
    def is_simulated(self) -> bool:
        return True

    def force_state(self, state: Optional[str]) -> None:
        """Testing hook to force a deterministic synthetic state."""
        self._forced_state = state

    def discover_capabilities(self) -> SensorCapabilities:
        return SensorCapabilities(
            provider_id=self.provider_id,
            name=self.name,
            is_hardware=False,
            is_simulated=True,
            is_available=True,
            unavailability_reason=None,
            supported_measurements=[
                "synthetic_csi_amplitude_variance",
                "synthetic_doppler_proxy",
                "synthetic_rssi_dbm",
                "synthetic_noise_floor",
            ],
            sampling_rate_hz=1.0,
            requires_authorization=True,
        )

    def get_health(self) -> ProviderHealth:
        return ProviderHealth(
            provider_id=self.provider_id,
            status="healthy" if self._is_running else "stopped",
            is_running=self._is_running,
            error_message=None,
            last_sample_time=self._last_sample_time,
            packets_captured=self._packets_captured,
        )

    async def start(self, room_id: str, speed: float = 1.0) -> None:
        self._room_id = room_id
        self._speed = max(0.1, min(10.0, speed))
        self._is_running = True

    async def stop(self) -> None:
        self._is_running = False

    async def reset(self) -> None:
        self._tick = 0
        self._packets_captured = 0
        self._forced_state = None
        self._last_sample_time = None
        self._rng = random.Random(self._initial_seed)

    async def capture_sample(self) -> Optional[RawSensorSample]:
        if not self._is_running:
            return None

        self._tick += 1
        self._packets_captured += 100
        now = utc_now()
        self._last_sample_time = now

        # Determine regime
        state = self._forced_state
        if not state:
            # Deterministic 60-step cycle:
            # 0-19: vacant (20 steps)
            # 20-39: stationary breathing (20 steps)
            # 40-59: active walking/movement (20 steps)
            phase = self._tick % 60
            if phase < 20:
                state = "vacant"
            elif phase < 40:
                state = "stationary"
            else:
                state = "motion"

        if state == "invalid":
            # Test fixture generating invalid/corrupted sensor packet
            return RawSensorSample(
                timestamp=now,
                room_id=self._room_id,
                sensor_type="synthetic_csi",
                is_simulated=True,
                rssi_dbm=-999.0,
                sample_count=0,
                subcarrier_variance=0.0,
                doppler_energy=0.0,
                noise_floor_dbm=-95.0,
                quality_score=0.1,  # degraded/invalid
                metadata={"synthetic_state": "corrupted", "simulation_tick": self._tick},
            )

        if state == "vacant":
            # Ambient thermal noise: very low variance, low doppler
            variance = 0.01 + self._rng.uniform(0.0, 0.02)
            doppler = 0.005 + self._rng.uniform(0.0, 0.01)
            rssi = -64.0 + self._rng.uniform(-1.0, 1.0)
            noise_floor = -92.0 + self._rng.uniform(-0.5, 0.5)
            quality = 0.98

        elif state == "stationary":
            # Breathing modulation: subtle sinusoidal fluctuation (0.25 Hz approx)
            breath_wave = 0.05 * math.sin(self._tick * 0.4 * self._speed)
            variance = 0.12 + breath_wave + self._rng.uniform(0.0, 0.03)
            doppler = 0.10 + 0.03 * math.sin(self._tick * 0.4 * self._speed)
            rssi = -58.0 + self._rng.uniform(-1.5, 1.5)
            noise_floor = -91.0
            quality = 0.99

        else:  # "motion"
            # High variance and dynamic doppler energy
            motion_burst = self._rng.uniform(0.4, 0.8)
            variance = 0.45 + motion_burst
            doppler = 0.60 + self._rng.uniform(0.0, 0.3)
            rssi = -52.0 + self._rng.uniform(-3.0, 3.0)
            noise_floor = -90.0
            quality = 0.96

        return RawSensorSample(
            timestamp=now,
            room_id=self._room_id,
            sensor_type="synthetic_csi",
            is_simulated=True,
            rssi_dbm=round(rssi, 2),
            sample_count=100,
            subcarrier_variance=round(variance, 4),
            doppler_energy=round(doppler, 4),
            noise_floor_dbm=round(noise_floor, 2),
            quality_score=round(quality, 2),
            metadata={
                "synthetic_state": state,
                "simulation_tick": self._tick,
                "speed_factor": self._speed,
            },
        )
