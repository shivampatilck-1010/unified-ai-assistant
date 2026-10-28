import json
import sys
import os

# Add services/api to sys.path so tests can import main
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api")))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


def _parse_sse_events(body: str) -> list[dict]:
    """Parse an SSE response body into a list of {event, data} dicts."""
    events = []
    current_event = None
    current_data_lines = []

    for line in body.split("\n"):
        if line.startswith("event: "):
            current_event = line[len("event: "):]
        elif line.startswith("data: "):
            current_data_lines.append(line[len("data: "):])
        elif line == "":
            if current_event is not None and current_data_lines:
                raw = "\n".join(current_data_lines)
                events.append({"event": current_event, "data": json.loads(raw)})
                current_event = None
                current_data_lines = []

    return events


# ---- Tests ----------------------------------------------------------------


def test_provider_status_unconfigured():
    """GET /api/provider/status returns configured: false when no keys set."""
    # Ensure no provider keys are set
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(key, None)

    response = client.get("/api/provider/status")
    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["provider"] is None


def test_chat_stream_no_provider():
    """POST /api/chat/stream emits error events when no provider is configured."""
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(key, None)

    response = client.post("/api/chat/stream", json={"message": "Hello!"})
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    events = _parse_sse_events(response.text)
    assert len(events) == 3

    # First event: message_start
    assert events[0]["event"] == "message_start"
    assert "conversation_id" in events[0]["data"]
    assert "message_id" in events[0]["data"]

    # Second event: error with PROVIDER_NOT_CONFIGURED
    assert events[1]["event"] == "error"
    assert events[1]["data"]["data"]["code"] == "PROVIDER_NOT_CONFIGURED"

    # Third event: message_complete with finish_reason error
    assert events[2]["event"] == "message_complete"
    assert events[2]["data"]["data"]["finish_reason"] == "error"


def test_chat_stream_empty_message():
    """POST /api/chat/stream with empty message returns 422."""
    response = client.post("/api/chat/stream", json={"message": ""})
    assert response.status_code == 422


def test_chat_stream_generates_conversation_id():
    """POST without conversation_id generates one in the events."""
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(key, None)

    response = client.post("/api/chat/stream", json={"message": "Hi"})
    events = _parse_sse_events(response.text)

    conversation_id = events[0]["data"]["conversation_id"]
    assert conversation_id  # not empty
    assert len(conversation_id) == 36  # UUID4 string length

    # All events share the same conversation_id
    for ev in events:
        assert ev["data"]["conversation_id"] == conversation_id


def test_chat_stream_preserves_conversation_id():
    """POST with an explicit conversation_id echoes it back in events."""
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        os.environ.pop(key, None)

    custom_id = "my-custom-convo-123"
    response = client.post("/api/chat/stream", json={"message": "Hello", "conversation_id": custom_id})
    events = _parse_sse_events(response.text)

    for ev in events:
        assert ev["data"]["conversation_id"] == custom_id
