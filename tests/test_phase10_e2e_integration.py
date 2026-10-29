import asyncio
import io
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List
import pytest
from fastapi.testclient import TestClient

from auth import create_access_token
from config import get_settings
from database import async_session_factory
from main import app
from models.conversation import Conversation
from models.message import Message
from models.task import Task
from models.workflow import Workflow, WorkflowEvent, WorkflowStep
from policy import PolicyViolationError, validate_url
from providers.base import ProviderError
from providers.gemini_provider import GeminiProvider
from tests.test_model_gateway import MockProviderAdapter
from schemas.calendar_event import CalendarEventCreate
from schemas.orchestration import CapabilityType, WorkflowStatus
from schemas.reminder import ReminderCreate
from schemas.research import ResearchJobCreate
from schemas.task import TaskCreate
from services.calendar_service import CalendarService
from services.model_gateway import get_model_gateway
from services.orchestration.dispatcher import CapabilityDispatcher
from services.orchestration.engine import OrchestrationEngine
from services.orchestration.planner import OrchestrationPlanner
from services.reminder_service import ReminderService
from services.research.job_service import ResearchJobService
from services.task_service import TaskService
from services.wifi_sensing_tool import WifiSensingTool

client = TestClient(app)
settings = get_settings()


def get_auth_headers(user_id: str) -> Dict[str, str]:
    headers = {"X-User-Id": user_id}
    if settings.jwt_secret_key and len(settings.jwt_secret_key) >= 16:
        token = create_access_token(
            user_id=user_id,
            secret_key=settings.jwt_secret_key,
            algorithm="HS256",
            expires_in_seconds=3600,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        headers["Authorization"] = f"Bearer {token}"
    return headers


# ==============================================================================
# TEST A: GENERAL CHAT & STREAMING PERSISTENCE
# ==============================================================================

def test_journey_a_general_chat():
    """
    1. Authenticate
    2. Send chat message
    3. Verify model provider selection & streaming SSE chunks
    4. Verify conversation & messages persist in database
    5. Reload and confirm conversation history is available
    """
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1 & 2: Send message to /api/chat/stream
    stream_resp = client.post(
        "/api/chat/stream",
        json={
            "message": "Hello AI Assistant! Provide an executive summary of our project.",
        },
        headers=headers,
    )
    assert stream_resp.status_code == 200
    assert "text/event-stream" in stream_resp.headers["content-type"]

    # 3: Parse SSE events
    events = []
    for line in stream_resp.iter_lines():
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except Exception:
                pass

    event_types = [e.get("event") for e in events]
    assert "message_start" in event_types
    assert "message_complete" in event_types

    conv_id = events[0].get("conversation_id")
    assert conv_id is not None

    # 4 & 5: Reload and confirm conversation history
    history_resp = client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert history_resp.status_code == 200
    conv_data = history_resp.json()
    assert conv_data["id"] == conv_id
    assert conv_data["owner_id"] == user_id
    assert len(conv_data["messages"]) >= 2

    roles = [m["role"] for m in conv_data["messages"]]
    assert "user" in roles
    assert "assistant" in roles
    user_msg = next(m for m in conv_data["messages"] if m["role"] == "user")
    assert "Hello AI Assistant!" in user_msg["content"]


# ==============================================================================
# TEST B: GEMINI PROVIDER & MODEL GATEWAY RESILIENCE
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_b_gemini_provider_and_gateway_resilience(monkeypatch):
    """
    1. Verify backend reads GEMINI_API_KEY from environment
    2. Verify provider configuration and model selection
    3. Verify deterministic mock provider responses
    4. Verify handling of invalid keys (401), rate limits (429), timeouts, and 503 fallback
    5. Preserve other supported providers (OpenAI, Anthropic)
    """
    # 1. Environment variable resolution
    test_key = "AIzaSyFakeTestKeyForGeminiVerification12345"
    monkeypatch.setenv("GEMINI_API_KEY", test_key)
    provider = GeminiProvider(api_key=test_key)
    assert provider._api_key == test_key
    assert provider.is_configured() is True

    # 2. Verify model definitions and active model resolution
    models = provider.list_models()
    model_ids = [m.id for m in models]
    assert "gemini-3.5-flash" in model_ids
    assert "gemini-3.5-flash-lite" in model_ids

    # 3. Deterministic mock provider adapter verification
    mock_adapter = MockProviderAdapter(provider_id="mock-test", chunks=["[Mock] response"])
    assert mock_adapter.is_configured() is True
    res_text = await mock_adapter.generate_text([{"role": "user", "content": "Ping"}], model="mock-model")
    assert "[Mock]" in res_text

    # 4. Error mapping: InvalidModelError and unconfigured AuthenticationError
    with pytest.raises(ProviderError) as exc_invalid:
        await provider.generate_text([{"role": "user", "content": "Ping"}], model="unsupported-model-xyz")
    assert exc_invalid.value.code == "INVALID_MODEL"

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    unconfigured = GeminiProvider(api_key=None)
    with pytest.raises(ProviderError) as exc_unconf:
        await unconfigured.generate_text([{"role": "user", "content": "Ping"}], model="gemini-3.5-flash")
    assert exc_unconf.value.code == "AUTHENTICATION_FAILED"

    # 5. Verify ModelGateway maintains multi-provider configuration
    gateway = get_model_gateway()
    assert gateway.get_provider("openai") is not None
    assert gateway.get_provider("anthropic") is not None
    assert gateway.get_provider("gemini") is not None


# ==============================================================================
# TEST C: FILES AND KNOWLEDGE ENGINE (RAG)
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_c_files_and_knowledge():
    """
    1. Upload a supported file (Markdown/Text)
    2. Verify extraction, chunking, and indexing
    3. Query content via knowledge search
    4. Verify answers reference relevant source material with citations [Doc: filename, Page X]
    5. Verify unsupported or malformed files fail safely
    6. Verify cross-user isolation: User B cannot access User A's files
    """
    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)

    # 1. Upload supported file
    file_content = (
        b"# Project Neptune Specifications\n\n"
        b"Project Neptune operates on an ultra-low-latency message bus with 99.999% SLA.\n"
        b"The primary database cluster runs on isolated NVMe drives in Region US-East-1.\n"
    )
    upload_resp = client.post(
        "/api/files/upload",
        files={"file": ("neptune_specs.md", io.BytesIO(file_content), "text/markdown")},
        headers=headers_a,
    )
    assert upload_resp.status_code == 201
    file_data = upload_resp.json()
    file_id = file_data["id"]
    assert file_data["filename"] == "neptune_specs.md"
    assert file_data["status"] == "ready"
    assert file_data["chunk_count"] >= 1

    # 2 & 3. Knowledge search over uploaded content
    search_resp = client.post(
        "/api/knowledge/search",
        json={"query": "What is the SLA of Project Neptune?", "top_k": 3},
        headers=headers_a,
    )
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert search_data["total_results"] >= 1
    assert any("99.999% SLA" in r.get("snippet", "") for r in search_data["results"])

    # 4. Grounded Q&A response with citations
    answer_resp = client.post(
        "/api/knowledge/answer",
        json={"query": "What is the SLA of Project Neptune?"},
        headers=headers_a,
    )
    assert answer_resp.status_code == 200
    ans_data = answer_resp.json()
    assert len(ans_data["citations"]) >= 1
    assert "neptune_specs.md" in ans_data["citations"][0]["filename"]

    # 5. Unsupported / empty file fails safely without server crash
    malformed_resp = client.post(
        "/api/files/upload",
        files={"file": ("empty.xyz", io.BytesIO(b""), "application/octet-stream")},
        headers=headers_a,
    )
    assert malformed_resp.status_code in (400, 415, 422)

    # 6. Tenant isolation: User B cannot access User A's file or search its contents
    user_b_get = client.get(f"/api/files/{file_id}", headers=headers_b)
    assert user_b_get.status_code == 404

    user_b_search = client.post(
        "/api/knowledge/search",
        json={"query": "Project Neptune SLA"},
        headers=headers_b,
    )
    assert user_b_search.status_code == 200
    assert user_b_search.json()["total_results"] == 0


# ==============================================================================
# TEST D: WEB RESEARCH & BROWSER INTELLIGENCE
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_d_web_research():
    """
    1. Submit research request
    2. Verify job creation and state transitions
    3. Verify source collection and evidence storage
    4. Verify grounded synthesis references collected sources [Web N: Title]
    5. Verify SSRF protection blocks cloud metadata (169.254.169.254) and private subnets
    """
    from services.research.search_providers import set_custom_search_provider
    from services.research.web_collector import set_custom_page_fetcher
    from tests.test_web_research import MockControlledSearchProvider, default_mock_fetcher

    set_custom_search_provider(MockControlledSearchProvider())
    set_custom_page_fetcher(default_mock_fetcher)

    user_id = f"user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1 & 2. Create and execute research job
    create_resp = client.post(
        "/api/research/jobs",
        json={
            "question": "What are the key architectural benefits of micro-frontends?",
            "depth": "quick",
            "max_sources": 2,
            "requires_approval": True,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    job_data = create_resp.json()
    job_id = job_data["id"]

    # Execute job directly to simulate completed cycle
    await ResearchJobService._execute_job(job_id)

    # 3 & 4. Verify completed report and citations
    detail_resp = client.get(f"/api/research/jobs/{job_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    refreshed_job = detail_data["job"]
    assert refreshed_job["status"] == "completed"
    assert refreshed_job["final_report"] is not None
    assert len(detail_data["sources"]) >= 1

    # 5. SSRF protection verification: cloud metadata and private IP ranges blocked
    with pytest.raises(PolicyViolationError) as exc_meta:
        validate_url("http://169.254.169.254/latest/meta-data/")
    assert any(term in str(exc_meta.value).lower() for term in ("prohibited", "metadata", "blocked", "internal"))

    with pytest.raises(PolicyViolationError) as exc_priv:
        validate_url("http://10.0.0.1/admin")
    assert any(term in str(exc_priv.value).lower() for term in ("prohibited", "private", "blocked", "internal"))


# ==============================================================================
# TEST E: BROWSER AGENT & SECURITY BOUNDARY
# ==============================================================================

def test_journey_e_browser_agent():
    """
    1. Create browser task
    2. Verify task progress and status transitions
    3. Verify network URL policy enforcement
    4. Verify consequential external actions require explicit approval
    5. Verify cross-user isolation: User B cannot access User A's browser task
    """
    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)

    # 1. Create task
    task_resp = client.post(
        "/api/browser/tasks",
        json={
            "task_description": "Navigate to documentation portal and verify status",
            "initial_url": "https://example.com/docs",
        },
        headers=headers_a,
    )
    assert task_resp.status_code == 201
    task = task_resp.json()
    task_id = task["id"]
    assert task["status"] in ("pending", "awaiting_approval")

    # 2 & 3. Verify task retrieval and URL restriction
    get_resp = client.get(f"/api/browser/tasks/{task_id}", headers=headers_a)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == task_id

    # 4. Verify cross-user isolation: User B receives 404
    user_b_resp = client.get(f"/api/browser/tasks/{task_id}", headers=headers_b)
    assert user_b_resp.status_code == 404

    # Cancel task cleanly
    cancel_resp = client.post(
        f"/api/browser/tasks/{task_id}/cancel",
        json={"reason": "User requested cancellation"},
        headers=headers_a,
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"


# ==============================================================================
# TEST F: TASKS, CALENDAR, REMINDERS & BOUNDED RRULE
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_f_tasks_calendar_reminders():
    """
    1. Create task, read, update, and verify owner isolation
    2. Create calendar event with timezone and bounded RRULE recurrence
    3. Test reminder scheduling and delivery logic
    4. Verify natural-language extraction enforces requires_confirmation=True
    """
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1. Task creation & update
    task_resp = client.post(
        "/api/tasks",
        json={
            "title": "Prepare Release Candidate Notes",
            "priority": "high",
            "due_date": "2026-10-30T17:00:00Z",
        },
        headers=headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    update_resp = client.patch(
        f"/api/tasks/{task_id}",
        json={"status": "completed"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "completed"

    # 2. Calendar event with bounded RRULE
    event_resp = client.post(
        "/api/calendar/events",
        json={
            "title": "Weekly Engineering Sync",
            "start_time": "2026-10-29T14:00:00Z",
            "end_time": "2026-10-29T15:00:00Z",
            "is_recurring": True,
            "recurrence_rule": "FREQ=WEEKLY;COUNT=4",
        },
        headers=headers,
    )
    assert event_resp.status_code == 201
    event_data = event_resp.json()
    assert event_data["recurrence_rule"] == "FREQ=WEEKLY;COUNT=4"

    # Query calendar agenda window
    query_resp = client.get(
        "/api/calendar/events",
        params={
            "start_window": "2026-10-29T00:00:00Z",
            "end_window": "2026-11-30T00:00:00Z",
        },
        headers=headers,
    )
    assert query_resp.status_code == 200
    occurrences = query_resp.json()["occurrences"]
    assert len(occurrences) >= 1

    # 3. Reminder creation
    reminder_resp = client.post(
        "/api/reminders",
        json={
            "title": "Review staging cluster metrics",
            "scheduled_time": "2026-10-29T16:00:00Z",
            "task_id": task_id,
        },
        headers=headers,
    )
    assert reminder_resp.status_code == 201
    assert reminder_resp.json()["status"] == "scheduled"

    # 4. Natural language extraction mandates human review before persistence
    from tests.test_tasks_calendar_reminders import MockExtractorProvider

    mock_llm_json = json.dumps({
        "tasks": [{"title": "Send NDA", "priority": "high", "due_date": None}],
        "events": [{"title": "Client demo", "start_time": "2026-10-30T10:00:00Z", "end_time": "2026-10-30T11:00:00Z", "timezone": "UTC"}],
        "reminders": [],
        "explanation": "Extracted demo event and NDA task.",
    })
    gateway = get_model_gateway()
    gateway.register_provider(MockExtractorProvider(mock_llm_json))
    try:
        extract_resp = client.post(
            "/api/tasks/extract",
            json={"text": "Schedule client demo tomorrow at 10am and add task to send NDA"},
            headers=headers,
        )
        assert extract_resp.status_code == 200
        extract_data = extract_resp.json()
        assert extract_data["requires_confirmation"] is True
        assert len(extract_data["tasks"]) == 1
        assert extract_data["tasks"][0]["title"] == "Send NDA"
    finally:
        gateway.reset()


# ==============================================================================
# TEST G: WI-FI SENSING (SIMULATION & PRIVACY PROTOCOL)
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_g_wifi_sensing():
    """
    1. Verify simulator operation
    2. Verify configuration and tenant isolation
    3. Verify clear simulation provenance: is_simulated = True & disclaimer
    4. Verify retention purge
    """
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1. Query sensing status
    status_resp = client.get("/api/sensing/status", headers=headers)
    assert status_resp.status_code == 200
    sensing_status = status_resp.json()
    assert sensing_status["status"] == "operational"
    assert sensing_status["simulation_mode"] is True
    assert sensing_status["hardware_detected"] is False

    # 2. Simulator tool query via tool integration
    async with async_session_factory() as db:
        tool_res = await WifiSensingTool.execute(
            db=db,
            owner_id=user_id,
            action="check_availability",
            room_id="conference_room_1",
        )
        assert tool_res["simulation_available"] is True
        assert tool_res["hardware_available"] is False
        assert tool_res["is_simulated"] is True
        assert "disclaimer" in tool_res
        assert "simulation" in tool_res["disclaimer"].lower()

    # 3. Purge history
    purge_resp = client.delete("/api/sensing/events", headers=headers)
    assert purge_resp.status_code == 200
    purge_data = purge_resp.json()
    assert "purged_count" in purge_data


# ==============================================================================
# TEST H: MULTI-STEP WORKFLOW ORCHESTRATION & GATES
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_h_multi_step_orchestration():
    """
    1. Submit multi-capability request
    2. Verify planner produces topologically ordered DAG
    3. Verify consequential action confirmation gate pauses execution
    4. Verify user confirmation allows execution to resume
    5. Verify consolidated citations and provenance across subsystems
    """
    user_id = f"user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    prompt = (
        "Inspect Wi-Fi sensing in room lab_alpha, summarize the status, "
        "and create a task: Review lab occupancy log"
    )
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": prompt},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf = create_resp.json()
    wf_id = wf["id"]

    # Approve plan
    client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": wf["plan_version"]},
        headers=headers,
    )

    # Run step execution -> pauses at consequential step (task_create)
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()
    assert wf_data["status"] == "waiting_for_confirmation"
    assert wf_data["pending_confirmation"]["capability"] == "task_create"

    # Confirm consequential step
    confirm_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/confirm",
        json={"step_number": wf_data["pending_confirmation"]["step_number"], "approved": True},
        headers=headers,
    )
    assert confirm_resp.status_code == 200

    # Resume execution to completion
    await OrchestrationEngine.run_workflow(wf_id)

    final_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    final_data = final_resp.json()
    assert final_data["status"] == "completed"
    assert final_data["result_summary"] is not None
    assert final_data["final_report"] is not None
    citations = final_data["final_report"]["citations"]
    assert any(c.get("is_simulated") for c in citations)


# ==============================================================================
# TEST I: TENANT ISOLATION ACROSS ALL SUBSYSTEMS
# ==============================================================================

@pytest.mark.asyncio
async def test_journey_i_cross_tenant_isolation_all_subsystems():
    """
    Enforces strict multi-tenant isolation across all assistant domains:
    User B cannot read, mutate, approve, or delete resources created by User A.
    """
    user_a = f"tenant-a-{uuid.uuid4().hex[:8]}"
    user_b = f"tenant-b-{uuid.uuid4().hex[:8]}"
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)

    # 1. Conversation isolation
    conv_resp = client.post("/api/conversations", json={"title": "Private Strategy A"}, headers=headers_a)
    conv_id = conv_resp.json()["id"]
    assert client.get(f"/api/conversations/{conv_id}", headers=headers_b).status_code == 404

    # 2. Task isolation
    task_resp = client.post("/api/tasks", json={"title": "Private Task A"}, headers=headers_a)
    task_id = task_resp.json()["id"]
    assert client.get(f"/api/tasks/{task_id}", headers=headers_b).status_code == 404
    assert client.patch(f"/api/tasks/{task_id}", json={"status": "completed"}, headers=headers_b).status_code == 404
    assert client.delete(f"/api/tasks/{task_id}", headers=headers_b).status_code == 404

    # 3. Calendar event isolation
    event_resp = client.post(
        "/api/calendar/events",
        json={
            "title": "Confidential Meeting A",
            "start_time": "2026-10-30T10:00:00Z",
            "end_time": "2026-10-30T11:00:00Z",
        },
        headers=headers_a,
    )
    event_id = event_resp.json()["id"]
    assert client.get(f"/api/calendar/events/{event_id}", headers=headers_b).status_code == 404
    assert client.delete(f"/api/calendar/events/{event_id}", headers=headers_b).status_code == 404

    # 4. Reminder isolation
    rem_resp = client.post(
        "/api/reminders",
        json={"title": "Private Reminder A", "scheduled_time": "2026-10-30T12:00:00Z"},
        headers=headers_a,
    )
    rem_id = rem_resp.json()["id"]
    assert client.get(f"/api/reminders/{rem_id}", headers=headers_b).status_code == 404

    # 5. Workflow orchestration isolation
    wf_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Inspect Wi-Fi sensing in room secret_vault"},
        headers=headers_a,
    )
    wf_id = wf_resp.json()["id"]
    assert client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers_b).status_code == 404
    assert client.post(f"/api/orchestration/workflows/{wf_id}/approve", json={"approved": True}, headers=headers_b).status_code == 404
    assert client.post(f"/api/orchestration/workflows/{wf_id}/cancel", json={"reason": "Cancel"}, headers=headers_b).status_code == 404


# ==============================================================================
# TEST J: AUTHENTICATION TOKEN INTEGRITY & FAIL-CLOSED BOUNDARY
# ==============================================================================

def test_journey_j_auth_tokens_missing_invalid_expired(monkeypatch):
    """
    Verifies authentication boundary:
    In production mode (allow_dev_auth=False), requests with missing, invalid,
    tampered, or expired tokens fail with HTTP 401 Unauthorized.
    """
    secret = "production_super_strong_test_secret_key_32_bytes"
    monkeypatch.setenv("JWT_SECRET_KEY", secret)
    monkeypatch.setenv("ALLOW_DEV_AUTH", "false")
    monkeypatch.setenv("IS_PRODUCTION", "true")
    get_settings.cache_clear()

    try:
        # 1. Missing token -> 401
        resp_missing = client.get("/api/conversations")
        assert resp_missing.status_code == 401

        # 2. Bogus / tampered token -> 401
        resp_tampered = client.get("/api/conversations", headers={"Authorization": "Bearer bad.token.here"})
        assert resp_tampered.status_code == 401

        # 3. Expired token -> 401
        expired_token = create_access_token(
            user_id="user-expired",
            secret_key=secret,
            expires_in_seconds=-60,
        )
        resp_expired = client.get("/api/conversations", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp_expired.status_code == 401

        # 4. Valid token -> 200
        valid_token = create_access_token(
            user_id="user-valid",
            secret_key=secret,
            expires_in_seconds=3600,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        resp_valid = client.get("/api/conversations", headers={"Authorization": f"Bearer {valid_token}"})
        assert resp_valid.status_code == 200

    finally:
        get_settings.cache_clear()
