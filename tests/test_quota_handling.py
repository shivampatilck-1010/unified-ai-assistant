import json
import pytest
from providers.base import (
    AuthenticationError,
    ProviderError,
    RateLimitError,
    TimeoutError,
)
from providers.gemini_provider import GeminiProvider
from providers.openai_provider import OpenAIProvider
from providers.anthropic_provider import AnthropicProvider
from services.model_gateway import ModelGateway, get_model_gateway
from services.streaming_service import StreamingService
from schemas.streaming import ChatStreamRequest
from schemas.provider import ModelInfo
from database import AsyncSessionLocal
from services.conversation_service import ConversationService
from config import get_settings


class MockGenAIError(Exception):
    """Simulates google.genai.errors.APIError."""
    def __init__(self, code: int, status: str, message: str, details: dict):
        self.code = code
        self.status = status
        self.message = message
        self.details = details
        super().__init__(f"{code} {status}. {details}")


@pytest.fixture(autouse=True)
def clean_gateway(monkeypatch):
    """Ensure gateway is reset before and after each test with clean environment."""
    get_settings.cache_clear()
    get_model_gateway().reset()
    yield
    get_model_gateway().reset()
    get_settings.cache_clear()


def test_gemini_models_list_default_is_2_5_flash():
    """Verify Gemini default model is gemini-2.5-flash for high quota (1,500 RPD) resilience while preserving all models."""
    provider = GeminiProvider()
    models = provider.list_models()
    model_ids = [m.id for m in models]

    assert "gemini-2.5-flash" in model_ids
    assert "gemini-3.6-flash" in model_ids
    assert "gemini-3.5-flash" in model_ids

    default_model = next((m for m in models if m.is_default), None)
    assert default_model is not None
    assert default_model.id == "gemini-2.5-flash"
    assert default_model.name == "Gemini 2.5 Flash"


def test_gemini_parse_daily_quota_exhaustion():
    """Verify Google GenAI 429 daily quota exhaustion is parsed into a structured, clean RateLimitError."""
    # Mimic exact Google GenAI RPC details seen in production screenshot
    mock_details = {
        "error": {
            "code": 429,
            "message": (
                "You exceeded your current quota, please check your plan and billing details. "
                "For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n"
                "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
                "limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded on Free Tier.\n"
                "Please retry in 11h43m7.897674805s."
            ),
            "status": "RESOURCE_EXHAUSTED",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.Help",
                    "links": [{"description": "Learn more about Gemini API quotas", "url": "https://ai.google.dev/gemini-api/docs/rate-limits"}],
                },
                {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [
                        {
                            "description": "Generate content requests per day limit exceeded on Free Tier. See https://ai.google.dev/gemini-api/docs/rate-limits.",
                            "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                            "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                            "quotaDimensions": {"location": "global", "model": "gemini-3.6-flash"},
                            "quotaValue": "20",
                        }
                    ],
                },
                {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    "retryDelay": "42187s",
                },
            ],
        }
    }

    err = MockGenAIError(
        code=429,
        status="RESOURCE_EXHAUSTED",
        message=mock_details["error"]["message"],
        details=mock_details,
    )

    parsed = GeminiProvider._parse_gemini_api_error(err, requested_model="gemini-3.5-flash")

    assert isinstance(parsed, RateLimitError)
    assert parsed.code == "RATE_LIMIT_EXCEEDED"
    assert parsed.category == "daily_quota_exhausted"
    assert parsed.retry_after == 42187.0
    assert parsed.routed_model == "gemini-3.6-flash"
    assert parsed.retryable is False

    # Check clean, sanitized user-facing message
    assert "Gemini has reached its daily free-tier usage limit for gemini-3.6-flash" in parsed.message
    assert "The quota resets in approximately 11h 43m" in parsed.message
    assert "select another configured model or provider" in parsed.message

    # Ensure no internal RPC JSON / dictionaries are leaked into the message
    assert "RESOURCE_EXHAUSTED" not in parsed.message
    assert "@type" not in parsed.message
    assert "google.rpc.QuotaFailure" not in parsed.message
    assert "quotaMetric" not in parsed.message
    assert "{" not in parsed.message


def test_gemini_parse_rpm_rate_limit():
    """Verify Google GenAI 429 RPM rate limit parses retry_after and flags as retryable."""
    mock_details = {
        "error": {
            "code": 429,
            "message": "Resource has been exhausted (e.g. check quota).",
            "status": "RESOURCE_EXHAUSTED",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [
                        {
                            "description": "Requests per minute limit exceeded.",
                            "quotaMetric": "generativelanguage.googleapis.com/generate_content_requests",
                            "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
                            "quotaDimensions": {"location": "global", "model": "gemini-3.6-flash"},
                        }
                    ],
                },
                {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    "retryDelay": "15s",
                },
            ],
        }
    }

    err = MockGenAIError(
        code=429,
        status="RESOURCE_EXHAUSTED",
        message=mock_details["error"]["message"],
        details=mock_details,
    )

    parsed = GeminiProvider._parse_gemini_api_error(err, requested_model="gemini-3.6-flash")

    assert isinstance(parsed, RateLimitError)
    assert parsed.category == "rate_limit_rpm"
    assert parsed.retry_after == 15.0
    assert parsed.retryable is True
    assert "Please wait 15 seconds before trying again" in parsed.message


def test_gemini_parse_raw_text_regex_fallback():
    """Verify fallback regex extraction from message text when details dictionary is absent."""
    raw_text = (
        "429 RESOURCE_EXHAUSTED. model: gemini-3.6-flash, "
        "description: Generate content requests per day limit exceeded on Free Tier. "
        "Please retry in 11h43m7.897674805s."
    )
    err = Exception(raw_text)

    parsed = GeminiProvider._parse_gemini_api_error(err, requested_model="gemini-3.5-flash")

    assert isinstance(parsed, RateLimitError)
    assert parsed.category == "daily_quota_exhausted"
    assert parsed.routed_model == "gemini-3.6-flash"
    assert parsed.retry_after is not None
    assert parsed.retry_after > 42000
    assert parsed.retryable is False
    assert "Gemini has reached its daily free-tier usage limit" in parsed.message


def test_gemini_parse_auth_and_timeout():
    """Verify 401/403 and timeout parsing produce clean user-facing messages."""
    auth_err = MockGenAIError(code=403, status="PERMISSION_DENIED", message="API_KEY_INVALID", details={})
    parsed_auth = GeminiProvider._parse_gemini_api_error(auth_err, requested_model="gemini-3.6-flash")
    assert isinstance(parsed_auth, AuthenticationError)
    assert "GEMINI_API_KEY" in parsed_auth.message

    timeout_err = MockGenAIError(code=408, status="DEADLINE_EXCEEDED", message="Deadline exceeded", details={})
    parsed_timeout = GeminiProvider._parse_gemini_api_error(timeout_err, requested_model="gemini-3.6-flash")
    assert isinstance(parsed_timeout, TimeoutError)
    assert "timed out" in parsed_timeout.message


@pytest.mark.asyncio
async def test_streaming_service_quota_error_sse_and_db_persistence():
    """Verify SSE streaming emits structured error metadata and database saves clean message."""
    class FailingAdapter(GeminiProvider):
        @property
        def provider_id(self) -> str:
            return "gemini"

        def is_configured(self) -> bool:
            return True

        async def generate_stream(self, messages, model=None):
            if False:
                yield ""
            raise RateLimitError(
                message="Gemini has reached its daily free-tier usage limit for gemini-3.6-flash. The quota resets in approximately 11h 43m.",
                category="daily_quota_exhausted",
                retry_after=42187.0,
                routed_model="gemini-3.6-flash",
                retryable=False,
            )

    get_model_gateway().register_provider("gemini", FailingAdapter())

    async with AsyncSessionLocal() as db:
        conv = await ConversationService.create_conversation(db, owner_id="test-user", title="Quota Test")
        request = ChatStreamRequest(
            conversation_id=conv.id,
            message="Hello",
            provider="gemini",
            model="gemini-3.6-flash",
        )

        events = []
        async for sse_chunk in StreamingService.stream_chat(
            db=db,
            request=request,
            owner_id="test-user",
        ):
            events.append(sse_chunk)

        # Parse SSE events
        raw_stream = "".join(events)
        assert "event: error" in raw_stream
        assert "event: message_complete" in raw_stream

        # Find error event line
        error_lines = [b for b in raw_stream.split("\n\n") if "event: error" in b]
        assert len(error_lines) >= 1
        data_line = next(line for line in error_lines[0].split("\n") if line.startswith("data: "))
        error_payload = json.loads(data_line[6:])

        assert error_payload["event"] == "error"
        data = error_payload["data"]
        assert data["code"] == "RATE_LIMIT_EXCEEDED"
        assert data["category"] == "daily_quota_exhausted"
        assert data["retry_after"] == 42187.0
        assert data["routed_model"] == "gemini-3.6-flash"
        assert data["retryable"] is False
        assert "Gemini has reached its daily free-tier usage limit" in data["message"]

        # Inspect database message
        db_conv = await ConversationService.get_conversation(db, conv.id, "test-user")
        assert db_conv is not None
        assistant_msg = next((m for m in db_conv.messages if m.role == "assistant"), None)
        assert assistant_msg is not None
        assert assistant_msg.status == "error"
        assert "Gemini has reached its daily free-tier usage limit" in assistant_msg.content
        assert "{" not in assistant_msg.content  # Clean message, not raw json

        meta = json.loads(assistant_msg.extra_metadata or "{}")
        assert meta["error_code"] == "RATE_LIMIT_EXCEEDED"
        assert meta["category"] == "daily_quota_exhausted"
        assert meta["retry_after"] == 42187.0
        assert meta["routed_model"] == "gemini-3.6-flash"
        assert meta["retryable"] is False


def test_safe_fallback_configuration():
    """Verify automatic provider switching is off by default to prevent unexpected paid API charges."""
    settings = get_settings()
    assert hasattr(settings, "allow_provider_fallback")
    assert settings.allow_provider_fallback is False
