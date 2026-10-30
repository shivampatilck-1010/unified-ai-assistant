from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List, Optional
from schemas.provider import ModelInfo


class ProviderError(Exception):
    """Normalized provider exception with code, clean user-facing message, and metadata."""

    def __init__(
        self,
        code: str,
        message: str,
        category: str = "general",
        retry_after: Optional[float] = None,
        routed_model: Optional[str] = None,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.category = category
        self.retry_after = retry_after
        self.routed_model = routed_model
        self.retryable = retryable


class AuthenticationError(ProviderError):
    def __init__(
        self,
        message: str = "Provider authentication failed. Check your API key.",
        routed_model: Optional[str] = None,
    ):
        super().__init__(
            code="AUTHENTICATION_FAILED",
            message=message,
            category="authentication",
            retry_after=None,
            routed_model=routed_model,
            retryable=False,
        )


class RateLimitError(ProviderError):
    def __init__(
        self,
        message: str = "Provider rate limit exceeded. Try again shortly.",
        category: str = "rate_limit",
        retry_after: Optional[float] = None,
        routed_model: Optional[str] = None,
        retryable: bool = True,
    ):
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=message,
            category=category,
            retry_after=retry_after,
            routed_model=routed_model,
            retryable=retryable,
        )


class TimeoutError(ProviderError):
    def __init__(
        self,
        message: str = "Provider request timed out.",
        routed_model: Optional[str] = None,
    ):
        super().__init__(
            code="PROVIDER_TIMEOUT",
            message=message,
            category="timeout",
            retry_after=None,
            routed_model=routed_model,
            retryable=True,
        )


class InvalidModelError(ProviderError):
    def __init__(self, model: str, provider: str):
        super().__init__(
            code="INVALID_MODEL",
            message=f"Model '{model}' is not supported by provider '{provider}'.",
            category="invalid_model",
            retry_after=None,
            routed_model=model,
            retryable=False,
        )


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
