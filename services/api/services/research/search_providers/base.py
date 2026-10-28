from abc import ABC, abstractmethod
from typing import List, Optional
from pydantic import BaseModel


class DiscoveredSourceItem(BaseModel):
    title: str
    url: str
    snippet: str
    publisher: str = "Web Source"


class BaseSearchProvider(ABC):
    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique provider identifier."""
        pass

    @abstractmethod
    async def search(
        self,
        query: str,
        num_results: int = 5,
        allowed_domains: Optional[List[str]] = None,
    ) -> List[DiscoveredSourceItem]:
        """Discovers web sources for the given query, respecting domain constraints."""
        pass
