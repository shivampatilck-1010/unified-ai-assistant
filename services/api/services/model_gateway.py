from typing import Dict, List, Optional, Tuple
from config import get_settings
from providers.base import (
    AuthenticationError,
    BaseProviderAdapter,
    InvalidModelError,
    ProviderError,
)
from providers.openai_provider import OpenAIProvider
from providers.anthropic_provider import AnthropicProvider
from providers.gemini_provider import GeminiProvider
from schemas.provider import ModelInfo, UnifiedProviderStatusResponse


class ModelGateway:
    """Unified Model Gateway routing LLM requests across configured provider adapters."""

    def __init__(self):
        self._providers: Dict[str, BaseProviderAdapter] = {
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "gemini": GeminiProvider(),
        }

    def reset(self) -> None:
        """Reset gateway state to standard production adapters."""
        self._providers = {
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "gemini": GeminiProvider(),
        }

    def register_provider(self, adapter: BaseProviderAdapter) -> None:
        """Register or override an adapter (useful for dependency injection in tests)."""
        self._providers[adapter.provider_id] = adapter

    def get_provider(self, provider_id: str) -> Optional[BaseProviderAdapter]:
        return self._providers.get(provider_id)

    def is_any_provider_configured(self) -> bool:
        """Returns True if at least one model provider adapter has valid credentials."""
        return any(adapter.is_configured() for adapter in self._providers.values())

    def get_status(self) -> UnifiedProviderStatusResponse:
        settings = get_settings()
        provider_statuses: Dict[str, bool] = {}
        all_models: List[ModelInfo] = []
        active_provider: Optional[str] = None
        active_model: Optional[str] = None

        # Check each provider
        for pid, adapter in self._providers.items():
            is_cfg = adapter.is_configured()
            provider_statuses[pid] = is_cfg
            if is_cfg:
                models = adapter.list_models()
                all_models.extend(models)
                if not active_provider:
                    active_provider = pid
                    # Pick default model for this provider
                    default_m = next((m for m in models if m.is_default), models[0] if models else None)
                    if default_m:
                        active_model = default_m.id

        # Override with explicit server settings if configured
        if settings.default_provider and settings.default_provider in self._providers:
            if self._providers[settings.default_provider].is_configured():
                active_provider = settings.default_provider
        if settings.default_model:
            active_model = settings.default_model

        has_any = any(provider_statuses.values())
        msg = (
            f"Active provider: {active_provider} ({active_model})"
            if has_any
            else "No AI provider configured. Add an API key to the server environment."
        )

        return UnifiedProviderStatusResponse(
            configured=has_any,
            active_provider=active_provider,
            active_model=active_model,
            available_models=all_models,
            providers=provider_statuses,
            message=msg,
        )

    def resolve_provider_and_model(
        self,
        requested_provider: Optional[str] = None,
        requested_model: Optional[str] = None,
    ) -> Tuple[BaseProviderAdapter, str]:
        """Resolves and validates the target provider adapter and model ID."""
        status = self.get_status()

        if not status.configured:
            raise ProviderError(
                "PROVIDER_NOT_CONFIGURED",
                "No AI model provider is configured. Add an API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) to the server environment to enable AI responses.",
            )

        provider_id = requested_provider or status.active_provider
        if not provider_id or provider_id not in self._providers:
            raise ProviderError("UNKNOWN_PROVIDER", f"Provider '{provider_id}' is unknown or not supported.")

        adapter = self._providers[provider_id]
        if not adapter.is_configured():
            raise AuthenticationError(
                f"Provider '{provider_id}' is not configured with an API key on the server."
            )

        models = adapter.list_models()
        valid_model_ids = {m.id for m in models}

        model_id = requested_model
        if not model_id:
            default_m = next((m for m in models if m.is_default), models[0] if models else None)
            model_id = default_m.id if default_m else "default"

        if model_id not in valid_model_ids:
            raise InvalidModelError(model_id, provider_id)

        return adapter, model_id


_gateway_instance = ModelGateway()


def get_model_gateway() -> ModelGateway:
    return _gateway_instance
