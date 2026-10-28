from abc import ABC, abstractmethod
from typing import Optional

from sensing_types import ProviderHealth, RawSensorSample, SensorCapabilities


class BaseSensorProvider(ABC):
    """Abstract interface defining required lifecycle and telemetry contract for sensor providers."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier for this provider."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Display name of the provider."""
        ...

    @property
    @abstractmethod
    def is_hardware(self) -> bool:
        """True if backed by physical wireless hardware."""
        ...

    @property
    @abstractmethod
    def is_simulated(self) -> bool:
        """True if generating synthetic data."""
        ...

    @abstractmethod
    def discover_capabilities(self) -> SensorCapabilities:
        """Discovers and declares sensor measurement capabilities and device availability."""
        ...

    @abstractmethod
    def get_health(self) -> ProviderHealth:
        """Reports runtime health, packet counts, and error states."""
        ...

    @abstractmethod
    async def start(self, room_id: str, speed: float = 1.0) -> None:
        """Starts observation acquisition for the given room."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """Gracefully halts observation acquisition and releases resources."""
        ...

    @abstractmethod
    async def reset(self) -> None:
        """Resets provider state, sequence counters, or internal buffers."""
        ...

    @abstractmethod
    async def capture_sample(self) -> Optional[RawSensorSample]:
        """Captures a single raw sensor observation window, or None if unavailable/stopped."""
        ...
