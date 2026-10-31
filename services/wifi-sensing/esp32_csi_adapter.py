"""
Real Physical ESP32 Wi-Fi CSI Hardware Adapter.
Integrates:
1. Direct USB-UART Serial Streaming from ESP32 / ESP32-S3 devices running `esp-csi` firmware (e.g., CH9102 on COM7).
2. Esp32SerialCollector with auto-reconnect and port contention detection.
3. Esp32CsiEngine for mathematical signal processing, baseline calibration, and human presence/motion classification.

Strict Integrity Constraints:
- Discloses true hardware connection status; never fakes connection.
- Parses genuine 802.11 CSI subcarrier IQ frames.
- Reports 'disconnected' or 'port_busy' with actionable instructions when device is detached or monitor is open.
"""

import asyncio
from collections import deque
import logging
import math
import platform
import re
import socket
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

from csi_processing import CsiSignalProcessor, CsiSpatialLocalizer
from csi_types import CsiFeatureVector, CsiSubcarrierFrame, FresnelUncertaintyRegion, TrackedHumanSubject, utc_now
from esp32_csi_engine import CsiCalibrationProfile, CsiEngineState, Esp32CsiEngine
from esp32_serial_collector import CollectorHealth, Esp32CsiPacket, Esp32SerialCollector
from provider_base import BaseSensorProvider
from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities

logger = logging.getLogger("esp32_csi_adapter")


class Esp32CsiHardwareAdapter(BaseSensorProvider):
    """Adapter for physical ESP32 802.11 CSI sniffers over Serial COM or UDP socket."""

    def __init__(self, serial_port: str = "COM7", baud_rate: int = 921600, udp_port: int = 5000) -> None:
        self.serial_port = serial_port
        self.baud_rate = baud_rate
        self.udp_port = udp_port

        self._is_running = False
        self._room_id: str = "default_esp32_room"
        self._packets_captured: int = 0
        self._last_sample_time: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._detected_device: Optional[str] = None

        # Integrated real-time collector and signal processing engine
        self.collector = Esp32SerialCollector(port=serial_port, baud_rate=baud_rate)
        self.engine = Esp32CsiEngine(window_size=30)

        # Register engine listener to collector
        self.collector.add_packet_listener(self._on_packet_received)
        self._latest_state: Optional[CsiEngineState] = None

    @property
    def provider_id(self) -> str:
        return "esp32_csi_hardware"

    @property
    def name(self) -> str:
        return "ESP32 802.11 CSI Hardware Sniffer"

    @property
    def is_hardware(self) -> bool:
        return True

    @property
    def is_simulated(self) -> bool:
        return False

    def _on_packet_received(self, packet: Esp32CsiPacket) -> None:
        """Internal callback invoked when a raw packet arrives on serial."""
        self._latest_state = self.engine.process_packet(packet)
        self._packets_captured += 1
        self._last_sample_time = packet.timestamp

    def detect_hardware(self) -> Tuple[bool, Optional[str], Optional[str]]:
        """Inspects host system for real ESP32 / USB-Serial devices or active UDP CSI sockets.

        Returns (is_available, device_name, failure_reason).
        """
        # 1. Use pyserial port listing (matches CH9102, CH340, CP210, etc.)
        ports = Esp32SerialCollector.list_available_ports()
        esp_port = next((p for p in ports if p["is_likely_esp32"] or p["port"].upper() == self.serial_port.upper()), None)
        if esp_port:
            self._detected_device = f"{esp_port['description']} ({esp_port['port']})"
            return True, self._detected_device, None

        # 2. Windows PnP fallback check
        if platform.system() == "Windows":
            try:
                import subprocess
                cmd = 'Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match "CH9102|CH340|CP210|ESP32|FTDI|Silicon Labs|USB-Serial" } | Select-Object -ExpandProperty FriendlyName'
                result = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", cmd],
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                output = result.stdout.strip()
                if output:
                    self._detected_device = output.splitlines()[0].strip()
                    return True, self._detected_device, None
            except Exception as exc:
                logger.debug("Failed checking Windows PnP devices: %s", exc)

        return False, None, (
            f"No ESP32 CSI device detected on {self.serial_port}. "
            "Please plug in your ESP32 DevKit V1 via USB."
        )

    def discover_capabilities(self) -> SensorCapabilities:
        is_avail, dev_name, reason = self.detect_hardware()
        return SensorCapabilities(
            provider_id=self.provider_id,
            name=self.name,
            is_hardware=True,
            is_simulated=False,
            is_available=is_avail,
            unavailability_reason=reason,
            supported_measurements=[
                "802.11_ofdm_subcarrier_amplitudes",
                "802.11_ofdm_subcarrier_phases",
                "sanitized_phase_doppler_energy",
                "fresnel_zone_spatial_perturbation",
                "respiration_breathing_spectral_energy",
                "empty_room_baseline_calibration",
            ] if is_avail else [],
            sampling_rate_hz=20.0 if is_avail else 0.0,
            requires_authorization=True,
        )

    def get_health(self) -> ProviderHealth:
        col_health = self.collector.get_health()
        is_avail, dev_name, reason = self.detect_hardware()

        if not is_avail:
            status = "unavailable"
            err = reason
        elif col_health.status == "port_busy":
            status = "port_busy"
            err = col_health.status_message
        elif self._is_running:
            status = "healthy" if col_health.is_connected else "connecting"
            err = col_health.last_error
        else:
            status = "stopped"
            err = None

        return ProviderHealth(
            provider_id=self.provider_id,
            status=status,
            is_running=self._is_running,
            error_message=err,
            last_sample_time=self._last_sample_time,
            packets_captured=self._packets_captured,
        )

    async def start(self, room_id: str, speed: float = 1.0) -> None:
        """Starts real-time serial acquisition from ESP32."""
        is_avail, dev_name, reason = self.detect_hardware()
        if not is_avail:
            raise RuntimeError(f"Cannot start ESP32 CSI hardware adapter: {reason}")

        self._room_id = room_id
        self._is_running = True
        self._last_error = None

        # Start serial collector thread
        self.collector.start(port=self.serial_port, baud_rate=self.baud_rate)

    async def stop(self) -> None:
        """Stops collector and safely closes COM port."""
        self._is_running = False
        self.collector.stop()

    async def reset(self) -> None:
        self._packets_captured = 0
        self._last_sample_time = None
        self._last_error = None
        self.engine.reset_calibration()

    def start_calibration(self, duration_seconds: float = 5.0) -> None:
        """Triggers baseline recording on the engine."""
        self.engine.start_calibration(duration_seconds=duration_seconds)

    def reset_calibration(self) -> None:
        self.engine.reset_calibration()

    async def capture_sample(self) -> Optional[RawSensorSample]:
        """Returns the most recent physical CSI observation as a Normalized RawSensorSample."""
        if not self._is_running:
            return None

        # If a live packet was processed by engine
        state = self._latest_state
        latest_pkt = self.collector.get_latest_packet()

        col_health = self.collector.get_health()

        # If hardware is busy or disconnected, record error
        if col_health.status in ("port_busy", "error", "disconnected") and col_health.status_message:
            self._last_error = col_health.status_message

        if not latest_pkt or not state:
            return None

        # Spatial Fresnel Ellipsoid approximation for single link (Anchor AP at (3.0, 0.2), ESP32 at (3.0, 3.8))
        fresnel_major = state.fresnel_major_m
        fresnel_minor = state.fresnel_minor_m
        est_x = 3.0
        est_y = 2.0
        uncertainty_m = round(fresnel_major * 0.8, 2)
        velocity = round(1.2 * state.motion_intensity, 2) if state.presence_state == "movement_detected" else 0.0

        metadata: Dict[str, Any] = {
            "hardware_device": self._detected_device or "ESP32 DevKit V1",
            "serial_port": self.serial_port,
            "baud_rate": self.baud_rate,
            "mac_address": latest_pkt.mac_address,
            "channel": latest_pkt.channel,
            "packet_sequence": latest_pkt.sequence,
            "packets_per_second": col_health.packets_per_second,
            "subcarrier_count": latest_pkt.subcarrier_count,
            "subcarrier_amplitudes": state.subcarrier_amplitudes,
            "doppler_energy": state.doppler_energy,
            "subcarrier_variance": state.subcarrier_variance,
            "snr_db": state.snr_db,
            "motion_intensity": state.motion_intensity,
            "detection_confidence": state.detection_confidence,
            "calibration_status": state.calibration_status,
            "is_calibrated": self.engine.calibration.is_calibrated,
            "baseline_variance": self.engine.calibration.baseline_variance,
            "motion_threshold": self.engine.calibration.motion_threshold,
            "presence_threshold": self.engine.calibration.presence_threshold,
            "respiration_rate": state.respiration_rate,
            "respiration_confidence": state.respiration_confidence,
            "respiration_status": state.respiration_status,
            "heart_rate_bpm": state.heart_rate_bpm,
            "heart_rate_confidence": state.heart_rate_confidence,
            "heart_rate_status": state.heart_rate_status,
            "kinematics_mode": "fresnel_zone_spatial_perturbation",
            "room_dimensions": {"width_m": 6.0, "length_m": 4.0},
            "sensor_anchor": {"x": 3.0, "y": 3.8, "label": "ESP32 CSI Receiver (COM7)"},
            "tx_anchor": {"x": 3.0, "y": 0.2, "label": "Wi-Fi Router (AP)"},
            "fresnel_ellipsoid": {
                "center_x": est_x,
                "center_y": est_y,
                "semi_major_axis_m": fresnel_major,
                "semi_minor_axis_m": fresnel_minor,
                "rotation_deg": 90.0,
            },
            "single_link_truth_disclosure": (
                "Single ESP32 link physically measures RF perturbation across the Fresnel zone between router and ESP32. "
                "Individual (x, y) multi-joint tracking requires multi-node mesh."
            ),
        }

        # Detected target silhouette items for spatial rendering
        if state.presence_state in ("movement_detected", "possible_presence"):
            metadata["tracked_subjects"] = [
                {
                    "subject_id": "Target #1 [Dynamic RF Centroid]",
                    "x": est_x,
                    "y": est_y,
                    "presence_state": "motion" if state.presence_state == "movement_detected" else "presence",
                    "velocity_mps": velocity,
                    "uncertainty_radius_m": uncertainty_m,
                }
            ]
            metadata["occupancy_count"] = state.occupant_count if state.occupant_count > 0 else 1
        else:
            metadata["tracked_subjects"] = []
            metadata["occupancy_count"] = 0

        return RawSensorSample(
            timestamp=state.timestamp,
            room_id=self._room_id,
            sensor_type="esp32_csi_hardware",
            is_simulated=False,
            rssi_dbm=state.rssi_dbm,
            sample_count=self._packets_captured,
            subcarrier_variance=state.subcarrier_variance,
            doppler_energy=state.doppler_energy,
            noise_floor_dbm=-95.0,
            quality_score=state.signal_quality,
            estimated_x=est_x if state.presence_state != "no_movement" else None,
            estimated_y=est_y if state.presence_state != "no_movement" else None,
            velocity_mps=velocity,
            uncertainty_radius_m=uncertainty_m,
            metadata=metadata,
        )
