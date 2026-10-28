from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List, Optional
from schemas.provider import ModelInfo


class ProviderError(Exception):
    """Normalized provider exception with code and message."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AuthenticationError(ProviderError):
    def __init__(self, message: str = "Provider authentication failed. Check your API key."):
        super().__init__("AUTHENTICATION_FAILED", message)


class RateLimitError(ProviderError):
    def __init__(self, message: str = "Provider rate limit exceeded. Try again shortly."):
        super().__init__("RATE_LIMIT_EXCEEDED", message)


class TimeoutError(ProviderError):
    def __init__(self, message: str = "Provider request timed out."):
        super().__init__("PROVIDER_TIMEOUT", message)


class InvalidModelError(ProviderError):
    def __init__(self, model: str, provider: str):
        super().__init__("INVALID_MODEL", f"Model '{model}' is not supported by provider '{provider}'.")


class BaseProviderAdapter(ABC):
    """Abstract base adapter contract for unified AI model providers."""

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Provider identifier: 'openai', 'anthropic', or 'gemini'."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Returns True if the required server-side credentials are present."""
        pass

    @abstractmethod
    def list_models(self) -> List[ModelInfo]:
        """Returns the permitted model options for this provider."""
        pass

    @abstractmethod
    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Yields text chunks incrementally as they arrive from the provider."""
        pass

    @abstractmethod
    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        """Non-streaming text generation helper."""
        pass
