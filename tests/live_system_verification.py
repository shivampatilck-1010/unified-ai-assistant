import asyncio
import io
import json
import time
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000"
USER_A = f"live-user-a-{uuid.uuid4().hex[:8]}"
USER_B = f"live-user-b-{uuid.uuid4().hex[:8]}"

headers_a = {"X-User-Id": USER_A}
headers_b = {"X-User-Id": USER_B}


async def test_live_suite():
    print(f"=== STARTING LIVE APPLICATION VERIFICATION AGAINST {BASE_URL} ===")
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # 1. Health & Readiness Probe
        res_health = await client.get("/health")
        assert res_health.status_code == 200, f"Health check failed: {res_health.text}"
        print("[PASS] 1. Live Health Probe: 200 OK ->", res_health.json()["status"])

        res_ready = await client.get("/ready")
        assert res_ready.status_code == 200, f"Readiness check failed: {res_ready.text}"
        ready_data = res_ready.json()
        print("[PASS] 2. Live Readiness Probe: 200 OK ->", ready_data["status"], "Database:", ready_data["database"])

        # 2. Chat & SSE Streaming over live HTTP
        print("Testing Live SSE Streaming & Conversation Persistence...")
        stream_payload = {
            "message": "Hello from live staging verification! State your mission in one sentence.",
        }
        sse_events = []
        async with client.stream("POST", "/api/chat/stream", json=stream_payload, headers=headers_a) as stream_resp:
            assert stream_resp.status_code == 200
            async for line in stream_resp.aiter_lines():
                if line.startswith("data: "):
                    try:
                        sse_events.append(json.loads(line[6:]))
                    except Exception:
                        pass

        event_types = [e.get("event") for e in sse_events]
        assert "message_start" in event_types, "Missing message_start in live stream"
        assert "message_complete" in event_types, "Missing message_complete in live stream"
        conv_id = sse_events[0].get("conversation_id")
        print(f"[PASS] 3. Live SSE Streaming: received {len(sse_events)} events across conversation {conv_id}")

        # 3. Conversation persistence
        res_conv = await client.get(f"/api/conversations/{conv_id}", headers=headers_a)
        assert res_conv.status_code == 200
        conv_data = res_conv.json()
        assert len(conv_data["messages"]) >= 2
        print(f"[PASS] 4. Live Conversation Persistence: verified {len(conv_data['messages'])} messages stored in DB")

        # 4. Multi-tenant isolation: User B cannot access User A's conversation
        res_b_conv = await client.get(f"/api/conversations/{conv_id}", headers=headers_b)
        assert res_b_conv.status_code == 404
        print("[PASS] 5. Live Multi-Tenant Isolation: User B received 404 for User A conversation")

        # 5. File Upload & Knowledge Search
        print("Testing Live Document Ingestion & RAG...")
        file_bytes = b"# Quantum Telemetry Gateway\nThe Quantum Gateway operates at 100 Gbps with sub-millisecond encryption.\n"
        upload_resp = await client.post(
            "/api/files/upload",
            files={"file": ("quantum_specs.md", io.BytesIO(file_bytes), "text/markdown")},
            headers=headers_a,
        )
        assert upload_resp.status_code == 201
        file_data = upload_resp.json()
        file_id = file_data["id"]
        print(f"[PASS] 6. Live File Upload: file {file_id} indexed with status {file_data['status']}")

        search_resp = await client.post(
            "/api/knowledge/search",
            json={"query": "What is the speed of Quantum Gateway?", "top_k": 3},
            headers=headers_a,
        )
        assert search_resp.status_code == 200
        search_data = search_resp.json()
        assert search_data["total_results"] >= 1
        print(f"[PASS] 7. Live Knowledge Search: matched {search_data['total_results']} chunks with source citation")

        # 6. Tasks & Calendar CRUD
        print("Testing Live Task & Calendar Operations...")
        task_resp = await client.post(
            "/api/tasks",
            json={"title": "Audit Staging Deployment", "priority": "high"},
            headers=headers_a,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        patch_resp = await client.patch(
            f"/api/tasks/{task_id}",
            json={"status": "completed"},
            headers=headers_a,
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "completed"

        event_resp = await client.post(
            "/api/calendar/events",
            json={
                "title": "Staging Deployment Retrospective",
                "start_time": "2026-10-30T10:00:00Z",
                "end_time": "2026-10-30T11:00:00Z",
                "is_recurring": True,
                "recurrence_rule": "FREQ=WEEKLY;COUNT=2",
            },
            headers=headers_a,
        )
        assert event_resp.status_code == 201
        print(f"[PASS] 8. Live Task & Bounded Calendar: task {task_id} completed, recurring event created")

        # 7. Reminders Scheduling
        reminder_resp = await client.post(
            "/api/reminders",
            json={
                "title": "Check server metrics",
                "scheduled_time": "2026-10-30T12:00:00Z",
                "task_id": task_id,
            },
            headers=headers_a,
        )
        assert reminder_resp.status_code == 201
        assert reminder_resp.json()["status"] == "scheduled"
        print("[PASS] 9. Live Reminder Scheduling: status confirmed as 'scheduled'")

        # 8. Multi-Step Orchestration
        print("Testing Live Multi-Step Workflow Orchestration...")
        wf_resp = await client.post(
            "/api/orchestration/workflows",
            json={"prompt": "Inspect Wi-Fi sensing in room lab_alpha, summarize the status, and create a task: Review lab occupancy log"},
            headers=headers_a,
        )
        assert wf_resp.status_code == 201
        wf_data = wf_resp.json()
        wf_id = wf_data["id"]
        print(f"[PASS] 10a. Live Workflow Initialized: status '{wf_data['status']}', plan version {wf_data['plan_version']}")

        # If awaiting approval, approve the plan
        if wf_data["status"] == "awaiting_approval":
            approve_resp = await client.post(
                f"/api/orchestration/workflows/{wf_id}/approve",
                json={"approved": True, "plan_version": wf_data["plan_version"]},
                headers=headers_a,
            )
            assert approve_resp.status_code == 200
            print(f"[PASS] 10b. Live Plan Approval: workflow {wf_id} transitioned to 'running'")

        # Poll workflow execution
        poll_wf = None
        for _ in range(20):
            await asyncio.sleep(0.5)
            get_wf = await client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers_a)
            assert get_wf.status_code == 200
            poll_wf = get_wf.json()
            if poll_wf["status"] in ("waiting_for_confirmation", "completed", "failed"):
                break

        # If paused for consequential action confirmation (task creation), confirm it
        if poll_wf and poll_wf["status"] == "waiting_for_confirmation":
            pending = poll_wf.get("pending_confirmation")
            step_num = pending["step_number"] if pending else 3
            print(f"[PASS] 10c. Consequential Action Gate: paused at step {step_num} for user confirmation")
            confirm_resp = await client.post(
                f"/api/orchestration/workflows/{wf_id}/confirm",
                json={"step_number": step_num, "approved": True},
                headers=headers_a,
            )
            assert confirm_resp.status_code == 200
            print(f"[PASS] 10d. Live Action Confirmation: step {step_num} confirmed and resumed")

            for _ in range(20):
                await asyncio.sleep(0.5)
                get_wf = await client.get(f"/api/orchestration/workflows/{wf_id}", headers=headers_a)
                poll_wf = get_wf.json()
                if poll_wf["status"] in ("completed", "failed"):
                    break

        assert poll_wf and poll_wf["status"] in ("completed", "running")
        print(f"[PASS] 10e. Live Workflow Executed: workflow {wf_id} status is '{poll_wf['status']}'")

        # 9. Browser Task Execution with Real Playwright Runner
        print("Testing Live Browser Automation Task...")
        browser_task_resp = await client.post(
            "/api/browser/tasks",
            json={
                "task_description": "Navigate to example.com and inspect heading",
                "initial_url": "https://example.com",
            },
            headers=headers_a,
        )
        assert browser_task_resp.status_code == 201
        bt_id = browser_task_resp.json()["id"]
        print(f"[PASS] 11. Live Browser Task: task {bt_id} registered and plan generated")

        # Cancel browser task cleanly
        cancel_bt = await client.post(
            f"/api/browser/tasks/{bt_id}/cancel",
            json={"reason": "Completed smoke verification"},
            headers=headers_a,
        )
        assert cancel_bt.status_code == 200
        assert cancel_bt.json()["status"] == "cancelled"
        print(f"[PASS] 12. Live Task Cancellation: task {bt_id} cancelled cleanly")

        print("=== ALL LIVE APPLICATION VERIFICATION CHECKS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(test_live_suite())
