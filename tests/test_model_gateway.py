import asyncio
import json
from typing import AsyncGenerator, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient

from main import app
from providers.base import (
    AuthenticationError,
    BaseProviderAdapter,
    InvalidModelError,
    ProviderError,
    RateLimitError,
    TimeoutError,
)
from schemas.provider import ModelInfo
from services.model_gateway import ModelGateway, get_model_gateway
from services.streaming_service import StreamingService
from schemas.streaming import ChatStreamRequest

client = TestClient(app)


class MockProviderAdapter(BaseProviderAdapter):
    """Explicitly labeled unit test adapter verifying streaming and error handling."""

    def __init__(
        self,
        provider_id: str = "mock-test-provider",
        configured: bool = True,
        fail_with: Optional[Exception] = None,
        chunks: Optional[List[str]] = None,
    ):
        self._provider_id = provider_id
        self._configured = configured
        self._fail_with = fail_with
        self._chunks = chunks or ["Hello", " world", " from", " test", " model."]

    @property
    def provider_id(self) -> str:
        return self._provider_id

    def is_configured(self) -> bool:
        return self._configured

    def list_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id="test-model-1",
                name="Test Model 1",
                provider=self._provider_id,
                context_window=8192,
                is_default=True,
            ),
            ModelInfo(
                id="test-model-2",
                name="Test Model 2",
                provider=self._provider_id,
                context_window=16384,
                is_default=False,
            ),
        ]

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        if self._fail_with:
            raise self._fail_with
        for chunk in self._chunks:
            yield chunk

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        if self._fail_with:
            raise self._fail_with
        return "".join(self._chunks)


@pytest.fixture(autouse=True)
def clean_gateway(monkeypatch):
    """Ensure gateway is reset before and after each test with clean environment."""
    from config import get_settings
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEFAULT_PROVIDER", "DEFAULT_MODEL"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    get_model_gateway().reset()
    yield
    get_model_gateway().reset()
    get_settings.cache_clear()


def test_model_gateway_provider_selection_and_models():
    gateway = ModelGateway()
    mock_adapter = MockProviderAdapter(configured=True)
    gateway.register_provider(mock_adapter)

    status = gateway.get_status()
    assert status.configured is True
    assert status.active_provider == "mock-test-provider"
    assert status.active_model == "test-model-1"
    assert any(m.id == "test-model-1" for m in status.available_models)


def test_model_gateway_invalid_model_rejection():
    gateway = ModelGateway()
    mock_adapter = MockProviderAdapter(configured=True)
    gateway.register_provider(mock_adapter)

    with pytest.raises(InvalidModelError):
        gateway.resolve_provider_and_model(
            requested_provider="mock-test-provider",
            requested_model="non-existent-model",
        )


def test_model_gateway_unconfigured_provider_rejection():
    gateway = ModelGateway()
    mock_configured = MockProviderAdapter(provider_id="configured-test", configured=True)
    mock_unconfigured = MockProviderAdapter(provider_id="unconfigured-test", configured=False)
    gateway.register_provider(mock_configured)
    gateway.register_provider(mock_unconfigured)

    with pytest.raises(AuthenticationError):
        gateway.resolve_provider_and_model(
            requested_provider="unconfigured-test",
            requested_model="test-model-1",
        )


def _parse_sse(body: str) -> List[dict]:
    events = []
    for block in body.split("\n\n"):
        if not block.strip():
            continue
        etype = None
        data = None
        for line in block.split("\n"):
            if line.startswith("event: "):
                etype = line[7:].strip()
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if etype and data:
            events.append({"event": etype, "data": data})
    return events


def test_successful_streaming_with_mock_adapter():
    global_gateway = get_model_gateway()
    mock_adapter = MockProviderAdapter(
        provider_id="stream-test-provider",
        configured=True,
        chunks=["First chunk, ", "second chunk."],
    )
    global_gateway.register_provider(mock_adapter)

    response = client.post(
        "/api/chat/stream",
        json={
            "message": "Explain tests",
            "provider": "stream-test-provider",
            "model": "test-model-1",
        },
    )
    assert response.status_code == 200
    events = _parse_sse(response.text)

    # 1. message_start
    assert events[0]["event"] == "message_start"

    # 2. text_delta events
    deltas = [e["data"]["data"]["text"] for e in events if e["event"] == "text_delta"]
    assert deltas == ["First chunk, ", "second chunk."]

    # 3. message_complete
    complete = next(e for e in events if e["event"] == "message_complete")
    assert complete["data"]["data"]["finish_reason"] == "stop"

    # Verify message was persisted into database
    conv_id = events[0]["data"]["conversation_id"]
    conv_res = client.get(f"/api/conversations/{conv_id}")
    assert conv_res.status_code == 200
    messages = conv_res.json()["messages"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Explain tests"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "First chunk, second chunk."
    assert messages[1]["status"] == "completed"


def test_streaming_rate_limit_error_handling():
    global_gateway = get_model_gateway()
    mock_adapter = MockProviderAdapter(
        provider_id="rate-limit-provider",
        configured=True,
        fail_with=RateLimitError("Rate limit exceeded test message"),
    )
    global_gateway.register_provider(mock_adapter)

    response = client.post(
        "/api/chat/stream",
        json={
            "message": "Test rate limit",
            "provider": "rate-limit-provider",
            "model": "test-model-1",
        },
    )
    events = _parse_sse(response.text)
    err = next(e for e in events if e["event"] == "error")
    assert err["data"]["data"]["code"] == "RATE_LIMIT_EXCEEDED"

    complete = next(e for e in events if e["event"] == "message_complete")
    assert complete["data"]["data"]["finish_reason"] == "error"


def test_streaming_timeout_error_handling():
    global_gateway = get_model_gateway()
    mock_adapter = MockProviderAdapter(
        provider_id="timeout-provider",
        configured=True,
        fail_with=TimeoutError("Provider timed out after 30s"),
    )
    global_gateway.register_provider(mock_adapter)

    response = client.post(
        "/api/chat/stream",
        json={
            "message": "Test timeout",
            "provider": "timeout-provider",
            "model": "test-model-1",
        },
    )
    events = _parse_sse(response.text)
    err = next(e for e in events if e["event"] == "error")
    assert err["data"]["data"]["code"] == "PROVIDER_TIMEOUT"
