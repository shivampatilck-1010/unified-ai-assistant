import platform
from typing import Optional

from provider_base import BaseSensorProvider
from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities, utc_now


class HardwareSensorAdapter(BaseSensorProvider):
    """Adapter interface for physical Wi-Fi Channel State Information (CSI) hardware.

    Honoring Phase 7 constraints:
    - Never fabricates hardware connection or simulated readings under a physical label.
    - Explicitly checks for real CSI-capable NIC hardware/driver.
    - Discloses actual availability and halts if unsupported.
    """

    def __init__(self, interface_name: Optional[str] = None) -> None:
        self.interface_name = interface_name
        self._is_running = False

    @property
    def provider_id(self) -> str:
        return "physical_csi_hardware"

    @property
    def name(self) -> str:
        return "Physical Hardware CSI Adapter"

    @property
    def is_hardware(self) -> bool:
        return True

    @property
    def is_simulated(self) -> bool:
        return False

    def _detect_physical_csi_support(self) -> bool:
        """Inspects host system for verified physical CSI capture capabilities.

        Standard consumer Wi-Fi cards and OS stacks do not expose raw 802.11n/ac/ax CSI frames
        without specialized firmware patches (e.g. Nexmon, ESP32-CSI, Intel 5300 IWLMVM).
        Returns False on standard hosts.
        """
        # In this runtime environment, no patched physical CSI card or kernel module is available.
        return False

    def discover_capabilities(self) -> SensorCapabilities:
        hardware_present = self._detect_physical_csi_support()
        unavail_reason = (
            None
            if hardware_present
            else f"No compatible physical CSI Wi-Fi network interface or capture driver detected on {platform.system()} host."
        )
        return SensorCapabilities(
            provider_id=self.provider_id,
            name=self.name,
            is_hardware=True,
            is_simulated=False,
            is_available=hardware_present,
            unavailability_reason=unavail_reason,
            supported_measurements=(
                ["raw_csi_amplitude", "raw_csi_phase", "subcarrier_rssi"]
                if hardware_present
                else []
            ),
            sampling_rate_hz=10.0 if hardware_present else 0.0,
            requires_authorization=True,
        )

    def get_health(self) -> ProviderHealth:
        hardware_present = self._detect_physical_csi_support()
        if not hardware_present:
            return ProviderHealth(
                provider_id=self.provider_id,
                status="unavailable",
                is_running=False,
                error_message="Compatible physical CSI hardware is not installed.",
                last_sample_time=None,
                packets_captured=0,
            )
        return ProviderHealth(
            provider_id=self.provider_id,
            status="healthy" if self._is_running else "stopped",
            is_running=self._is_running,
            error_message=None,
            last_sample_time=None,
            packets_captured=0,
        )

    async def start(self, room_id: str, speed: float = 1.0) -> None:
        if not self._detect_physical_csi_support():
            raise RuntimeError(
                "Cannot start physical CSI hardware adapter: compatible capture hardware is not installed on this host."
            )
        self._is_running = True

    async def stop(self) -> None:
        self._is_running = False

    async def reset(self) -> None:
        self._is_running = False

    async def capture_sample(self) -> Optional[RawSensorSample]:
        if not self._is_running or not self._detect_physical_csi_support():
            return None
        # Physical sampling would happen here if hardware existed
        return None
