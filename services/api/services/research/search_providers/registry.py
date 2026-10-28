from typing import Optional

from services.research.search_providers.base import BaseSearchProvider
from services.research.search_providers.duckduckgo_provider import DuckDuckGoSearchProvider

_custom_search_provider: Optional[BaseSearchProvider] = None


def set_custom_search_provider(provider: Optional[BaseSearchProvider]) -> None:
    """Sets a global search provider override (e.g. MockSearchProvider during testing)."""
    global _custom_search_provider
    _custom_search_provider = provider


def get_search_provider() -> BaseSearchProvider:
    """Returns the active search provider (custom override or default DuckDuckGo)."""
    if _custom_search_provider is not None:
        return _custom_search_provider
    return DuckDuckGoSearchProvider()
