import asyncio
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient

from main import app
from providers.base import BaseProviderAdapter
from schemas.provider import ModelInfo
from services.calendar_utils import expand_recurrence, parse_rrule
from services.model_gateway import get_model_gateway
from services.reminder_scheduler import ReminderScheduler

client = TestClient(app)


# --- Mock Provider Adapter for NL Extraction Testing ---
class MockExtractorProvider(BaseProviderAdapter):
    def __init__(self, json_payload: str):
        self.payload = json_payload

    @property
    def provider_id(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return True

    def list_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id="gpt-4o",
                name="GPT-4o",
                provider="openai",
                description="Mock extractor model",
                is_default=True,
            )
        ]

    async def generate_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        yield self.payload

    async def generate_text(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
    ) -> str:
        return self.payload


# --- Tests: Tasks Management ---

def test_task_crud_and_status_transitions():
    headers = {"Authorization": "Bearer task-user-1"}
    due_time = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()

    # 1. Create task
    create_res = client.post(
        "/api/tasks",
        json={
            "title": "Draft Architecture Doc",
            "description": "Outline Phase 4 endpoints and models",
            "priority": "high",
            "due_date": due_time,
            "timezone": "America/New_York",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    task = create_res.json()
    task_id = task["id"]
    assert task["title"] == "Draft Architecture Doc"
    assert task["status"] == "pending"
    assert task["priority"] == "high"
    assert task["completed_at"] is None
    assert task["owner_id"] == "task-user-1"

    # 2. Get task
    get_res = client.get(f"/api/tasks/{task_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == task_id

    # 3. Update task
    patch_res = client.patch(
        f"/api/tasks/{task_id}",
        json={"priority": "urgent", "description": "Updated description"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["priority"] == "urgent"
    assert patch_res.json()["description"] == "Updated description"

    # 4. Toggle completion (idempotent)
    toggle_res1 = client.post(f"/api/tasks/{task_id}/toggle?completed=true", headers=headers)
    assert toggle_res1.status_code == 200
    assert toggle_res1.json()["status"] == "completed"
    assert toggle_res1.json()["completed_at"] is not None

    # Calling with completed=true again remains completed
    toggle_res2 = client.post(f"/api/tasks/{task_id}/toggle?completed=true", headers=headers)
    assert toggle_res2.status_code == 200
    assert toggle_res2.json()["status"] == "completed"

    # Toggling back to pending
    toggle_res3 = client.post(f"/api/tasks/{task_id}/toggle?completed=false", headers=headers)
    assert toggle_res3.status_code == 200
    assert toggle_res3.json()["status"] == "pending"
    assert toggle_res3.json()["completed_at"] is None

    # 5. Delete task
    del_res = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify 404 after deletion
    get_after_del = client.get(f"/api/tasks/{task_id}", headers=headers)
    assert get_after_del.status_code == 404


def test_task_list_filtering_and_search():
    import uuid
    uid = f"task-filter-{uuid.uuid4().hex[:8]}"
    headers = {"Authorization": f"Bearer {uid}"}

    # Seed 3 tasks
    client.post("/api/tasks", json={"title": "Alpha Research", "priority": "low", "status": "pending"}, headers=headers)
    client.post("/api/tasks", json={"title": "Beta Implementation", "priority": "high", "status": "in_progress"}, headers=headers)
    client.post("/api/tasks", json={"title": "Gamma Verification", "priority": "high", "status": "completed"}, headers=headers)

    # Filter by priority=high
    res_high = client.get("/api/tasks?priority=high", headers=headers)
    assert res_high.status_code == 200
    assert all(item["priority"] == "high" for item in res_high.json()["items"])
    assert len(res_high.json()["items"]) == 2

    # Filter by status=completed
    res_comp = client.get("/api/tasks?status=completed", headers=headers)
    assert res_comp.status_code == 200
    assert all(item["status"] == "completed" for item in res_comp.json()["items"])
    assert len(res_comp.json()["items"]) == 1

    # Search in title
    res_search = client.get("/api/tasks?search=Beta", headers=headers)
    assert res_search.status_code == 200
    items = res_search.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Beta Implementation"


def test_task_ownership_isolation():
    user_a = {"Authorization": "Bearer task-user-alice"}
    user_b = {"Authorization": "Bearer task-user-bob"}

    # Alice creates task
    res = client.post("/api/tasks", json={"title": "Alice Secret Task"}, headers=user_a)
    assert res.status_code == 201
    task_id = res.json()["id"]

    # Bob attempts to get Alice's task -> 404
    bob_get = client.get(f"/api/tasks/{task_id}", headers=user_b)
    assert bob_get.status_code == 404

    # Bob attempts to update Alice's task -> 404
    bob_patch = client.patch(f"/api/tasks/{task_id}", json={"title": "Bob Hijack"}, headers=user_b)
    assert bob_patch.status_code == 404

    # Bob attempts to toggle Alice's task -> 404
    bob_toggle = client.post(f"/api/tasks/{task_id}/toggle", headers=user_b)
    assert bob_toggle.status_code == 404

    # Bob attempts to delete Alice's task -> 404
    bob_del = client.delete(f"/api/tasks/{task_id}", headers=user_b)
    assert bob_del.status_code == 404


# --- Tests: Calendar Events & Recurrence ---

def test_calendar_event_crud_and_invalid_range():
    headers = {"Authorization": "Bearer cal-user-1"}
    now = datetime.now(timezone.utc)
    start_dt = now + timedelta(days=1)
    end_dt = start_dt + timedelta(hours=1)

    # 1. Reject invalid time range (end < start)
    invalid_res = client.post(
        "/api/calendar/events",
        json={
            "title": "Invalid Meeting",
            "start_time": end_dt.isoformat(),
            "end_time": start_dt.isoformat(),
        },
        headers=headers,
    )
    assert invalid_res.status_code == 422 or invalid_res.status_code == 400

    # 2. Create valid event
    create_res = client.post(
        "/api/calendar/events",
        json={
            "title": "Sprint Planning",
            "description": "Bi-weekly sprint kick-off",
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "timezone": "America/New_York",
            "location": "Room 401 / Virtual",
            "color": "blue",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    event = create_res.json()
    event_id = event["id"]
    assert event["title"] == "Sprint Planning"
    assert event["timezone"] == "America/New_York"

    # 3. Retrieve event
    get_res = client.get(f"/api/calendar/events/{event_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Sprint Planning"

    # 4. Update event
    update_res = client.patch(
        f"/api/calendar/events/{event_id}",
        json={"title": "Sprint Planning Refined", "color": "teal"},
        headers=headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Sprint Planning Refined"
    assert update_res.json()["color"] == "teal"

    # 5. Delete event
    del_res = client.delete(f"/api/calendar/events/{event_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify 404 after deletion
    assert client.get(f"/api/calendar/events/{event_id}", headers=headers).status_code == 404


def test_calendar_rrule_validation_and_expansion():
    # Unit validation of RRULE bounds
    with pytest.raises(ValueError, match="Unsupported or missing FREQ"):
        parse_rrule("INTERVAL=2")

    with pytest.raises(ValueError, match="COUNT must be between 1 and 50"):
        parse_rrule("FREQ=DAILY;COUNT=100")

    parsed = parse_rrule("FREQ=WEEKLY;INTERVAL=2;COUNT=5;BYDAY=MO,WE,FR")
    assert parsed["FREQ"] == "WEEKLY"
    assert parsed["INTERVAL"] == 2
    assert parsed["COUNT"] == 5
    assert parsed["BYDAY_LIST"] == ["MO", "WE", "FR"]

    # Expansion in window
    base_start = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)  # A Monday
    base_end = datetime(2026, 11, 2, 10, 0, tzinfo=timezone.utc)
    window_s = datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc)
    window_e = datetime(2026, 11, 30, 23, 59, tzinfo=timezone.utc)

    occurrences = expand_recurrence(
        start_time=base_start,
        end_time=base_end,
        rrule_str="FREQ=WEEKLY;INTERVAL=1;COUNT=4",
        window_start=window_s,
        window_end=window_e,
    )
    assert len(occurrences) == 4
    # Occurrences should be spaced by 7 days
    assert (occurrences[1][0] - occurrences[0][0]).days == 7
    assert (occurrences[2][0] - occurrences[1][0]).days == 7


def test_calendar_events_range_query_with_recurring():
    import uuid
    uid = f"cal-range-{uuid.uuid4().hex[:8]}"
    headers = {"Authorization": f"Bearer {uid}"}
    base_start = datetime(2026, 11, 1, 14, 0, tzinfo=timezone.utc)
    base_end = datetime(2026, 11, 1, 15, 0, tzinfo=timezone.utc)

    # Create recurring event (FREQ=DAILY;COUNT=5)
    create_res = client.post(
        "/api/calendar/events",
        json={
            "title": "Daily Standup",
            "start_time": base_start.isoformat(),
            "end_time": base_end.isoformat(),
            "recurrence_rule": "FREQ=DAILY;COUNT=5",
        },
        headers=headers,
    )
    assert create_res.status_code == 201

    # Query events in range covering all 5 days
    q_start = datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc).isoformat()
    q_end = datetime(2026, 11, 10, 0, 0, tzinfo=timezone.utc).isoformat()
    range_res = client.get("/api/calendar/events", params={"start": q_start, "end": q_end}, headers=headers)
    assert range_res.status_code == 200
    data = range_res.json()
    assert len(data["events"]) >= 1
    # Check occurrences
    daily_occs = [occ for occ in data["occurrences"] if occ["title"] == "Daily Standup"]
    assert len(daily_occs) == 5
    assert daily_occs[0]["is_recurring"] is True


def test_calendar_ownership_isolation():
    user_a = {"Authorization": "Bearer cal-alice"}
    user_b = {"Authorization": "Bearer cal-bob"}

    now = datetime.now(timezone.utc)
    res = client.post(
        "/api/calendar/events",
        json={
            "title": "Alice Private Sync",
            "start_time": now.isoformat(),
            "end_time": (now + timedelta(hours=1)).isoformat(),
        },
        headers=user_a,
    )
    assert res.status_code == 201
    ev_id = res.json()["id"]

    # Bob cannot read or delete
    assert client.get(f"/api/calendar/events/{ev_id}", headers=user_b).status_code == 404
    assert client.delete(f"/api/calendar/events/{ev_id}", headers=user_b).status_code == 404


# --- Tests: Reminders & Background Scheduler ---

def test_reminder_crud_and_idempotency():
    headers = {"Authorization": "Bearer reminder-user-1"}
    sched_time = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()

    # 1. Create reminder with idempotency_key
    res1 = client.post(
        "/api/reminders",
        json={
            "title": "Submit Timecard",
            "scheduled_time": sched_time,
            "idempotency_key": "timecard-2026-w44",
        },
        headers=headers,
    )
    assert res1.status_code == 201
    rem1 = res1.json()
    assert rem1["title"] == "Submit Timecard"
    assert rem1["status"] == "scheduled"

    # 2. Resubmitting with same idempotency key returns existing
    res2 = client.post(
        "/api/reminders",
        json={
            "title": "Submit Timecard Duplicate",
            "scheduled_time": sched_time,
            "idempotency_key": "timecard-2026-w44",
        },
        headers=headers,
    )
    assert res2.status_code == 201
    assert res2.json()["id"] == rem1["id"]

    # 3. Dismiss reminder
    rem_id = rem1["id"]
    dismiss_res = client.post(f"/api/reminders/{rem_id}/dismiss", headers=headers)
    assert dismiss_res.status_code == 200
    assert dismiss_res.json()["status"] == "dismissed"
    assert dismiss_res.json()["dismissed_at"] is not None

    # 4. Delete reminder
    assert client.delete(f"/api/reminders/{rem_id}", headers=headers).status_code == 204
    assert client.get(f"/api/reminders/{rem_id}", headers=headers).status_code == 404


@pytest.mark.asyncio
async def test_reminder_scheduler_tick_and_atomic_claim():
    headers = {"Authorization": "Bearer scheduler-user"}

    # 1. Create an overdue reminder (scheduled in the past)
    past_due = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    res = client.post(
        "/api/reminders",
        json={
            "title": "Overdue In-App Alert",
            "scheduled_time": past_due,
        },
        headers=headers,
    )
    assert res.status_code == 201
    rem_id = res.json()["id"]

    # 2. Run scheduler tick directly
    scheduler = ReminderScheduler()
    processed = await scheduler.tick()
    assert processed >= 1

    # 3. Check status is now 'delivered'
    get_res = client.get(f"/api/reminders/{rem_id}", headers=headers)
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["status"] == "delivered"
    assert data["delivered_at"] is not None
    assert data["delivery_attempts"] == 1


# --- Tests: Natural Language Extraction ---

def test_nl_extraction_unconfigured_error():
    gateway = get_model_gateway()
    gateway.reset()  # Reset to default unconfigured adapters

    # Without API keys, extraction returns 400 with actionable error
    headers = {"Authorization": "Bearer nl-user-1"}
    res = client.post(
        "/api/tasks/extract",
        json={"text": "Review PR tomorrow at 10am"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "No AI model provider is configured" in res.json()["detail"]


def test_nl_extraction_with_mock_model_gateway():
    gateway = get_model_gateway()

    # Prepare mock model response simulating extraction of 1 task, 1 event, 1 reminder
    mock_llm_json = """{
      "tasks": [
        {
          "title": "Finalize Q4 report",
          "priority": "high",
          "due_date": "2026-11-06T17:00:00Z",
          "description": "Include user growth numbers"
        }
      ],
      "events": [
        {
          "title": "Quarterly Business Review",
          "start_time": "2026-11-05T14:00:00Z",
          "end_time": "2026-11-05T15:30:00Z",
          "all_day": false,
          "location": "Boardroom / Zoom"
        }
      ],
      "reminders": [
        {
          "title": "Prepare slide deck",
          "scheduled_time": "2026-11-05T09:00:00Z"
        }
      ],
      "explanation": "Extracted 1 task for Friday, 1 meeting for Thursday afternoon, and 1 prep reminder."
    }"""

    mock_adapter = MockExtractorProvider(mock_llm_json)
    gateway.register_provider(mock_adapter)

    try:
        headers = {"Authorization": "Bearer nl-user-2"}
        ref_time = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc).isoformat()
        res = client.post(
            "/api/tasks/extract",
            json={
                "text": "Finalize Q4 report by Friday 5pm, quarterly business review Thursday at 2pm in Boardroom, remind me Thursday 9am",
                "reference_time": ref_time,
                "timezone": "UTC",
            },
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()

        # Verify structured proposal
        assert data["requires_confirmation"] is True
        assert len(data["tasks"]) == 1
        assert data["tasks"][0]["title"] == "Finalize Q4 report"
        assert data["tasks"][0]["priority"] == "high"

        assert len(data["events"]) == 1
        assert data["events"][0]["title"] == "Quarterly Business Review"
        assert data["events"][0]["location"] == "Boardroom / Zoom"

        assert len(data["reminders"]) == 1
        assert data["reminders"][0]["title"] == "Prepare slide deck"

        # Crucial check: verify that calling /extract did NOT silently persist records into the database
        list_tasks = client.get("/api/tasks?search=Finalize", headers=headers)
        assert len(list_tasks.json()["items"]) == 0

    finally:
        gateway.reset()
