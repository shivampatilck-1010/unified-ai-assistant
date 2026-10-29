import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient

from auth import create_access_token
from config import get_settings
from database import async_session_factory
from main import app
from models.task import Task
from models.workflow import Workflow, WorkflowEvent, WorkflowStep
from schemas.orchestration import (
    CapabilityType,
    WorkflowPlan,
    WorkflowStatus,
    WorkflowStepCreate,
    WorkflowStepStatus,
)
from services.orchestration.dispatcher import CapabilityDispatcher
from services.orchestration.engine import OrchestrationEngine
from services.orchestration.planner import OrchestrationPlanner

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
# 1. Planner Unit Tests: Ambiguity, Allowlisting & Consequential Gates
# ==============================================================================


@pytest.mark.asyncio
async def test_planner_detects_ambiguity():
    """Verifies vague requests trigger clarification rather than hallucinating parameters."""
    ambiguous_prompts = [
        "create a task",
        "schedule a meeting",
        "research this",
        "search my files",
    ]

    for p in ambiguous_prompts:
        plan, clarification, title = await OrchestrationPlanner.generate_plan(p)
        assert plan is None, f"Expected ambiguous prompt '{p}' to return no plan"
        assert clarification is not None, f"Expected clarification question for '{p}'"
        assert len(clarification) > 10


@pytest.mark.asyncio
async def test_planner_rejects_invented_capabilities():
    """Verifies that unknown or hallucinated tool capabilities fail validation."""
    invalid_step = WorkflowStepCreate.model_construct(
        step_number=1,
        title="Hallucinated Action",
        capability="unsupported_cloud_tool",
        parameters={},
        depends_on=[],
        is_consequential=False,
    )

    invalid_plan = WorkflowPlan(
        summary="Test invalid plan",
        steps=[invalid_step],
        consequential_actions_count=0,
    )

    with pytest.raises(ValueError, match="Unsupported or invented capability"):
        OrchestrationPlanner._validate_and_sanitize_plan(invalid_plan)


@pytest.mark.asyncio
async def test_planner_flags_consequential_actions():
    """Verifies that state-mutating actions (tasks, calendar, browser) are tagged consequential."""
    prompt = "Create a task to review quarterly report"
    plan, clarification, title = await OrchestrationPlanner.generate_plan(prompt)

    assert plan is not None
    assert clarification is None
    assert len(plan.steps) >= 1

    consequential_steps = [s for s in plan.steps if s.is_consequential]
    assert len(consequential_steps) >= 1
    assert consequential_steps[0].capability == CapabilityType.TASK_CREATE
    assert consequential_steps[0].requires_confirmation is True


# ==============================================================================
# 2. Variable Interpolation & Capability Dispatcher Tests
# ==============================================================================


def test_dispatcher_variable_interpolation():
    """Verifies that output variables from preceding steps are cleanly interpolated."""
    context = {
        1: {
            "output": {"topic": "quantum cryptography", "score": 9.5},
            "summary": "Found quantum cryptography details",
        },
        2: {
            "title": "Meeting with Alice",
        },
    }

    params = {
        "query": "Analysis on {step_1.output.topic} with rating {step_1.output.score}",
        "meeting": "Invite to {step_2.title}",
        "unmatched": "Leave {unknown_variable} intact",
    }

    interpolated = CapabilityDispatcher.interpolate_parameters(params, context)

    assert interpolated["query"] == "Analysis on quantum cryptography with rating 9.5"
    assert interpolated["meeting"] == "Invite to Meeting with Alice"
    assert interpolated["unmatched"] == "Leave {unknown_variable} intact"


@pytest.mark.asyncio
async def test_dispatcher_wifi_sensing_simulation():
    """Verifies that Wi-Fi sensing dispatch operates safely in simulation mode with clear provenance."""
    user_id = f"test-orch-{uuid.uuid4().hex[:8]}"
    async with async_session_factory() as db:
        result = await CapabilityDispatcher.dispatch(
            db=db,
            owner_id=user_id,
            capability=CapabilityType.WIFI_SENSING_QUERY.value,
            parameters={"action": "check_availability"},
            step_number=1,
            context={},
        )

        assert result["success"] is True
        assert result["is_simulated"] is True
        assert len(result["citations"]) >= 1
        assert "[Synthetic Observation" in result["citations"][0]["citation_key"]
        assert "NOTICE: Physical Wi-Fi sensing hardware is not detected" in result["citations"][0]["disclaimer"]


# ==============================================================================
# 3. State Machine & Lifecycle End-to-End Tests via API
# ==============================================================================


def test_clarification_workflow_lifecycle():
    """Tests workflow pausing at waiting_for_input and continuing after user clarification."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1. Submit ambiguous prompt
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "create a task"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf = create_resp.json()
    assert wf["status"] == "waiting_for_input"
    assert wf["clarification_question"] is not None
    wf_id = wf["id"]

    # 2. Attempting to approve while waiting for input should fail (400)
    approve_fail = client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": 1},
        headers=headers,
    )
    assert approve_fail.status_code == 400

    # 3. Submit user clarification
    clarify_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/clarify",
        json={"clarification_response": "Prepare the monthly team financial report"},
        headers=headers,
    )
    assert clarify_resp.status_code == 200
    updated_wf = clarify_resp.json()
    assert updated_wf["plan_version"] == 2
    # Because creating a task is consequential, status transitions to awaiting_approval
    assert updated_wf["status"] == "awaiting_approval"
    assert len(updated_wf["steps"]) >= 1
    assert any(s["capability"] == "task_create" for s in updated_wf["steps"])


@pytest.mark.asyncio
async def test_consequential_confirmation_gate_workflow():
    """
    Tests that a workflow with a consequential step pauses before execution,
    requires explicit confirmation, and executes only upon approval.
    """
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1. Create a task creation workflow
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Create a task: Finalize Q3 system audit"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf = create_resp.json()
    wf_id = wf["id"]
    assert wf["status"] == "awaiting_approval"

    # 2. Approve proposed plan
    approve_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": wf["plan_version"]},
        headers=headers,
    )
    assert approve_resp.status_code == 200

    # 3. Run execution loop in test environment until confirmation gate
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    assert get_resp.status_code == 200
    wf_data = get_resp.json()

    assert wf_data["status"] == "waiting_for_confirmation"
    assert wf_data["pending_confirmation"] is not None
    step_num = wf_data["pending_confirmation"]["step_number"]

    # Verify task was NOT created yet in database
    async with async_session_factory() as db:
        from sqlalchemy import select
        tasks = (await db.execute(select(Task).where(Task.owner_id == user_id))).scalars().all()
        assert len(tasks) == 0

    # 4. Confirm the consequential step
    confirm_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/confirm",
        json={"step_number": step_num, "approved": True},
        headers=headers,
    )
    assert confirm_resp.status_code == 200

    # 5. Run execution loop to execute confirmed step
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()
    assert wf_data["status"] == "completed"

    # Verify task was created in database
    async with async_session_factory() as db:
        from sqlalchemy import select
        tasks_after = (await db.execute(select(Task).where(Task.owner_id == user_id))).scalars().all()
        assert len(tasks_after) == 1
        assert "Finalize Q3 system audit" in tasks_after[0].title


@pytest.mark.asyncio
async def test_consequential_confirmation_rejection():
    """Verifies that rejecting a consequential action cancels the step and prevents DB mutation."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Create a task: Delete obsolete customer database records"},
        headers=headers,
    )
    wf_id = create_resp.json()["id"]

    # Approve plan
    client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": 1},
        headers=headers,
    )

    # Step execution to consequential pause
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()
    assert wf_data["status"] == "waiting_for_confirmation"
    step_num = wf_data["pending_confirmation"]["step_number"]

    # Reject confirmation
    reject_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/confirm",
        json={"step_number": step_num, "approved": False, "reason": "Unsafe action"},
        headers=headers,
    )
    assert reject_resp.status_code == 200

    # Step execution to finish remaining
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()
    assert wf_data["status"] in ("completed", "partially_completed")

    # Target step must be cancelled
    step_record = next(s for s in wf_data["steps"] if s["step_number"] == step_num)
    assert step_record["status"] == "cancelled"

    # DB task must not exist
    async with async_session_factory() as db:
        from sqlalchemy import select
        tasks = (await db.execute(select(Task).where(Task.owner_id == user_id))).scalars().all()
        assert len(tasks) == 0


def test_stale_plan_version_rejection():
    """Verifies that submitting plan approval with an obsolete version is rejected with 409 Conflict."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # Create workflow
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Create a task: Update SSL certs"},
        headers=headers,
    )
    wf_id = create_resp.json()["id"]

    # Submit approval with incorrect version
    stale_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": 999},
        headers=headers,
    )
    assert stale_resp.status_code == 409
    assert "Plan version mismatch" in stale_resp.json()["detail"]


def test_tenant_isolation_boundary():
    """Verifies that workflows are strictly isolated between authenticated users."""
    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"

    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)

    # User A creates a workflow
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Inspect room occupancy in office_a"},
        headers=headers_a,
    )
    assert create_resp.status_code == 201
    wf_id = create_resp.json()["id"]

    # User B attempts to access User A's workflow -> 404
    get_resp_b = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers_b)
    assert get_resp_b.status_code == 404

    # User B attempts to approve User A's workflow -> 404
    approve_resp_b = client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": 1},
        headers=headers_b,
    )
    assert approve_resp_b.status_code == 404

    # User B attempts to cancel User A's workflow -> 404
    cancel_resp_b = client.post(
        f"/api/orchestration/workflows/{wf_id}/cancel",
        json={"reason": "Unauthorized cancellation"},
        headers=headers_b,
    )
    assert cancel_resp_b.status_code == 404


@pytest.mark.asyncio
async def test_safe_workflow_auto_execution():
    """Verifies that workflows consisting solely of safe read operations run automatically."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # Safe request: inspect room sensing
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Inspect Wi-Fi sensing status and room occupancy"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf = create_resp.json()
    wf_id = wf["id"]

    # Because all steps are safe read steps, status starts at RUNNING
    assert wf["status"] == "running"

    # Step execution to completion
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()

    assert wf_data["status"] == "completed"
    assert wf_data["result_summary"] is not None
    assert len(wf_data["steps"]) >= 1
    # Check that events were logged
    events_resp = client.get(f"/api/orchestration/workflows/{wf_id}/events", headers=headers)
    assert events_resp.status_code == 200
    events = events_resp.json()
    event_types = {e["event_type"] for e in events}
    assert "workflow_created" in event_types
    assert "plan_auto_approved" in event_types
    assert "step_completed" in event_types
    assert "workflow_completed" in event_types
    assert "plan_auto_approved" in event_types
    assert "step_completed" in event_types
    assert "workflow_completed" in event_types


def test_workflow_cancellation():
    """Verifies that an in-progress or awaiting workflow can be cancelled cleanly."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Create a task: Clean server cache tomorrow"},
        headers=headers,
    )
    wf_id = create_resp.json()["id"]

    cancel_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/cancel",
        json={"reason": "No longer necessary"},
        headers=headers,
    )
    assert cancel_resp.status_code == 200
    wf_data = cancel_resp.json()
    assert wf_data["status"] == "cancelled"
    assert "No longer necessary" in (wf_data["error_message"] or "")


@pytest.mark.asyncio
async def test_multi_capability_dag_orchestration():
    """
    Tests end-to-end multi-capability DAG execution combining Wi-Fi sensing,
    synthesis, and human-confirmed follow-up task creation with provenance citations.
    """
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    # 1. Prompt triggering multiple capabilities
    prompt = "Inspect Wi-Fi sensing occupancy in room office_a, summarize the status, and create a task: Follow up on office occupancy"
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": prompt},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf = create_resp.json()
    wf_id = wf["id"]

    assert len(wf["steps"]) >= 2
    capabilities = {s["capability"] for s in wf["steps"]}
    assert CapabilityType.WIFI_SENSING_QUERY.value in capabilities
    assert CapabilityType.TASK_CREATE.value in capabilities

    # 2. Approve plan
    client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": wf["plan_version"]},
        headers=headers,
    )

    # 3. Run execution loop - should execute sensing and synthesis, then pause before task_create
    await OrchestrationEngine.run_workflow(wf_id)

    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    wf_data = get_resp.json()
    assert wf_data["status"] == "waiting_for_confirmation"
    assert wf_data["pending_confirmation"]["capability"] == "task_create"

    # Verify sensing step completed
    sensing_step = next(s for s in wf_data["steps"] if s["capability"] == "wifi_sensing_query")
    assert sensing_step["status"] == "completed"
    assert sensing_step["is_simulated"] is True
    assert len(sensing_step["citations"]) >= 1

    # 4. Confirm the task step
    client.post(
        f"/api/orchestration/workflows/{wf_id}/confirm",
        json={"step_number": wf_data["pending_confirmation"]["step_number"], "approved": True},
        headers=headers,
    )

    # 5. Finish execution
    await OrchestrationEngine.run_workflow(wf_id)

    final_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers)
    final_data = final_resp.json()
    assert final_data["status"] == "completed"
    assert final_data["result_summary"] is not None

    # Check report citations and provenance
    report = final_data["final_report"]
    assert report is not None
    assert any(c.get("is_simulated") for c in report["citations"])


def test_chat_streaming_orchestration_integration():
    """Verifies that the /api/chat/stream endpoint triggers orchestration when use_orchestration is True."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    stream_resp = client.post(
        "/api/chat/stream",
        json={
            "message": "Inspect Wi-Fi sensing status and room occupancy",
            "use_orchestration": True,
        },
        headers=headers,
    )
    assert stream_resp.status_code == 200
    assert "text/event-stream" in stream_resp.headers["content-type"]

    events = []
    for line in stream_resp.iter_lines():
        if line.startswith("data: "):
            try:
                import json
                events.append(json.loads(line[6:]))
            except Exception:
                pass

    # Verify message_start and message_complete were streamed
    event_names = [e.get("event") for e in events]
    assert "message_start" in event_names
    assert "message_complete" in event_names


def test_get_capabilities_registry_endpoint():
    """Verifies GET /api/orchestration/capabilities returns all 9 registered capabilities."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    resp = client.get("/api/orchestration/capabilities", headers=headers)
    assert resp.status_code == 200
    caps = resp.json()
    assert len(caps) == 9

    cap_map = {c["identifier"]: c for c in caps}
    expected_caps = [
        "knowledge_search",
        "web_research",
        "browser_action",
        "task_create",
        "task_update",
        "calendar_event_create",
        "reminder_create",
        "wifi_sensing_query",
        "general_synthesis",
    ]
    for exp in expected_caps:
        assert exp in cap_map
        c = cap_map[exp]
        assert "name" in c and len(c["name"]) > 0
        assert "description" in c and len(c["description"]) > 0
        assert "input_schema" in c and isinstance(c["input_schema"], dict)
        assert "output_schema" in c and isinstance(c["output_schema"], dict)
        assert "risk_level" in c

    # Consequential checks
    assert cap_map["task_create"]["risk_level"] == "consequential"
    assert cap_map["task_create"]["requires_confirmation"] is True
    assert cap_map["browser_action"]["risk_level"] == "consequential"
    assert cap_map["browser_action"]["requires_confirmation"] is True

    # Safe read checks
    assert cap_map["knowledge_search"]["risk_level"] == "low"
    assert cap_map["knowledge_search"]["requires_confirmation"] is False
    assert cap_map["web_research"]["risk_level"] == "low"
    assert cap_map["web_research"]["requires_confirmation"] is False
    assert cap_map["wifi_sensing_query"]["risk_level"] == "low"
    assert cap_map["wifi_sensing_query"]["requires_confirmation"] is False


@pytest.mark.asyncio
async def test_intent_classifier_direct():
    """Unit tests IntentClassifier for multi-category and ambiguous classification."""
    from services.orchestration.classifier import IntentClassifier, UserIntentType

    # 1. Ambiguous task
    res_ambig = await IntentClassifier.classify("create a task")
    assert res_ambig.is_ambiguous is True
    assert res_ambig.clarification_prompt is not None

    # 2. Document analysis
    res_doc = await IntentClassifier.classify("search my uploaded documents for revenue")
    assert res_doc.primary_intent in (UserIntentType.DOCUMENT_ANALYZE, UserIntentType.MULTI_STEP_WORKFLOW)

    # 3. Web research
    res_res = await IntentClassifier.classify("perform web research on electric cars")
    assert res_res.primary_intent in (UserIntentType.RESEARCH_TOPIC, UserIntentType.MULTI_STEP_WORKFLOW)

    # 4. Wi-Fi sensing
    res_sens = await IntentClassifier.classify("check wifi sensing in room conference_b")
    assert res_sens.primary_intent in (UserIntentType.SENSING_OPERATION, UserIntentType.MULTI_STEP_WORKFLOW)
    assert res_sens.entities.get("room_id") == "conference_b"

    # 5. Multi-step request
    res_multi = await IntentClassifier.classify("Research market trends and create a task: Review trends tomorrow")
    assert res_multi.primary_intent == UserIntentType.MULTI_STEP_WORKFLOW
    assert res_multi.requires_multi_step is True


def test_cross_user_workflow_isolation():
    """Verifies that user B cannot view, approve, confirm or cancel user A's workflow."""
    user_a = f"user-a-{uuid.uuid4().hex[:8]}"
    user_b = f"user-b-{uuid.uuid4().hex[:8]}"
    headers_a = get_auth_headers(user_a)
    headers_b = get_auth_headers(user_b)

    # User A creates a workflow
    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Create a task: User A confidential task"},
        headers=headers_a,
    )
    assert create_resp.status_code == 201
    wf_id = create_resp.json()["id"]

    # User B attempts to access it
    get_resp = client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers_b)
    assert get_resp.status_code == 404

    # User B attempts to approve it
    approve_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/approve",
        json={"approved": True, "plan_version": 1},
        headers=headers_b,
    )
    assert approve_resp.status_code == 404

    # User B attempts to confirm a step
    confirm_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/confirm",
        json={"step_number": 1, "approved": True},
        headers=headers_b,
    )
    assert confirm_resp.status_code == 404

    # User B attempts to cancel it
    cancel_resp = client.post(
        f"/api/orchestration/workflows/{wf_id}/cancel",
        json={"reason": "Attacker cancelling"},
        headers=headers_b,
    )
    assert cancel_resp.status_code == 404


@pytest.mark.asyncio
async def test_recover_dangling_workflows_state():
    """Verifies that recover_dangling_workflows updates interrupted workflows to failed."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    dangling_wf_id = str(uuid.uuid4())

    async with async_session_factory() as db:
        wf = Workflow(
            id=dangling_wf_id,
            owner_id=user_id,
            title="Dangling Workflow Before Restart",
            request_prompt="Prompt before restart",
            status="running",
            plan_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(wf)
        await db.commit()

    # Run recovery
    await OrchestrationEngine.recover_dangling_workflows()

    async with async_session_factory() as db:
        recovered = await db.get(Workflow, dangling_wf_id)
        assert recovered is not None
        assert recovered.status == "failed"
        assert "Server restarted during execution." in (recovered.error_message or "")


@pytest.mark.asyncio
async def test_workflow_stream_subscription():
    """Verifies subscribe_events yields initial connected and replay events."""
    user_id = f"test-user-{uuid.uuid4().hex[:8]}"
    headers = get_auth_headers(user_id)

    create_resp = client.post(
        "/api/orchestration/workflows",
        json={"prompt": "Inspect Wi-Fi sensing in room lobby"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    wf_id = create_resp.json()["id"]

    chunks = []
    async for chunk in OrchestrationEngine.subscribe_events(wf_id):
        chunks.append(chunk)
        if len(chunks) >= 2:
            break

    assert any("connected" in c for c in chunks)
    assert any("workflow_created" in c or "plan_generated" in c for c in chunks)

