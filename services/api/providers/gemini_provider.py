import os
from typing import AsyncGenerator, Dict, List, Optional
from google import genai
from google.genai import errors as genai_errors

from providers.base import (
    AuthenticationError,
    BaseProviderAdapter,
    InvalidModelError,
    ProviderError,
    RateLimitError,
    TimeoutError,
)
from schemas.provider import ModelInfo


class GeminiProvider(BaseProviderAdapter):
    """Google Gemini official SDK adapter."""

    MODELS = [
        ModelInfo(
            id="gemini-2.0-flash",
            name="Gemini 2.0 Flash",
            provider="gemini",
            context_window=1048576,
            is_default=True,
        ),
        ModelInfo(
            id="gemini-1.5-flash",
            name="Gemini 1.5 Flash",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
        ModelInfo(
            id="gemini-1.5-pro",
            name="Gemini 1.5 Pro",
            provider="gemini",
            context_window=2097152,
            is_default=False,
        ),
    ]

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or os.getenv("GEMINI_API_KEY")

    @property
    def provider_id(self) -> str:
        return "gemini"

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def list_models(self) -> List[ModelInfo]:
        return self.MODELS

    def _get_client(self) -> genai.Client:
        if not self.is_configured():
            raise AuthenticationError("Gemini API key is not configured on the server.")
        return genai.Client(api_key=self._api_key)

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        selected_model = model or "gemini-2.0-flash"
        valid_models = {m.id for m in self.MODELS}
        if selected_model not in valid_models:
            raise InvalidModelError(selected_model, self.provider_id)

        client = self._get_client()

        # Format messages for Gemini
        # Gemini accepts a list of content strings or role/parts structures
        contents = []
        for msg in messages:
            role = "user" if msg.get("role") == "user" else "model"
            content = msg.get("content", "")
            contents.append({"role": role, "parts": [{"text": content}]})

        try:
            response_stream = await client.aio.models.generate_content_stream(
                model=selected_model,
                contents=contents,  # type: ignore
            )
            async for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
        except genai_errors.APIError as err:
            status_code = getattr(err, "code", None)
            message = str(err)
            if status_code in (401, 403) or "API_KEY_INVALID" in message:
                raise AuthenticationError(message) from err
            elif status_code == 429 or "RESOURCE_EXHAUSTED" in message:
                raise RateLimitError(message) from err
            elif status_code == 408 or "DEADLINE_EXCEEDED" in message:
                raise TimeoutError(message) from err
            else:
                raise ProviderError("GEMINI_ERROR", message) from err
        except Exception as err:
            raise ProviderError("GEMINI_ERROR", str(err)) from err

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        parts = []
        async for chunk in self.generate_stream(messages, model):
            parts.append(chunk)
        return "".join(parts)
