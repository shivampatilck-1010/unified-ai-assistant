"""
Real Physical Wi-Fi RSSI Hardware Adapter.
Collects genuine Received Signal Strength Indicator (RSSI) measurements from
host wireless interfaces (e.g., Realtek RTL8852BE on Windows) using non-blocking OS commands.

Strict Privacy & Security Constraints:
- Clearly identifies measurements as real RSSI, NOT raw CSI.
- Bounded polling and non-blocking asynchronous execution via asyncio.to_thread.
- Never collects or extracts Wi-Fi passwords, security keys, or unrelated network traffic.
- Never stores or persists raw SSIDs or BSSIDs; uses cryptographic SHA-256 truncation for network identity.
- Never fabricates or synthesizes fake measurements if hardware is absent or disconnected.
- Gracefully handles non-Windows / container environments without physical Wi-Fi.
"""

import asyncio
from collections import deque
import hashlib
import logging
import platform
import re
import subprocess
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional

from provider_base import BaseSensorProvider
from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities, utc_now

logger = logging.getLogger("real_rssi_adapter")


class RealRssiSensorAdapter(BaseSensorProvider):
    """Adapter for collecting real physical Wi-Fi RSSI signal strength observations."""

    def __init__(self, interface_name: Optional[str] = None) -> None:
        self.interface_name = interface_name
        self._is_running = False
        self._room_id: str = "default_hardware_room"
        self._packets_captured: int = 0
        self._last_sample_time: Optional[datetime] = None
        self._rssi_history: Deque[float] = deque(maxlen=10)
        self._last_error: Optional[str] = None
        self._last_rssi: Optional[float] = None
        self._cached_info: Optional[Dict[str, Any]] = None
        self._cached_info_time: Optional[datetime] = None

    @property
    def provider_id(self) -> str:
        return "real_wifi_rssi_hardware"

    @property
    def name(self) -> str:
        return "Windows Wi-Fi RSSI Hardware Adapter"

    @property
    def is_hardware(self) -> bool:
        return True

    @property
    def is_simulated(self) -> bool:
        return False

    @staticmethod
    def parse_netsh_interfaces(output: str) -> Dict[str, Any]:
        """
        Safely parses the stdout of `netsh wlan show interfaces`.
        Extracts only signal strength, channel, adapter metadata, and anonymized network hash.
        Never extracts passwords, keys, or raw personal identifiers.
        """
        if not output or "There is no wireless interface" in output:
            return {
                "is_available": False,
                "connected": False,
                "state": "no_interface",
                "error": "No wireless interface detected on system.",
            }

        data: Dict[str, str] = {}
        for line in output.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                data[k.strip()] = v.strip()

        state = data.get("State", "unknown").lower()
        description = data.get("Description", "Generic Wireless Adapter")
        name = data.get("Name", "Wi-Fi")

        if state != "connected":
            return {
                "is_available": True,
                "connected": False,
                "state": state,
                "description": description,
                "name": name,
                "rssi_dbm": None,
                "signal_pct": 0,
            }

        # Parse RSSI (dBm)
        rssi_dbm: Optional[float] = None
        is_estimated = False
        if "Rssi" in data:
            try:
                rssi_dbm = float(data["Rssi"])
            except ValueError:
                pass

        # Parse Signal percentage
        signal_pct = 0
        if "Signal" in data:
            match = re.search(r"(\d+)", data["Signal"])
            if match:
                signal_pct = int(match.group(1))

        # Fallback RSSI approximation if Windows driver omits explicit Rssi line
        if rssi_dbm is None:
            rssi_dbm = (signal_pct / 2.0) - 100.0
            is_estimated = True

        # Privacy protection: Irreversibly hash AP BSSID; never store raw BSSID or SSID
        bssid = data.get("AP BSSID") or data.get("BSSID") or ""
        anonymized_network_hash: Optional[str] = None
        if bssid:
            anonymized_network_hash = hashlib.sha256(bssid.encode("utf-8")).hexdigest()[:12]

        # Link rates
        rx_rate = 0.0
        if "Receive rate (Mbps)" in data:
            m = re.search(r"([\d\.]+)", data["Receive rate (Mbps)"])
            if m:
                rx_rate = float(m.group(1))

        tx_rate = 0.0
        if "Transmit rate (Mbps)" in data:
            m = re.search(r"([\d\.]+)", data["Transmit rate (Mbps)"])
            if m:
                tx_rate = float(m.group(1))

        channel: Optional[int] = None
        if "Channel" in data:
            m = re.search(r"(\d+)", data["Channel"])
            if m:
                channel = int(m.group(1))

        band = data.get("Band", "Unknown")
        radio_type = data.get("Radio type", "Unknown")

        return {
            "is_available": True,
            "connected": True,
            "state": state,
            "description": description,
            "name": name,
            "rssi_dbm": rssi_dbm,
            "rssi_is_estimated": is_estimated,
            "measurement_source": "direct_driver_rssi" if not is_estimated else "estimated_from_signal_pct",
            "signal_pct": signal_pct,
            "anonymized_network_hash": anonymized_network_hash,
            "channel": channel,
            "band": band,
            "radio_type": radio_type,
            "rx_rate_mbps": rx_rate,
            "tx_rate_mbps": tx_rate,
        }

    def _query_os_wifi_sync(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Synchronous OS call executed inside a worker thread to prevent event loop blocking.
        Includes a 2.0s bounded cache to avoid repeated child process spawning."""
        now = utc_now()
        if (
            not force_refresh
            and self._cached_info is not None
            and self._cached_info_time is not None
            and (now - self._cached_info_time).total_seconds() < 2.0
        ):
            return self._cached_info

        if platform.system() != "Windows":
            res_data = {
                "is_available": False,
                "connected": False,
                "state": "unsupported_os",
                "error": f"Real Wi-Fi RSSI scanning via netsh is not supported on {platform.system()}.",
            }
            self._cached_info = res_data
            self._cached_info_time = now
            return res_data

        try:
            # 2.0s bounded timeout to prevent hanging the worker thread
            cmd = ["netsh", "wlan", "show", "interfaces"]
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=2.0,
                check=False,
            )
            if res.returncode != 0:
                res_data = {
                    "is_available": False,
                    "connected": False,
                    "state": "error",
                    "error": res.stderr.strip() or f"netsh returned exit code {res.returncode}",
                }
            else:
                # Bounded output reading (up to 64 KB)
                stdout = res.stdout[:65536] if res.stdout else ""
                res_data = self.parse_netsh_interfaces(stdout)
        except subprocess.TimeoutExpired:
            res_data = {
                "is_available": False,
                "connected": False,
                "state": "timeout",
                "error": "netsh wlan interface query timed out after 2.0s.",
            }
        except Exception as exc:
            res_data = {
                "is_available": False,
                "connected": False,
                "state": "error",
                "error": f"Failed to query Wi-Fi interfaces: {exc}",
            }

        self._cached_info = res_data
        self._cached_info_time = now
        return res_data

    async def _query_os_wifi_async(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Non-blocking asynchronous wrapper running the OS query in a thread."""
        return await asyncio.to_thread(self._query_os_wifi_sync, force_refresh)

    def discover_capabilities(self) -> SensorCapabilities:
        """Inspects physical NIC support synchronously."""
        info = self._query_os_wifi_sync()
        is_avail = info.get("is_available", False) and info.get("connected", False)
        unavail_reason = None
        if not is_avail:
            if not info.get("is_available", False):
                unavail_reason = info.get("error") or "No physical Wi-Fi interface detected."
            else:
                unavail_reason = f"Wi-Fi interface present ({info.get('description')}), but state is '{info.get('state')}'."

        adapter_desc = info.get("description", "Wi-Fi Interface")
        display_name = f"{adapter_desc} (Real RSSI)"

        return SensorCapabilities(
            provider_id=self.provider_id,
            name=display_name,
            is_hardware=True,
            is_simulated=False,
            is_available=is_avail,
            unavailability_reason=unavail_reason,
            supported_measurements=[
                "real_rssi_dbm",
                "link_quality_pct",
                "channel",
                "tx_rate_mbps",
                "rx_rate_mbps",
                "rssi_temporal_variance",
            ],
            sampling_rate_hz=1.0,
            requires_authorization=True,
        )

    def get_health(self) -> ProviderHealth:
        info = self._query_os_wifi_sync()
        if not info.get("is_available", False):
            return ProviderHealth(
                provider_id=self.provider_id,
                status="unavailable",
                is_running=False,
                error_message=info.get("error", "Hardware not detected"),
                last_sample_time=self._last_sample_time,
                packets_captured=self._packets_captured,
            )

        if not info.get("connected", False):
            return ProviderHealth(
                provider_id=self.provider_id,
                status="degraded",
                is_running=self._is_running,
                error_message=f"Wi-Fi interface disconnected (state: {info.get('state')})",
                last_sample_time=self._last_sample_time,
                packets_captured=self._packets_captured,
            )

        return ProviderHealth(
            provider_id=self.provider_id,
            status="healthy" if self._is_running else "stopped",
            is_running=self._is_running,
            error_message=self._last_error,
            last_sample_time=self._last_sample_time,
            packets_captured=self._packets_captured,
        )

    async def start(self, room_id: str, speed: float = 1.0) -> None:
        info = await self._query_os_wifi_async()
        if not info.get("is_available", False):
            raise RuntimeError(
                f"Cannot start RealRssiSensorAdapter: {info.get('error', 'Hardware unavailable')}"
            )
        self._room_id = room_id
        self._is_running = True
        self._last_error = None

    async def stop(self) -> None:
        self._is_running = False

    async def reset(self) -> None:
        self._is_running = False
        self._packets_captured = 0
        self._rssi_history.clear()
        self._last_error = None
        self._last_rssi = None

    async def capture_sample(self) -> Optional[RawSensorSample]:
        """Captures a real physical RSSI sample asynchronously."""
        if not self._is_running:
            return None

        info = await self._query_os_wifi_async()
        if not info.get("is_available") or not info.get("connected") or info.get("rssi_dbm") is None:
            self._last_error = info.get("error") or f"Wi-Fi interface not connected (state: {info.get('state')})"
            return None

        rssi_val = float(info["rssi_dbm"])
        self._rssi_history.append(rssi_val)
        self._packets_captured += 1
        self._last_sample_time = utc_now()

        # Compute empirical rolling variance from recent physical RSSI readings
        variance_val = 0.02
        if len(self._rssi_history) >= 2:
            mean = sum(self._rssi_history) / len(self._rssi_history)
            variance_val = sum((x - mean) ** 2 for x in self._rssi_history) / (len(self._rssi_history) - 1)
            # Scale to normalized perturbation range
            variance_val = round(min(1.0, max(0.01, variance_val / 20.0)), 4)

        # Delta proxy for motion perturbation
        doppler_proxy = 0.0
        if self._last_rssi is not None:
            doppler_proxy = round(min(1.0, abs(rssi_val - self._last_rssi) / 10.0), 4)
        self._last_rssi = rssi_val

        quality_score = round(min(1.0, max(0.2, info.get("signal_pct", 50) / 100.0)), 2)

        is_estimated = bool(info.get("rssi_is_estimated", False))
        measurement_type = "estimated_rssi_from_signal_pct" if is_estimated else "direct_hardware_rssi"

        return RawSensorSample(
            timestamp=self._last_sample_time,
            room_id=self._room_id,
            sensor_type="real_wifi_rssi",
            is_simulated=False,
            rssi_dbm=rssi_val,
            sample_count=self._packets_captured,
            subcarrier_variance=variance_val,
            doppler_energy=doppler_proxy,
            noise_floor_dbm=-95.0,
            quality_score=quality_score,
            metadata={
                "adapter_name": info.get("description", "Wi-Fi"),
                "channel": info.get("channel"),
                "band": info.get("band"),
                "radio_type": info.get("radio_type"),
                "anonymized_network_hash": info.get("anonymized_network_hash"),
                "link_quality_pct": info.get("signal_pct"),
                "tx_rate_mbps": info.get("tx_rate_mbps"),
                "rx_rate_mbps": info.get("rx_rate_mbps"),
                "measurement_type": measurement_type,
                "measurement_source": info.get("measurement_source", "direct_driver_rssi"),
                "rssi_is_estimated": is_estimated,
                "direct_dbm_available": not is_estimated,
                "variance_source": "rssi_temporal_variance",
                "is_subcarrier_variance": False,
                "variance_note": (
                    "Value in subcarrier_variance represents temporal RSSI rolling variance across time, "
                    "not multi-subcarrier CSI frequency variance."
                ),
                "doppler_source": "rssi_delta_proxy",
                "is_doppler_phase": False,
                "doppler_note": (
                    "Value in doppler_energy represents absolute RSSI rate-of-change, "
                    "not RF Doppler phase shift."
                ),
                "csi_supported": False,
                "csi_status_note": (
                    "Physical hardware exposes real RSSI signal telemetry; "
                    "raw CSI frame capture requires specialized firmware."
                ),
                "experimental_validation_disclaimer": (
                    "Uncalibrated heuristic model for demonstration only. "
                    "Does NOT claim validated human presence or life-safety detection."
                ),
            },
        )
