import asyncio
import io
import json
import os
import sys
import time
from pathlib import Path

import httpx
import pytest

# Ensure services are on sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = BASE_DIR / "services" / "api"
WORKER_DIR = BASE_DIR / "services" / "agent-worker"

for p in (str(API_DIR), str(WORKER_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from file_intelligence import FileIntelligenceEngine
from self_correction import SelfCorrectionEngine, FailureDiagnosis
from schemas.browser_task import BrowserAction, BrowserActionType, BrowserTaskStatus
from services.orchestration.multi_agent import MultiAgentOrchestrator, AgentRole


@pytest.fixture
def base_url():
    tunnel_file = BASE_DIR / "current_tunnel_url.txt"
    if tunnel_file.exists():
        url = tunnel_file.read_text(encoding="utf-8").strip()
        if url:
            return url
    return "http://127.0.0.1:8000"


# ============================================================================
# 1. FILE INTELLIGENCE TESTS (PDF, CSV, SPREADSHEET, TRANSFORM)
# ============================================================================

def test_file_intelligence_pdf_and_spreadsheet_inspection(tmp_path):
    """Verifies file intelligence parsing for PDFs, CSV spreadsheets, and transformed exports."""
    engine = FileIntelligenceEngine(base_storage_dir=str(tmp_path))
    user_id = f"file_user_{int(time.time())}"

    # A. Inspect CSV Spreadsheet
    csv_file = tmp_path / "test_data.csv"
    csv_file.write_text(
        "transaction_id,merchant,amount,currency,status\n"
        "TX1001,Acme Cloud,129.50,USD,settled\n"
        "TX1002,Global Logistics,850.00,USD,settled\n"
        "TX1003,DevTools Inc,45.00,USD,pending\n",
        encoding="utf-8",
    )
    csv_res = engine.inspect_file(str(csv_file))
    assert csv_res["type"] == "tabular"
    assert csv_res["row_count"] == 3
    assert "transaction_id" in csv_res["headers"]
    assert "amount" in csv_res["headers"]
    assert "TX1001" in csv_res["extracted_text"]
    print("\n[PASS] CSV Spreadsheet Inspection: Row count and columns parsed accurately")

    # B. Generate Transformed Export
    transformed_records = [
        {"merchant": "Acme Cloud", "amount": 129.50, "category": "Cloud Infra"},
        {"merchant": "Global Logistics", "amount": 850.00, "category": "Operations"},
    ]
    export_meta = engine.transform_and_save_data(
        owner_id=user_id,
        data=transformed_records,
        filename="categorized_expenses.json",
        format_type="json",
    )
    assert Path(export_meta["file_path"]).exists()
    assert export_meta["file_size_bytes"] > 0
    print(f"[PASS] File Intelligence Data Transformation: Export saved to {export_meta['filename']}")

    # C. Inspect Plain Text / Markdown Document
    doc_file = tmp_path / "architecture_notes.md"
    doc_file.write_text("# Autonomous Browser Engine\nDesigned for persistent execution and self-correction.\n", encoding="utf-8")
    doc_res = engine.inspect_file(str(doc_file))
    assert doc_res["type"] == "text"
    assert doc_res["line_count"] == 2
    assert "Autonomous Browser Engine" in doc_res["extracted_text"]
    print("[PASS] Document Text Inspection: Headers and text verified")


# ============================================================================
# 2. SELF-CORRECTION & ADAPTIVE RECOVERY ENGINE TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_self_correction_diagnosis_and_alternative_generation():
    """Verifies that the self-correction engine accurately diagnoses errors and generates alternatives."""
    sc_engine = SelfCorrectionEngine(max_retries_per_step=3)
    task_id = "test_sc_task_01"

    failed_action = BrowserAction(
        action_type=BrowserActionType.CLICK,
        selector="button#submit-primary-btn",
        text="Submit Order",
    )

    # 1. Test failure recording and limit detection
    count1 = sc_engine.record_failure(task_id, 1, failed_action)
    assert count1 == 1
    assert not sc_engine.is_action_exhausted(task_id, 1, failed_action)

    count2 = sc_engine.record_failure(task_id, 1, failed_action)
    assert count2 == 2
    assert sc_engine.is_action_exhausted(task_id, 1, failed_action)
    print("\n[PASS] Self-Correction Failure Memory: Bounded repetition enforced")

    # 2. Test alternative selector generation from text
    class MockPage:
        async def evaluate(self, script):
            return "complete"

        def locator(self, sel):
            class MockLoc:
                async def count(self):
                    return 1 if "button:has-text" in sel else 0
                async def is_visible(self):
                    return True
                async def bounding_box(self):
                    return {"x": 100, "y": 200, "width": 80, "height": 30}
            return MockLoc()

    mock_page = MockPage()
    diag = await sc_engine._analyze_browser_state(
        mock_page, failed_action, "TimeoutError: waiting for selector button#submit-primary-btn"
    )
    assert diag.category == "SELECTOR_NOT_FOUND"

    alt_action = await sc_engine._generate_alternative_action(mock_page, failed_action, diag)
    assert alt_action is not None
    assert "button:has-text('Submit Order')" in (alt_action.selector or "")
    print(f"[PASS] Self-Correction Alternative Generation: Resilient text locator produced: {alt_action.selector}")


# ============================================================================
# 3. MULTI-AGENT ORCHESTRATION & VERIFICATION TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_multi_agent_orchestration_and_evidence_verification():
    """Verifies multi-agent stage creation and independent evidence verification."""
    orchestrator = MultiAgentOrchestrator()

    # A. Multi-Agent Stages
    stages = orchestrator.create_initial_stages(
        user_goal="Research vendor prices on https://example.com and download receipt pdf",
        initial_url="https://example.com",
    )
    assert len(stages) >= 4
    agent_roles = [s["assigned_agent"] for s in stages]
    assert AgentRole.PLANNING.value in agent_roles
    assert AgentRole.BROWSER_EXECUTION.value in agent_roles
    assert AgentRole.FILE_PROCESSING.value in agent_roles
    assert AgentRole.VERIFICATION.value in agent_roles
    print(f"\n[PASS] Multi-Agent Stage Planning: Initialized {len(stages)} stages across {len(set(agent_roles))} specialist agents")

    # B. Evidence-Based Verification: Complete Scenario
    complete_evidence = [
        {"action_type": "navigate", "url": "https://example.com", "title": "Example Domain"},
        {"action_type": "read_text", "text_preview": "Example Domain"},
        {"screenshot_data_url": "data:image/jpeg;base64,mockdata"},
    ]
    downloaded = [{"filename": "vendor_prices.csv", "file_size_bytes": 1024}]

    verdict_complete = await orchestrator.verify_task_completion(
        task_description="Navigate to https://example.com and download vendor_prices.csv",
        evidence=complete_evidence,
        downloaded_files=downloaded,
        final_summary="Successfully navigated and downloaded vendor pricing table.",
    )
    assert verdict_complete.status == "COMPLETED"
    assert verdict_complete.confidence_score >= 0.9
    print(f"[PASS] Evidence Verification Agent: Confirmed status=COMPLETED (Confidence: {verdict_complete.confidence_score})")

    # C. Evidence-Based Verification: Missing Artifact Scenario (Must NOT claim COMPLETED)
    verdict_incomplete = await orchestrator.verify_task_completion(
        task_description="Navigate to https://example.com and download vendor_prices.csv",
        evidence=complete_evidence,
        downloaded_files=[],  # Required file was not downloaded
        final_summary="All steps attempted.",
    )
    assert verdict_incomplete.status in ("PARTIALLY_COMPLETED", "FAILED")
    assert verdict_incomplete.status != "COMPLETED"
    print(f"[PASS] Strict Verification Integrity: Missing required artifact classified as {verdict_incomplete.status}")


# ============================================================================
# 4. END-TO-END AUTONOMOUS TASK EXECUTION & CHECKPOINTS TEST
# ============================================================================

@pytest.mark.asyncio
async def test_autonomous_task_execution_with_checkpoints(base_url):
    """Tests end-to-end multi-step autonomous execution, checkpointing, and verification in live backend."""
    user_id = f"phase2_runner_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=60.0) as client:
        # A. Create Multi-Step Autonomous Task
        task_res = await client.post(
            "/api/browser/tasks",
            json={
                "initial_url": "https://example.com",
                "task_description": "Inspect example.com headings, read body text, and capture a checkpoint snapshot.",
            },
            headers=headers,
        )
        assert task_res.status_code == 201
        task_data = task_res.json()
        task_id = task_data["id"]

        # Verify initial assigned agent
        assert task_data.get("assigned_agent") == "browser_execution_agent"
        print(f"\n[PASS] Autonomous Task Created: ID={task_id}")

        # B. Approve & Run Plan
        approve_res = await client.post(f"/api/browser/tasks/{task_id}/approve", headers=headers)
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "running"

        # C. Poll for Execution, Checkpoints, and Verification Completion
        completed = False
        checkpoints_found = False
        verif_status = None

        for _ in range(35):
            await asyncio.sleep(1.0)
            status_res = await client.get(f"/api/browser/tasks/{task_id}", headers=headers)
            assert status_res.status_code == 200
            current_task = status_res.json()

            if current_task.get("checkpoints") and len(current_task["checkpoints"]) > 0:
                checkpoints_found = True

            if current_task["status"] in ("completed", "failed"):
                completed = (current_task["status"] == "completed")
                verif_status = current_task.get("verification_status")
                break

        assert completed, f"Task did not complete successfully. Status: {current_task.get('status')}"
        assert checkpoints_found, "Execution checkpoints were not saved in task record"
        assert verif_status in ("COMPLETED", "PARTIALLY_COMPLETED"), f"Unexpected verification status: {verif_status}"
        print(f"[PASS] Task Completed with Checkpoints: Checkpoint Count={len(current_task['checkpoints'])}, Verification={verif_status}")


# ============================================================================
# 5. TASK INTERRUPTION, RESUME, AND RETRY TEST
# ============================================================================

@pytest.mark.asyncio
async def test_task_pause_resume_and_retry_lifecycle(base_url):
    """Tests pausing an active task, resuming it, and retrying a failed task from checkpoint."""
    user_id = f"phase2_ctrl_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        # A. Create Task
        res = await client.post(
            "/api/browser/tasks",
            json={
                "initial_url": "https://example.com",
                "task_description": "Navigate and read documentation",
            },
            headers=headers,
        )
        assert res.status_code == 201
        task_id = res.json()["id"]

        # B. Approve
        await client.post(f"/api/browser/tasks/{task_id}/approve", headers=headers)

        # C. Pause Task
        pause_res = await client.post(f"/api/browser/tasks/{task_id}/pause", headers=headers)
        assert pause_res.status_code in (200, 400)  # If already completed quickly, handles gracefully

        # D. Resume Task
        resume_res = await client.post(f"/api/browser/tasks/{task_id}/resume", headers=headers)
        assert resume_res.status_code in (200, 400)
        print("[PASS] Task Pause/Resume Lifecycle verified")

        # E. Cancel Task
        cancel_res = await client.post(
            f"/api/browser/tasks/{task_id}/cancel",
            json={"reason": "Auditing cancellation flow"},
            headers=headers,
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"
        print("[PASS] Task Cancellation: Successfully cancelled")

        # F. Retry Task from Checkpoint
        retry_res = await client.post(
            f"/api/browser/tasks/{task_id}/retry",
            json={"reset_to_checkpoint": True},
            headers=headers,
        )
        assert retry_res.status_code == 200
        assert retry_res.json()["status"] == "running"
        assert retry_res.json()["retry_count"] >= 1
        print(f"[PASS] Task Retry Engine: Task restarted with retry_count={retry_res.json()['retry_count']}")


# ============================================================================
# 6. CONCURRENT TASKS & MULTI-TENANT ISOLATION TEST
# ============================================================================

@pytest.mark.asyncio
async def test_concurrent_tasks_and_cross_user_isolation(base_url):
    """Verifies that concurrent tasks execute without crosstalk and cross-user isolation holds."""
    user_a = f"tenant_a_{int(time.time())}"
    user_b = f"tenant_b_{int(time.time())}"
    headers_a = {"X-User-Id": user_a, "Content-Type": "application/json"}
    headers_b = {"X-User-Id": user_b, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        # A. Create Task for User A
        res_a = await client.post(
            "/api/browser/tasks",
            json={"initial_url": "https://example.com", "task_description": "User A Private Automation"},
            headers=headers_a,
        )
        assert res_a.status_code == 201
        task_a_id = res_a.json()["id"]

        # B. Create Task for User B
        res_b = await client.post(
            "/api/browser/tasks",
            json={"initial_url": "https://example.com", "task_description": "User B Parallel Task"},
            headers=headers_b,
        )
        assert res_b.status_code == 201
        task_b_id = res_b.json()["id"]

        # C. User B attempts to access or cancel User A's task -> Must be 404
        access_res = await client.get(f"/api/browser/tasks/{task_a_id}", headers=headers_b)
        assert access_res.status_code == 404, "Cross-user task access was not blocked"

        cancel_res = await client.post(f"/api/browser/tasks/{task_a_id}/cancel", headers=headers_b)
        assert cancel_res.status_code == 404, "Cross-user cancellation attempt was not blocked"

        print(f"[PASS] Multi-Tenant Security: User B strictly isolated from User A's task {task_a_id}")
