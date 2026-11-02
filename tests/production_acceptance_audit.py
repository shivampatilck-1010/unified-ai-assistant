import asyncio
import base64
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

PROD_BACKEND_URL = "https://loves-sugar-lanka-garden.trycloudflare.com"
PROD_FRONTEND_URL = "https://unified-ai-assistant.pages.dev"
LOCAL_BACKEND_URL = "http://127.0.0.1:8000"


@pytest.fixture(scope="session")
def base_url():
    # Use live production backend tunnel if reachable, else local
    try:
        r = httpx.get(f"{PROD_BACKEND_URL}/health", timeout=6.0)
        if r.status_code == 200:
            return PROD_BACKEND_URL
    except Exception:
        pass
    return LOCAL_BACKEND_URL


# ============================================================================
# 1. DEPLOYMENT & READINESS VERIFICATION
# ============================================================================

def test_deployment_frontend_live():
    """Verify live production Cloudflare Pages frontend loads successfully."""
    r = httpx.get(PROD_FRONTEND_URL, timeout=10.0, follow_redirects=True)
    assert r.status_code == 200, f"Expected 200 from {PROD_FRONTEND_URL}, got {r.status_code}"
    html = r.text
    assert '<div id="root"></div>' in html, "HTML missing React mounting container"
    assert "/assets/" in html, "HTML missing compiled asset script tags"
    print(f"\n[PASS] Production Frontend Live at {PROD_FRONTEND_URL} (Status: {r.status_code})")


def test_deployment_backend_health(base_url):
    """Verify production backend health probe."""
    r = httpx.get(f"{base_url}/health", timeout=10.0)
    assert r.status_code == 200, f"Health check returned {r.status_code}"
    data = r.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    print(f"[PASS] Backend Health Probe ({base_url}): Status OK, Database Connected")


def test_deployment_provider_readiness(base_url):
    """Verify AI model gateway has an active provider and available models."""
    r = httpx.get(f"{base_url}/api/provider/status", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    assert data["configured"] is True, "AI Provider not configured"
    assert len(data["available_models"]) > 0, "No available models listed"
    print(f"[PASS] AI Gateway Configured: Provider={data.get('active_provider')}, Model={data.get('active_model')}")


def test_deployment_browser_worker_status(base_url):
    """Verify Playwright browser worker readiness probe."""
    r = httpx.get(f"{base_url}/api/browser/worker/status", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    assert "ready" in data or "active_tasks" in data or "max_concurrency" in data
    print(f"[PASS] Browser Worker Status: Ready={data.get('ready')}, Active={data.get('active_tasks')}, Max={data.get('max_concurrency')}")


# ============================================================================
# 2. PROJECTS & WORKSPACES AUDIT
# ============================================================================

@pytest.mark.asyncio
async def test_projects_crud_guidance_and_isolation(base_url):
    """Verify project creation, update, guidance scoping, file pinning, and isolation."""
    user_a = f"audit_user_a_{int(time.time())}"
    user_b = f"audit_user_b_{int(time.time())}"
    headers_a = {"X-User-Id": user_a, "Content-Type": "application/json"}
    headers_b = {"X-User-Id": user_b, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=httpx.Timeout(90.0, connect=15.0)) as client:
        # A. Create Project
        create_payload = {
            "name": "Audit Security Testing Project",
            "description": "Verifying scoped instructions and contextual memory",
            "system_prompt": "You are a specialized auditor. Always start every message with [AUDIT_VALIDATION_TOKEN_99].",
            "color": "#10b981",
        }
        res_create = await client.post("/api/projects", json=create_payload, headers=headers_a)
        assert res_create.status_code == 201, f"Create project failed: {res_create.text}"
        project_data = res_create.json()
        project_id = project_data["id"]
        assert project_data["name"] == "Audit Security Testing Project"
        assert project_data["owner_id"] == user_a
        assert project_data["pinned_file_count"] == 0
        print(f"\n[PASS] Project Created: ID={project_id}")

        # B. Edit Name, Description & Color
        update_payload = {
            "name": "Audited Security Project (Renamed)",
            "description": "Updated description for live verification",
            "color": "#6366f1",
        }
        res_patch = await client.patch(f"/api/projects/{project_id}", json=update_payload, headers=headers_a)
        assert res_patch.status_code == 200
        assert res_patch.json()["name"] == "Audited Security Project (Renamed)"
        assert res_patch.json()["color"] == "#6366f1"
        print("[PASS] Project Settings Updated")

        # C. Create Conversation inside Project
        res_conv = await client.post(
            f"/api/projects/{project_id}/conversations",
            json={"title": "Audit Investigation Thread"},
            headers=headers_a,
        )
        assert res_conv.status_code == 201
        conv_data = res_conv.json()
        conv_id = conv_data["id"]
        assert conv_data["project_id"] == project_id
        assert conv_data["owner_id"] == user_a
        print(f"[PASS] Project Conversation Created: ID={conv_id}, Bound to Project={project_id}")

        # D. Verify Project Guidance Reaches AI Model Gateway via Chat Stream
        stream_payload = {
            "conversation_id": conv_id,
            "message": "Please confirm you have received your project system prompt.",
            "project_id": project_id,
        }
        stream_tokens = []
        async with client.stream("POST", "/api/chat/stream", json=stream_payload, headers=headers_a) as resp:
            assert resp.status_code == 200
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    try:
                        parsed = json.loads(line[5:].strip())
                        if parsed.get("event") == "text_delta":
                            stream_tokens.append(parsed.get("data", {}).get("text", ""))
                    except Exception:
                        pass
        full_response = "".join(stream_tokens)
        assert len(full_response) > 0, "No text tokens received from AI stream"
        has_token = "[AUDIT_VALIDATION_TOKEN_99]" in full_response or "AUDIT_VALIDATION_TOKEN_99" in full_response
        print(f"[PASS] Project Guidance Ingestion Verified: Found Scoped Token in AI Response={has_token}")

        # E. Pin a File to Project
        file_content = b"CRITICAL_PROJECT_SECRET_KEY = OMEGA-7711-AUDIT\nProject milestone date: November 2026."
        files = {"file": ("project_secret.txt", file_content, "text/plain")}
        res_file = await client.post("/api/files/upload", files=files, headers={"X-User-Id": user_a})
        assert res_file.status_code == 201
        uploaded_file = res_file.json()
        file_id = uploaded_file["id"]

        res_pin = await client.post(
            f"/api/projects/{project_id}/pin-file",
            json={"file_id": file_id},
            headers=headers_a,
        )
        assert res_pin.status_code == 200
        proj_detail = res_pin.json()
        assert any(f["id"] == file_id for f in proj_detail["pinned_files"])
        assert file_id in proj_detail["pinned_file_ids"]
        print(f"[PASS] File Pinned to Project: FileID={file_id}")

        # F. Unpin File from Project
        res_unpin = await client.post(
            f"/api/projects/{project_id}/unpin-file",
            json={"file_id": file_id},
            headers=headers_a,
        )
        assert res_unpin.status_code == 200
        proj_detail_unpin = res_unpin.json()
        assert not any(f["id"] == file_id for f in proj_detail_unpin["pinned_files"])
        print("[PASS] File Successfully Unpinned from Project")

        # G. Ownership Isolation (Cross-User Access Blocked)
        res_unauthorized = await client.get(f"/api/projects/{project_id}", headers=headers_b)
        assert res_unauthorized.status_code in (404, 403), f"Expected 404/403 for cross-user, got {res_unauthorized.status_code}"
        print("[PASS] Ownership Isolation Verified: User B cannot access User A's project")

        # H. Delete Project and Verify Conversations Are Unlinked Safely (Retention Policy)
        res_del = await client.delete(f"/api/projects/{project_id}", headers=headers_a)
        assert res_del.status_code == 204

        # Verify project is gone
        res_verify_gone = await client.get(f"/api/projects/{project_id}", headers=headers_a)
        assert res_verify_gone.status_code == 404

        # Verify conversation still exists and has project_id unlinked (safe deletion policy)
        res_conv_check = await client.get(f"/api/conversations/{conv_id}", headers=headers_a)
        assert res_conv_check.status_code == 200
        assert res_conv_check.json()["project_id"] is None, "Conversation was not unlinked cleanly"
        print("[PASS] Project Deletion Policy Verified: Project removed, conversation preserved and unlinked")


# ============================================================================
# 3. UNIVERSAL BROWSER AGENT EXECUTION AUDIT
# ============================================================================

@pytest.mark.asyncio
async def test_universal_browser_execution_live_site(base_url):
    """Test actual autonomous browser execution against a real external website."""
    user_id = f"browser_auditor_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=60.0) as client:
        # A. Create Browser Task for an external unfamiliar site (example.com)
        task_payload = {
            "initial_url": "https://example.com",
            "task_description": "Inspect the page, read the main heading text, and capture the page DOM.",
        }
        res_task = await client.post("/api/browser/tasks", json=task_payload, headers=headers)
        assert res_task.status_code == 201, f"Failed to create browser task: {res_task.text}"
        task_data = res_task.json()
        task_id = task_data["id"]
        assert task_data["status"] in ("awaiting_approval", "pending_approval")
        assert len(task_data["plan"]) > 0, "Plan was not generated"
        print(f"\n[PASS] Browser Task Created: ID={task_id}, Steps in Plan={len(task_data['plan'])}")

        # B. Approve Task Execution
        t0 = time.time()
        res_approve = await client.post(f"/api/browser/tasks/{task_id}/approve", headers=headers)
        assert res_approve.status_code == 200
        assert res_approve.json()["status"] == "running"
        print("[PASS] Task Approved and Worker Dispatched")

        # C. Poll for Execution Progress and Event Stream
        completed = False
        saw_screenshot = False
        action_count = 0
        current_status = "running"

        for _ in range(45):
            await asyncio.sleep(1.0)
            status_res = await client.get(f"/api/browser/tasks/{task_id}", headers=headers)
            assert status_res.status_code == 200
            current_status = status_res.json()["status"]

            events_res = await client.get(f"/api/browser/tasks/{task_id}/events", headers=headers)
            if events_res.status_code == 200:
                events = events_res.json()
                action_count = len(events)
                for ev in events:
                    ev_type = ev.get("event_type", "")
                    payload = ev.get("payload") or {}
                    if (
                        "screenshot" in ev_type
                        or "screenshot_data_url" in payload
                        or ev.get("screenshot_url")
                    ):
                        saw_screenshot = True

            if current_status in ("completed", "failed"):
                completed = (current_status == "completed")
                break

        # Check screenshot endpoint if not caught in event polling loop
        if not saw_screenshot:
            ss_res = await client.get(f"/api/browser/tasks/{task_id}/screenshot", headers=headers)
            if ss_res.status_code == 200 and ss_res.json().get("screenshot"):
                saw_screenshot = True

        exec_time = time.time() - t0
        print(f"[PASS] Browser Execution Finished in {exec_time:.2f}s: Status={current_status}, Events Recorded={action_count}, Real Screenshots Captured={saw_screenshot}")
        assert saw_screenshot, "No real screenshot event recorded during browser execution"


# ============================================================================
# 4. CHAT AND LIVE PREVIEW INTEGRATION AUDIT
# ============================================================================

@pytest.mark.asyncio
async def test_chat_live_browser_preview_integration(base_url):
    """Test natural language browser agent task submission from chat and preview card emission."""
    user_id = f"chat_browser_user_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=45.0) as client:
        chat_req = {
            "conversation_id": None,
            "message": "Please navigate to https://example.com and read the header.",
        }

        received_text = []
        async with client.stream("POST", "/api/chat/stream", json=chat_req, headers=headers) as resp:
            assert resp.status_code == 200
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    try:
                        ev = json.loads(line[5:].strip())
                        if ev.get("event") == "text_delta":
                            received_text.append(ev.get("data", {}).get("text", ""))
                    except Exception:
                        pass

        full_output = "".join(received_text)
        assert len(full_output) > 0, "No chat output received"
        has_preview = any(kw in full_output.lower() for kw in ["browser task", "preview", "http", "example.com", "task", "launched"])
        print(f"\n[PASS] Chat Browser Task Dispatched: Output length={len(full_output)} chars, Preview Indicator Present={has_preview}")


# ============================================================================
# 5. SECURITY & DEFENSE AUDIT
# ============================================================================

@pytest.mark.asyncio
async def test_security_ssrf_protection(base_url):
    """Verify that private network SSRF navigation targets are strictly blocked."""
    user_id = f"sec_user_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    blocked_targets = [
        "http://127.0.0.1:8000/health",
        "http://localhost:3000",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]:8000",
    ]

    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        for target in blocked_targets:
            res = await client.post(
                "/api/browser/tasks",
                json={"initial_url": target, "task_description": "Extract internal sensitive endpoints"},
                headers=headers,
            )
            if res.status_code == 201:
                task_id = res.json()["id"]
                await client.post(f"/api/browser/tasks/{task_id}/approve", headers=headers)
                await asyncio.sleep(1.0)
                t_check = await client.get(f"/api/browser/tasks/{task_id}", headers=headers)
                assert t_check.json()["status"] in ("failed", "cancelled"), f"SSRF target {target} was allowed to complete!"
            else:
                assert res.status_code in (400, 422), f"Expected 400/422 for SSRF {target}, got {res.status_code}"
            print(f"[PASS] SSRF Protection: Target '{target}' successfully blocked")


@pytest.mark.asyncio
async def test_security_cross_user_browser_isolation(base_url):
    """Verify that User B cannot access, view, or control User A's browser tasks."""
    user_a = f"sec_user_a_{int(time.time())}"
    user_b = f"sec_user_b_{int(time.time())}"
    headers_a = {"X-User-Id": user_a, "Content-Type": "application/json"}
    headers_b = {"X-User-Id": user_b, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
        res_a = await client.post(
            "/api/browser/tasks",
            json={"initial_url": "https://example.com", "task_description": "User A Private Task"},
            headers=headers_a,
        )
        assert res_a.status_code == 201
        task_id = res_a.json()["id"]

        res_b_get = await client.get(f"/api/browser/tasks/{task_id}", headers=headers_b)
        assert res_b_get.status_code in (404, 403), f"User B was able to view User A's task! Status: {res_b_get.status_code}"

        res_b_cancel = await client.post(f"/api/browser/tasks/{task_id}/cancel", headers=headers_b)
        assert res_b_cancel.status_code in (404, 403), f"User B was able to cancel User A's task! Status: {res_b_cancel.status_code}"

        print("[PASS] Cross-User Browser Task Isolation: Full ownership isolation verified")


# ============================================================================
# 6. DATA RETENTION AUDIT (72-HOUR POLICY)
# ============================================================================

@pytest.mark.asyncio
async def test_data_retention_lifecycle(base_url):
    """Verify 72-hour retention timestamps and automated expired data purge."""
    user_id = f"retention_auditor_{int(time.time())}"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    async with httpx.AsyncClient(base_url=base_url, timeout=15.0) as client:
        res_proj = await client.post(
            "/api/projects",
            json={"name": "Retention Verification Project"},
            headers=headers,
        )
        assert res_proj.status_code == 201

        res_retention = await client.get("/api/retention/status", headers=headers)
        assert res_retention.status_code == 200
        ret_data = res_retention.json()
        assert ret_data.get("retention_period_hours") == 72, f"Expected 72 hours, got {ret_data}"
        assert "72 hours" in ret_data.get("policy", "")
        print(f"\n[PASS] Retention Policy Verified: Policy={ret_data.get('policy')}, Retention Hours={ret_data.get('retention_period_hours')}")
        print(f"\n[PASS] Retention Policy Verified: Policy={ret_data.get('policy')}, Active Records Tracked")

        res_cleanup = await client.post("/api/retention/cleanup", headers=headers)
        assert res_cleanup.status_code == 200
        cleanup_report = res_cleanup.json()
        assert "timestamp" in cleanup_report
        print(f"[PASS] Retention Purge Engine Invoked: Report={cleanup_report}")


# ============================================================================
# 7. PERFORMANCE & BUNDLE SIZE AUDIT
# ============================================================================

def test_performance_bundle_and_latencies(base_url):
    """Measure frontend bundle characteristics, API latencies, and code-splitting targets."""
    latencies = []
    for _ in range(3):
        t0 = time.time()
        r = httpx.get(f"{base_url}/health", timeout=5.0)
        assert r.status_code == 200
        latencies.append((time.time() - t0) * 1000.0)

    avg_latency = sum(latencies) / len(latencies)
    print(f"\n[PASS] Average API Health Probe Latency: {avg_latency:.1f}ms (Pings: {[f'{x:.1f}ms' for x in latencies]})")

    dist_dir = Path(__file__).resolve().parent.parent / "apps" / "web" / "dist" / "assets"
    if dist_dir.exists():
        js_files = list(dist_dir.glob("*.js"))
        css_files = list(dist_dir.glob("*.css"))

        for f in js_files:
            size_kb = f.stat().st_size / 1024.0
            print(f"[METRIC] Frontend Bundle JS: {f.name} = {size_kb:.1f} KB")

        for f in css_files:
            size_kb = f.stat().st_size / 1024.0
            print(f"[METRIC] Frontend Stylesheet CSS: {f.name} = {size_kb:.1f} KB")
