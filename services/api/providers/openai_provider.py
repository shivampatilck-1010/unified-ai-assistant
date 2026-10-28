import os
from typing import AsyncGenerator, Dict, List, Optional
import openai
from openai import AsyncOpenAI

from providers.base import (
    AuthenticationError,
    BaseProviderAdapter,
    InvalidModelError,
    ProviderError,
    RateLimitError,
    TimeoutError,
)
from schemas.provider import ModelInfo


class OpenAIProvider(BaseProviderAdapter):
    """OpenAI official SDK adapter."""

    MODELS = [
        ModelInfo(
            id="gpt-4o",
            name="GPT-4o",
            provider="openai",
            context_window=128000,
            is_default=True,
        ),
        ModelInfo(
            id="gpt-4o-mini",
            name="GPT-4o Mini",
            provider="openai",
            context_window=128000,
            is_default=False,
        ),
        ModelInfo(
            id="o1-mini",
            name="o1-mini",
            provider="openai",
            context_window=128000,
            is_default=False,
        ),
    ]

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")

    @property
    def provider_id(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def list_models(self) -> List[ModelInfo]:
        return self.MODELS

    def _get_client(self) -> AsyncOpenAI:
        if not self.is_configured():
            raise AuthenticationError("OpenAI API key is not configured on the server.")
        return AsyncOpenAI(api_key=self._api_key)

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        selected_model = model or "gpt-4o"
        valid_models = {m.id for m in self.MODELS}
        if selected_model not in valid_models:
            raise InvalidModelError(selected_model, self.provider_id)

        client = self._get_client()

        try:
            stream = await client.chat.completions.create(
                model=selected_model,
                messages=messages,  # type: ignore
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except openai.AuthenticationError as err:
            raise AuthenticationError(str(err)) from err
        except openai.RateLimitError as err:
            raise RateLimitError(str(err)) from err
        except openai.APITimeoutError as err:
            raise TimeoutError(str(err)) from err
        except openai.APIError as err:
            raise ProviderError("OPENAI_ERROR", str(err)) from err

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        parts = []
        async for chunk in self.generate_stream(messages, model):
            parts.append(chunk)
        return "".join(parts)
