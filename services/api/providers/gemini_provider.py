import os
import re
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
            id="gemini-3.5-flash-lite",
            name="Gemini 3.5 Flash Lite",
            provider="gemini",
            context_window=1048576,
            is_default=True,
        ),
        ModelInfo(
            id="gemini-flash-lite-latest",
            name="Gemini Flash Lite Latest",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
        ModelInfo(
            id="gemini-3.5-flash",
            name="Gemini 3.5 Flash",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
        ModelInfo(
            id="gemini-3.6-flash",
            name="Gemini 3.6 Flash (Preview)",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
        ModelInfo(
            id="gemini-3.8-flash",
            name="Gemini 3.8 Flash",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
        ModelInfo(
            id="gemini-3-flash-preview",
            name="Gemini 3 Flash Preview",
            provider="gemini",
            context_window=1048576,
            is_default=False,
        ),
    ]

    def __init__(self, api_key: Optional[str] = None):
        self._explicit_api_key = api_key

    @property
    def provider_id(self) -> str:
        return "gemini"

    @property
    def _api_key(self) -> Optional[str]:
        return self._explicit_api_key or os.getenv("GEMINI_API_KEY")

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def list_models(self) -> List[ModelInfo]:
        default_model_id = os.getenv("DEFAULT_GEMINI_MODEL", "gemini-3.5-flash-lite")
        result = []
        for m in self.MODELS:
            result.append(
                ModelInfo(
                    id=m.id,
                    name=m.name,
                    provider=m.provider,
                    context_window=m.context_window,
                    is_default=(m.id == default_model_id),
                )
            )
        if not any(m.is_default for m in result) and result:
            result[0].is_default = True
        return result

    def _get_client(self) -> genai.Client:
        if not self.is_configured():
            raise AuthenticationError("Gemini API key is not configured on the server.")
        return genai.Client(api_key=self._api_key)

    @classmethod
    def _parse_gemini_api_error(cls, err: Exception, requested_model: str) -> ProviderError:
        """Parses Google GenAI API errors into clean, structured ProviderErrors without leaking raw RPC payloads."""
        status_code = getattr(err, "code", None)
        status = getattr(err, "status", None)
        details = getattr(err, "details", None)
        raw_message = getattr(err, "message", None) or str(err)

        # 1. Extract details array
        details_list = []
        if isinstance(details, dict):
            error_dict = details.get("error", details)
            if isinstance(error_dict, dict):
                details_list = error_dict.get("details", [])
        elif isinstance(details, list):
            details_list = details

        # 2. Extract routed_model, quota_id, violation description, retry_after
        routed_model: Optional[str] = None
        quota_id: Optional[str] = None
        violation_desc: Optional[str] = None
        retry_after: Optional[float] = None

        for item in details_list:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("@type", ""))
            if "QuotaFailure" in item_type:
                violations = item.get("violations", [])
                if isinstance(violations, list) and violations:
                    v = violations[0]
                    if isinstance(v, dict):
                        quota_id = v.get("quotaId")
                        violation_desc = v.get("description")
                        dims = v.get("quotaDimensions", {})
                        if isinstance(dims, dict) and "model" in dims:
                            routed_model = dims["model"]
            elif "RetryInfo" in item_type:
                delay = item.get("retryDelay")
                if delay:
                    delay_match = re.search(r"([0-9]+(?:\.[0-9]+)?)s", str(delay))
                    if delay_match:
                        try:
                            retry_after = float(delay_match.group(1))
                        except ValueError:
                            pass

        # Fallback routed_model from text if not extracted from details
        if not routed_model:
            model_match = re.search(r"model:\s*([a-zA-Z0-9.-]+)", raw_message)
            if model_match:
                routed_model = model_match.group(1)

        # Fallback retry_after from text if not extracted (e.g. "retry in 11h43m7.89s" or "retry in 42187s" or 'retryDelay': '42187s')
        if retry_after is None:
            delay_sec_match = re.search(r"['\"]?retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s?['\"]?", raw_message)
            if delay_sec_match:
                try:
                    retry_after = float(delay_sec_match.group(1))
                except ValueError:
                    pass

        if retry_after is None:
            time_match = re.search(r"retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?", raw_message)
            if time_match:
                hours = float(time_match.group(1) or 0)
                minutes = float(time_match.group(2) or 0)
                seconds = float(time_match.group(3) or 0)
                total_sec = hours * 3600 + minutes * 60 + seconds
                if total_sec > 0:
                    retry_after = total_sec

        effective_model = routed_model or requested_model

        # 3. Categorize and build user-friendly messages
        err_str = str(err)
        if status_code in (401, 403) or "API_KEY_INVALID" in err_str or "PERMISSION_DENIED" in err_str:
            return AuthenticationError(
                message="Gemini authentication failed. Please verify that your GEMINI_API_KEY is valid on the server.",
                routed_model=effective_model,
            )

        if status_code == 429 or status == "RESOURCE_EXHAUSTED" or "RESOURCE_EXHAUSTED" in err_str:
            is_daily = False
            if quota_id and "PerDay" in quota_id:
                is_daily = True
            elif violation_desc and ("per day" in violation_desc.lower() or "free tier" in violation_desc.lower()):
                is_daily = True
            elif "per day limit exceeded" in raw_message.lower():
                is_daily = True
            elif retry_after and retry_after > 300:
                is_daily = True

            if is_daily:
                category = "daily_quota_exhausted"
                time_hint = ""
                if retry_after:
                    h = int(retry_after // 3600)
                    m = int((retry_after % 3600) // 60)
                    if h > 0 and m > 0:
                        time_hint = f" The quota resets in approximately {h}h {m}m."
                    elif h > 0:
                        time_hint = f" The quota resets in approximately {h} hour{'s' if h > 1 else ''}."
                    elif m > 0:
                        time_hint = f" The quota resets in approximately {m} minute{'s' if m > 1 else ''}."
                    else:
                        time_hint = f" The quota resets in approximately {int(retry_after)} seconds."

                clean_msg = (
                    f"Gemini has reached its daily free-tier usage limit for {effective_model}.{time_hint} "
                    "You can wait for the quota to reset or select another configured model or provider."
                )
                return RateLimitError(
                    message=clean_msg,
                    category=category,
                    retry_after=retry_after,
                    routed_model=effective_model,
                    retryable=False,
                )
            else:
                category = "rate_limit_rpm"
                if retry_after and retry_after <= 120:
                    clean_msg = (
                        f"Gemini is receiving high traffic for {effective_model}. "
                        f"Please wait {int(retry_after)} seconds before trying again."
                    )
                else:
                    clean_msg = (
                        f"Gemini rate limit exceeded for {effective_model}. "
                        "Please wait a moment before trying again."
                    )
                return RateLimitError(
                    message=clean_msg,
                    category=category,
                    retry_after=retry_after,
                    routed_model=effective_model,
                    retryable=True,
                )

        if status_code == 408 or "DEADLINE_EXCEEDED" in err_str:
            return TimeoutError(
                message=f"Gemini request timed out for {effective_model}. Please try again.",
                routed_model=effective_model,
            )

        # Generic safe error without dumping raw JSON RPC payload
        return ProviderError(
            code="GEMINI_ERROR",
            message=f"Gemini service encountered an error while processing with {effective_model}. Please try again shortly.",
            category="service_error",
            retry_after=retry_after,
            routed_model=effective_model,
            retryable=True,
        )

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        default_model_id = os.getenv("DEFAULT_GEMINI_MODEL", "gemini-3.5-flash-lite")
        selected_model = model or default_model_id
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
            err_str = str(err)
            if status_code in (503, 429, 404) or "RESOURCE_EXHAUSTED" in err_str or "no longer available" in err_str:
                # Upstream demand spike (503), preview model quota exhaustion (429), or retired model (404):
                # Gracefully attempt active fallback models before surfacing error
                fallback_candidates = [
                    m
                    for m in (
                        "gemini-3.5-flash-lite",
                        "gemini-flash-lite-latest",
                        "gemini-3.5-flash",
                        "gemini-3.6-flash",
                        "gemini-3-flash-preview",
                    )
                    if m != selected_model and m in valid_models
                ]
                for fb_model in fallback_candidates:
                    try:
                        fallback_stream = await client.aio.models.generate_content_stream(
                            model=fb_model,
                            contents=contents,  # type: ignore
                        )
                        async for chunk in fallback_stream:
                            if chunk.text:
                                yield chunk.text
                        return
                    except Exception:
                        continue
            raise self._parse_gemini_api_error(err, selected_model) from err
        except ProviderError:
            raise
        except Exception as err:
            raise self._parse_gemini_api_error(err, selected_model) from err

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        parts = []
        async for chunk in self.generate_stream(messages, model):
            parts.append(chunk)
        return "".join(parts)
