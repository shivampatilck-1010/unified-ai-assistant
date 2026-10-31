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
        # 2D Kinematics tracking state
        self._room_width_m: float = 6.0
        self._room_length_m: float = 4.0
        self._pos_x: float = 1.2
        self._pos_y: float = 1.0
        self._waypoint_idx: int = 0
        self._waypoints: List[tuple[float, float]] = [
            (1.2, 1.0),  # Doorway zone
            (3.0, 1.8),  # Room center
            (4.5, 2.8),  # Workstation / desk
            (3.8, 3.2),  # Reading corner / shelf
            (1.8, 3.0),  # Lounge seating
            (2.2, 1.5),  # Meeting area
        ]

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
        self._waypoint_idx = 0
        self._pos_x = 1.2
        self._pos_y = 1.0
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

        pos_x: Optional[float] = None
        pos_y: Optional[float] = None
        velocity_mps: Optional[float] = None
        uncertainty_radius_m: Optional[float] = None

        # Multi-occupant modeling (4 occupants in room: User + 3 Roommates)
        tracked_subjects = []
        occupancy_count = 0

        if state == "vacant":
            # Ambient thermal noise: very low variance, low doppler
            variance = 0.01 + self._rng.uniform(0.0, 0.02)
            doppler = 0.005 + self._rng.uniform(0.0, 0.01)
            rssi = -64.0 + self._rng.uniform(-1.0, 1.0)
            noise_floor = -92.0 + self._rng.uniform(-0.5, 0.5)
            quality = 0.98
            # Room is unoccupied
            pos_x = None
            pos_y = None
            velocity_mps = 0.0
            uncertainty_radius_m = None
            occupancy_count = 0
            tracked_subjects = []

        elif state == "stationary":
            # Breathing modulation: subtle sinusoidal fluctuation (0.25 Hz approx)
            breath_wave = 0.05 * math.sin(self._tick * 0.4 * self._speed)
            variance = 0.12 + breath_wave + self._rng.uniform(0.0, 0.03)
            doppler = 0.10 + 0.03 * math.sin(self._tick * 0.4 * self._speed)
            rssi = -58.0 + self._rng.uniform(-1.5, 1.5)
            noise_floor = -91.0
            quality = 0.99
            # Subject 1 (User) seated at desk workstation (4.5, 2.8)
            micro_x = 0.03 * math.sin(self._tick * 0.3 * self._speed)
            micro_y = 0.02 * math.cos(self._tick * 0.3 * self._speed)
            pos_x = round(4.5 + micro_x, 2)
            pos_y = round(2.8 + micro_y, 2)
            velocity_mps = 0.0
            uncertainty_radius_m = 0.30

            # Subject 2 (Roommate 1) at center meeting table (3.0, 1.8)
            p2_x = round(3.0 + 0.02 * math.cos(self._tick * 0.25 * self._speed), 2)
            p2_y = round(1.8 + 0.02 * math.sin(self._tick * 0.25 * self._speed), 2)

            # Subject 3 (Roommate 2) on lounge sofa (1.6, 3.2)
            p3_x = round(1.6 + 0.015 * math.sin(self._tick * 0.2 * self._speed), 2)
            p3_y = round(3.2 + 0.015 * math.cos(self._tick * 0.2 * self._speed), 2)

            # Subject 4 (Roommate 3) at reading area (4.0, 1.2)
            p4_x = round(4.0 + 0.02 * math.sin(self._tick * 0.35 * self._speed), 2)
            p4_y = round(1.2 + 0.02 * math.cos(self._tick * 0.35 * self._speed), 2)

            occupancy_count = 4
            tracked_subjects = [
                {"subject_id": "Subject #1 (You)", "x": pos_x, "y": pos_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.30},
                {"subject_id": "Subject #2", "x": p2_x, "y": p2_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.25},
                {"subject_id": "Subject #3", "x": p3_x, "y": p3_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.28},
                {"subject_id": "Subject #4", "x": p4_x, "y": p4_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.28},
            ]

        else:  # "motion"
            # High variance and dynamic doppler energy
            motion_burst = self._rng.uniform(0.4, 0.8)
            variance = 0.45 + motion_burst
            doppler = 0.60 + self._rng.uniform(0.0, 0.3)
            rssi = -52.0 + self._rng.uniform(-3.0, 3.0)
            noise_floor = -90.0
            quality = 0.96

            # Subject 1 (User): Advance kinematics along waypoints
            target_x, target_y = self._waypoints[self._waypoint_idx]
            dx = target_x - self._pos_x
            dy = target_y - self._pos_y
            dist = math.hypot(dx, dy)
            step_size = min(dist, 0.45 * self._speed)

            if dist > 0.15:
                self._pos_x += (dx / dist) * step_size
                self._pos_y += (dy / dist) * step_size
            else:
                self._waypoint_idx = (self._waypoint_idx + 1) % len(self._waypoints)

            self._pos_x = max(0.4, min(self._room_width_m - 0.4, self._pos_x))
            self._pos_y = max(0.4, min(self._room_length_m - 0.4, self._pos_y))

            pos_x = round(self._pos_x, 2)
            pos_y = round(self._pos_y, 2)
            velocity_mps = round(min(1.8, 0.9 * self._speed), 2)
            uncertainty_radius_m = 0.45

            # Subject 2 (Roommate 1) seated at workstation (4.6, 2.8)
            p2_x = round(4.6 + 0.02 * math.cos(self._tick * 0.25 * self._speed), 2)
            p2_y = round(2.8 + 0.02 * math.sin(self._tick * 0.25 * self._speed), 2)

            # Subject 3 (Roommate 2) seated on sofa (1.6, 3.2)
            p3_x = round(1.6 + 0.015 * math.sin(self._tick * 0.2 * self._speed), 2)
            p3_y = round(3.2 + 0.015 * math.cos(self._tick * 0.2 * self._speed), 2)

            # Subject 4 (Roommate 3) moving in reading / entry area
            p4_x = round(3.8 + 0.6 * math.sin(self._tick * 0.22 * self._speed), 2)
            p4_y = round(1.4 + 0.4 * math.cos(self._tick * 0.22 * self._speed), 2)
            p4_vel = round(0.45 * self._speed, 2)

            occupancy_count = 4
            tracked_subjects = [
                {"subject_id": "Subject #1 (You)", "x": pos_x, "y": pos_y, "presence_state": "motion", "velocity_mps": velocity_mps, "uncertainty_radius_m": uncertainty_radius_m},
                {"subject_id": "Subject #2", "x": p2_x, "y": p2_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.25},
                {"subject_id": "Subject #3", "x": p3_x, "y": p3_y, "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.28},
                {"subject_id": "Subject #4", "x": p4_x, "y": p4_y, "presence_state": "motion", "velocity_mps": p4_vel, "uncertainty_radius_m": 0.38},
            ]

        metadata = {
            "synthetic_state": state,
            "simulation_tick": self._tick,
            "speed_factor": self._speed,
            "kinematics_mode": "2D_synthetic_trajectory",
            "room_dimensions": {"width_m": self._room_width_m, "length_m": self._room_length_m},
            "sensor_anchor": {"x": 3.0, "y": 0.2, "label": "Wi-Fi AP Anchor"},
            "occupancy_count": occupancy_count,
            "tracked_subjects": tracked_subjects,
        }
        if pos_x is not None:
            metadata["position_x"] = pos_x
            metadata["position_y"] = pos_y
            metadata["velocity_mps"] = velocity_mps
            metadata["uncertainty_radius_m"] = uncertainty_radius_m

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
            estimated_x=pos_x,
            estimated_y=pos_y,
            velocity_mps=velocity_mps,
            uncertainty_radius_m=uncertainty_radius_m,
            metadata=metadata,
        )
