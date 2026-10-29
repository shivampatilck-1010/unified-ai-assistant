import logging
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.orchestration import CapabilityType

logger = logging.getLogger("orchestration_registry")


class CapabilityRiskLevel(str, Enum):
    """Categorization of operational risk associated with a capability."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CONSEQUENTIAL = "consequential"


class CapabilityDefinition(BaseModel):
    """Formal definition and contract for a subsystem capability registered in the engine."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    identifier: str = Field(description="Unique stable capability key")
    name: str = Field(description="Human readable name")
    description: str = Field(description="Purpose and scope of the capability")
    input_schema: Dict[str, Any] = Field(description="JSON Schema defining acceptable parameter structure")
    output_schema: Dict[str, Any] = Field(description="JSON Schema defining returned payload format")
    required_permissions: List[str] = Field(default_factory=list, description="Scopes required to execute this capability")
    risk_level: CapabilityRiskLevel = Field(default=CapabilityRiskLevel.LOW)
    requires_confirmation: bool = Field(default=False, description="Mandates explicit human confirmation before execution")


HandlerFunc = Callable[..., Coroutine[Any, Any, Dict[str, Any]]]


class CapabilityRegistry:
    """Central registry maintaining registered subsystem capabilities and their execution handlers."""

    def __init__(self):
        self._capabilities: Dict[str, CapabilityDefinition] = {}
        self._handlers: Dict[str, HandlerFunc] = {}

    def register(
        self,
        definition: CapabilityDefinition,
        handler: HandlerFunc,
    ) -> None:
        """Registers a capability with its execution handler adapter."""
        self._capabilities[definition.identifier] = definition
        self._handlers[definition.identifier] = handler
        logger.debug("Registered capability: %s (risk: %s)", definition.identifier, definition.risk_level)

    def get(self, identifier: str) -> Optional[CapabilityDefinition]:
        """Retrieves a capability definition by key."""
        return self._capabilities.get(identifier)

    def list_all(self) -> List[CapabilityDefinition]:
        """Returns all registered capability definitions."""
        return list(self._capabilities.values())

    def get_handler(self, identifier: str) -> Optional[HandlerFunc]:
        """Retrieves execution handler for the capability."""
        return self._handlers.get(identifier)

    async def execute(
        self,
        identifier: str,
        db: AsyncSession,
        owner_id: str,
        parameters: Dict[str, Any],
        context: Dict[int, Any],
    ) -> Dict[str, Any]:
        """Executes a capability using its registered adapter handler."""
        cap = self.get(identifier)
        if not cap:
            return {
                "success": False,
                "error": f"Unknown capability '{identifier}' not found in registry.",
                "summary": f"Capability {identifier} is unregistered.",
                "data": None,
                "citations": [],
            }

        handler = self.get_handler(identifier)
        if not handler:
            return {
                "success": False,
                "error": f"No execution handler registered for capability '{identifier}'.",
                "summary": f"Handler missing for {identifier}.",
                "data": None,
                "citations": [],
            }

        return await handler(db=db, owner_id=owner_id, params=parameters, context=context)


# Global singleton instance
_registry_instance = CapabilityRegistry()


def get_capability_registry() -> CapabilityRegistry:
    return _registry_instance
