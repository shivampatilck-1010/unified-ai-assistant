import os
from typing import AsyncGenerator, Dict, List, Optional
import anthropic
from anthropic import AsyncAnthropic

from providers.base import (
    AuthenticationError,
    BaseProviderAdapter,
    InvalidModelError,
    ProviderError,
    RateLimitError,
    TimeoutError,
)
from schemas.provider import ModelInfo


class AnthropicProvider(BaseProviderAdapter):
    """Anthropic official SDK adapter."""

    MODELS = [
        ModelInfo(
            id="claude-3-5-sonnet-20241022",
            name="Claude 3.5 Sonnet",
            provider="anthropic",
            context_window=200000,
            is_default=True,
        ),
        ModelInfo(
            id="claude-3-5-haiku-20241022",
            name="Claude 3.5 Haiku",
            provider="anthropic",
            context_window=200000,
            is_default=False,
        ),
    ]

    def __init__(self, api_key: Optional[str] = None):
        self._explicit_api_key = api_key

    @property
    def provider_id(self) -> str:
        return "anthropic"

    @property
    def _api_key(self) -> Optional[str]:
        return self._explicit_api_key or os.getenv("ANTHROPIC_API_KEY")

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def list_models(self) -> List[ModelInfo]:
        return self.MODELS

    def _get_client(self) -> AsyncAnthropic:
        if not self.is_configured():
            raise AuthenticationError("Anthropic API key is not configured on the server.")
        return AsyncAnthropic(api_key=self._api_key)

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        selected_model = model or "claude-3-5-sonnet-20241022"
        valid_models = {m.id for m in self.MODELS}
        if selected_model not in valid_models:
            raise InvalidModelError(selected_model, self.provider_id)

        client = self._get_client()

        # Format messages for Anthropic (extract system if present, ensure alternating user/assistant)
        anthropic_messages = []
        system_prompt = None

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                system_prompt = content
            else:
                anthropic_messages.append({"role": role, "content": content})

        kwargs: Dict[str, object] = {
            "model": selected_model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        try:
            async with client.messages.stream(**kwargs) as stream:  # type: ignore
                async for text in stream.text_stream:
                    yield text
        except anthropic.AuthenticationError as err:
            raise AuthenticationError(
                message="Anthropic authentication failed. Please verify that your ANTHROPIC_API_KEY is valid on the server.",
                routed_model=selected_model,
            ) from err
        except anthropic.RateLimitError as err:
            clean_message = f"Anthropic rate limit exceeded for {selected_model}. Please try again shortly."
            raise RateLimitError(
                message=clean_message,
                category="rate_limit_rpm",
                retry_after=None,
                routed_model=selected_model,
                retryable=True,
            ) from err
        except anthropic.APITimeoutError as err:
            raise TimeoutError(
                message=f"Anthropic request timed out for {selected_model}. Please try again.",
                routed_model=selected_model,
            ) from err
        except anthropic.APIError as err:
            clean_message = f"Anthropic service encountered an error while processing with {selected_model}. Please try again."
            raise ProviderError("ANTHROPIC_ERROR", clean_message, category="service_error", routed_model=selected_model, retryable=True) from err

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        parts = []
        async for chunk in self.generate_stream(messages, model):
            parts.append(chunk)
        return "".join(parts)
