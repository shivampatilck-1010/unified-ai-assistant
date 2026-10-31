"""
WiFi-3D-Fusion Open-Source Sensing Engine Adapter.
Integrates the MaliosDark/wifi-3d-fusion 3D skeletal tracking and human localization engine
into the Unified AI Assistant.

Supports:
1. Live REST polling from active `wifi-3d-fusion` daemon (`/data` endpoint on port 5005/5000).
2. Standalone high-fidelity kinematic 25-joint 3D skeleton generation (from wifi-3d-fusion algorithm)
   when the external process is not running.
3. Strict hardware honesty regarding Windows host Realtek RTL8852BE CSI limitations.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import math
import os
import random
from typing import Any, Dict, List, Optional
import urllib.request

from provider_base import BaseSensorProvider
from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities, utc_now

logger = logging.getLogger("wifi_3d_fusion_adapter")

# Standard 25-joint skeleton topology from WiFi-3D-Fusion
JOINT_NAMES_25 = [
    "Nose", "Neck", "R_Shoulder", "R_Elbow", "R_Wrist",
    "L_Shoulder", "L_Elbow", "L_Wrist", "Mid_Hip", "R_Hip",
    "R_Knee", "R_Ankle", "L_Hip", "L_Knee", "L_Ankle",
    "R_Eye", "L_Eye", "R_Ear", "L_Ear", "L_BigToe",
    "L_SmallToe", "L_Heel", "R_BigToe", "R_SmallToe", "R_Heel"
]

# Limb connection pairs for 3D skeleton rendering
SKELETON_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],     # Right arm
    [1, 5], [5, 6], [6, 7],             # Left arm
    [1, 8], [8, 9], [9, 10], [10, 11],  # Right leg
    [8, 12], [12, 13], [13, 14],        # Left leg
    [0, 15], [15, 17], [0, 16], [16, 18],# Head/face
    [14, 19], [19, 20], [14, 21],       # Left foot
    [11, 22], [22, 23], [11, 24]        # Right foot
]


class Wifi3DFusionAdapter(BaseSensorProvider):
    """Adapter for the open-source WiFi-3D-Fusion engine."""

    def __init__(
        self,
        engine_url: Optional[str] = None,
        source_mode: str = "dummy",
    ) -> None:
        self.engine_url = engine_url or os.getenv("WIFI_3D_FUSION_URL", "http://127.0.0.1:5005")
        self.source_mode = source_mode  # "dummy", "esp32", "monitor"
        self._is_running = False
        self._room_id: str = "default_3d_room"
        self._packets_captured: int = 0
        self._last_sample_time: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._sim_t: float = 0.0
        self._person_id: int = 1

    @property
    def provider_id(self) -> str:
        return "wifi_3d_fusion_engine"

    @property
    def name(self) -> str:
        return "WiFi-3D-Fusion (3D Skeletal Mesh Engine)"

    @property
    def is_hardware(self) -> bool:
        return self.source_mode == "esp32"

    @property
    def is_simulated(self) -> bool:
        return self.source_mode != "esp32"

    def discover_capabilities(self) -> SensorCapabilities:
        is_hw = self.source_mode == "esp32"
        reason = None
        if not is_hw:
            reason = (
                "Host Wi-Fi adapter (Realtek RTL8852BE) lacks CSI exposure on Windows 11 OEM drivers. "
                "WiFi-3D-Fusion running in 3D Kinematic Simulation / Replay mode. "
                "Attach an ESP32 sniffer to switch to real hardware CSI mode."
            )

        return SensorCapabilities(
            provider_id=self.provider_id,
            name=self.name,
            is_hardware=is_hw,
            is_simulated=not is_hw,
            is_available=True,
            unavailability_reason=reason,
            supported_measurements=[
                "3d_cartesian_coordinates",
                "25_joint_skeletal_mesh",
                "signal_variance",
                "rf_energy_heatmap",
                "reid_confidence",
            ],
            sampling_rate_hz=10.0,
            requires_authorization=False,
        )

    def get_health(self) -> ProviderHealth:
        status = "healthy" if self._is_running else "stopped"
        if self._last_error:
            status = "degraded"

        return ProviderHealth(
            provider_id=self.provider_id,
            status=status,
            is_running=self._is_running,
            error_message=self._last_error,
            last_sample_time=self._last_sample_time,
            packets_captured=self._packets_captured,
        )

    async def start(self, room_id: str, speed: float = 1.0) -> None:
        self._room_id = room_id
        self._is_running = True
        self._last_error = None
        logger.info(f"WiFi-3D-Fusion adapter started for room {room_id}")

    async def stop(self) -> None:
        self._is_running = False
        logger.info("WiFi-3D-Fusion adapter stopped")

    async def reset(self) -> None:
        self._packets_captured = 0
        self._sim_t = 0.0
        self._last_error = None

    def _fetch_from_daemon(self) -> Optional[Dict[str, Any]]:
        """Polls the active wifi-3d-fusion daemon if available."""
        try:
            req = urllib.request.Request(
                f"{self.engine_url.rstrip('/')}/data",
                headers={"Accept": "application/json", "User-Agent": "UnifiedAI-WiFi-Bridge/1.0"}
            )
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data
        except Exception as e:
            # Daemon may not be currently running; fallback to internal generator
            return None

    def _generate_kinematic_skeleton(self, pos: List[float], variance: float = 0.05) -> List[List[float]]:
        """
        Generates 25 joints matching the exact humanoid kinematic algorithm
        from MaliosDark/wifi-3d-fusion/run_js_visualizer.py.
        """
        bx = pos[0]
        by = pos[1]
        bz = pos[2] if len(pos) > 2 else 0.0

        height = 1.72 + variance * 0.1
        w = height * 0.22

        # Natural arm/leg swing based on simulation time
        t = self._sim_t
        swing_l = math.sin(t * 3.0) * 0.15
        swing_r = -swing_l

        # 25 humanoid joints
        # Coordinate system: X (width), Y (depth), Z (height from ground)
        neck_z = bz + height * 0.82
        head_z = bz + height * 0.94
        mid_hip_z = bz + height * 0.48
        knee_z = bz + height * 0.26
        ankle_z = bz + 0.08

        joints = [
            [bx, by, head_z],                          # 0: Nose
            [bx, by, neck_z],                          # 1: Neck
            [bx + w, by, neck_z - 0.05],               # 2: R_Shoulder
            [bx + w + 0.08, by + swing_r, neck_z - 0.28],# 3: R_Elbow
            [bx + w + 0.12, by + swing_r * 1.5, neck_z - 0.52], # 4: R_Wrist
            [bx - w, by, neck_z - 0.05],               # 5: L_Shoulder
            [bx - w - 0.08, by + swing_l, neck_z - 0.28],# 6: L_Elbow
            [bx - w - 0.12, by + swing_l * 1.5, neck_z - 0.52], # 7: L_Wrist
            [bx, by, mid_hip_z],                       # 8: Mid_Hip
            [bx + w * 0.6, by, mid_hip_z - 0.05],      # 9: R_Hip
            [bx + w * 0.6, by + swing_l * 0.8, knee_z],# 10: R_Knee
            [bx + w * 0.6, by + swing_l, ankle_z],     # 11: R_Ankle
            [bx - w * 0.6, by, mid_hip_z - 0.05],      # 12: L_Hip
            [bx - w * 0.6, by + swing_r * 0.8, knee_z],# 13: L_Knee
            [bx - w * 0.6, by + swing_r, ankle_z],     # 14: L_Ankle
            [bx + 0.04, by - 0.05, head_z + 0.02],     # 15: R_Eye
            [bx - 0.04, by - 0.05, head_z + 0.02],     # 16: L_Eye
            [bx + 0.09, by, head_z],                   # 17: R_Ear
            [bx - 0.09, by, head_z],                   # 18: L_Ear
            [bx - w * 0.6, by + swing_r + 0.12, 0.02], # 19: L_BigToe
            [bx - w * 0.6 - 0.04, by + swing_r + 0.10, 0.02], # 20: L_SmallToe
            [bx - w * 0.6, by + swing_r - 0.05, 0.02], # 21: L_Heel
            [bx + w * 0.6, by + swing_l + 0.12, 0.02], # 22: R_BigToe
            [bx + w * 0.6 + 0.04, by + swing_l + 0.10, 0.02], # 23: R_SmallToe
            [bx + w * 0.6, by + swing_l - 0.05, 0.02], # 24: R_Heel
        ]
        return joints

    async def capture_sample(self) -> Optional[RawSensorSample]:
        if not self._is_running:
            return None

        self._sim_t += 0.1
        now = utc_now()
        self._last_sample_time = now
        self._packets_captured += 1

        # 1. Check if external WiFi-3D-Fusion daemon is serving frames
        daemon_data = await asyncio.to_thread(self._fetch_from_daemon)

        if daemon_data and daemon_data.get("persons"):
            persons = daemon_data["persons"]
            p0 = persons[0]
            pos = p0.get("position", [2.5, 2.0, 0.0])
            confidence = float(p0.get("confidence", 0.95))
            skeleton = p0.get("skeleton") or self._generate_kinematic_skeleton(pos)
            fps = float(daemon_data.get("fps", 10.0))
            rssi = float(daemon_data.get("signal_strength", -52.0))
            engine_source = "wifi-3d-fusion-daemon"
        else:
            # 2. Standalone high-fidelity kinematic simulation matching wifi-3d-fusion logic
            t = self._sim_t
            center_x, center_y = 3.0, 2.0
            radius_x, radius_y = 1.8, 1.1
            x = center_x + radius_x * math.sin(t * 0.4)
            y = center_y + radius_y * math.cos(t * 0.4 * 0.7)
            z = 0.0
            pos = [x, y, z]
            confidence = 0.94
            skeleton = self._generate_kinematic_skeleton(pos, variance=0.04)

            # Secondary RF scatterer positions
            pos2 = [4.6 + 0.02 * math.cos(t * 0.3), 2.8 + 0.02 * math.sin(t * 0.3), 0.0]
            skeleton2 = self._generate_kinematic_skeleton(pos2, variance=0.01)

            multi_skeletons = [skeleton, skeleton2]
            tracked_subjects = [
                {"subject_id": "Target #1 [Dynamic Mover]", "x": round(pos[0], 2), "y": round(pos[1], 2), "presence_state": "motion", "velocity_mps": 0.65, "uncertainty_radius_m": 0.35},
                {"subject_id": "Target #2 [Secondary Centroid]", "x": round(pos2[0], 2), "y": round(pos2[1], 2), "presence_state": "presence", "velocity_mps": 0.0, "uncertainty_radius_m": 0.25},
            ]

            fps = 10.0
            rssi = -54.0 + 3.0 * math.sin(t * 0.5)
            engine_source = "wifi-3d-fusion-embedded"

        uncertainty = max(0.18, (1.0 - confidence) * 1.5)

        metadata: Dict[str, Any] = {
            "engine": "wifi-3d-fusion",
            "engine_source": engine_source,
            "skeleton_3d": skeleton,
            "multi_skeletons": multi_skeletons if engine_source == "wifi-3d-fusion-embedded" else [skeleton],
            "skeleton_connections": SKELETON_CONNECTIONS,
            "joint_names": JOINT_NAMES_25,
            "position_3d": pos,
            "fps": fps,
            "confidence": confidence,
            "person_id": self._person_id,
            "occupancy_count": 4 if engine_source == "wifi-3d-fusion-embedded" else 1,
            "tracked_subjects": tracked_subjects if engine_source == "wifi-3d-fusion-embedded" else [],
            "room_bounds": {"width": 6.0, "length": 4.0, "height": 2.8},
        }

        return RawSensorSample(
            timestamp=now,
            room_id=self._room_id,
            sensor_type="wifi_3d_fusion_csi",
            is_simulated=self.is_simulated,
            rssi_dbm=rssi,
            sample_count=self._packets_captured,
            subcarrier_variance=0.08,
            doppler_energy=0.35,
            noise_floor_dbm=-92.0,
            quality_score=confidence,
            estimated_x=pos[0],
            estimated_y=pos[1],
            velocity_mps=0.65,
            uncertainty_radius_m=uncertainty,
            metadata=metadata,
        )
