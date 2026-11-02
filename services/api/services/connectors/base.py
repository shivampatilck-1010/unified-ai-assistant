from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ConnectorType(str, Enum):
    EMAIL = "email"
    CALENDAR = "calendar"
    CLOUD_STORAGE = "cloud_storage"
    DEVELOPER_GIT = "developer_git"
    RESEARCH_API = "research_api"


class PermissionScope(str, Enum):
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


class ConnectedServiceAccount(BaseModel):
    id: str
    owner_id: str
    connector_type: ConnectorType
    service_name: str  # e.g., "Google Calendar", "GitHub", "Dropbox"
    scopes: List[PermissionScope]
    is_active: bool = True
    connected_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_used_at: Optional[str] = None
    credential_masked: str  # Never expose raw secrets


class BaseConnector(ABC):
    """Abstract base class for authorized third-party service connectors."""

    @property
    @abstractmethod
    def connector_type(self) -> ConnectorType:
        pass

    @property
    @abstractmethod
    def service_name(self) -> str:
        pass

    @abstractmethod
    async def test_connection(self, credentials: Dict[str, Any]) -> bool:
        pass

    @abstractmethod
    async def execute_action(
        self,
        account: ConnectedServiceAccount,
        action_name: str,
        parameters: Dict[str, Any],
    ) -> Dict[str, Any]:
        pass
