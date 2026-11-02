import asyncio
import os
import pytest
from datetime import datetime, timezone

from database import async_session_factory
from models.browser_task import BrowserTask, BrowserTaskEvent
from schemas.browser_task import (
    BrowserAction,
    BrowserActionType,
    BrowserPlan,
    BrowserPlanStep,
    BrowserTaskStatus,
)
from worker import BrowserWorkerRunner


@pytest.mark.asyncio
async def test_bharat_english_acceptance_live():
    """Live acceptance test verifying autonomous browser execution on Bharat English portal."""
    target_url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    runner = BrowserWorkerRunner(headless=True, allow_local=False, max_steps=10)

    # 1. Create a structured plan for the acceptance test
    plan = BrowserPlan(
        goal="Navigate and inspect Bharat English adaptive lesson",
        allowed_domains=["corporate.bharatenglish.org"],
        estimated_steps=4,
        steps=[
            BrowserPlanStep(
                step_index=1,
                description="Navigate to Bharat English portal",
                action=BrowserAction(
                    action_type=BrowserActionType.NAVIGATE,
                    url=target_url,
                    timeout_ms=30000,
                ),
            ),
            BrowserPlanStep(
                step_index=2,
                description="Wait for initial DOM hydration",
                action=BrowserAction(
                    action_type=BrowserActionType.WAIT_FOR,
                    condition="domcontentloaded",
                    timeout_ms=10000,
                ),
            ),
            BrowserPlanStep(
                step_index=3,
                description="Inspect portal page structure and title",
                action=BrowserAction(
                    action_type=BrowserActionType.INSPECT,
                ),
            ),
            BrowserPlanStep(
                step_index=4,
                description="Capture live viewport screenshot evidence",
                action=BrowserAction(
                    action_type=BrowserActionType.SCREENSHOT,
                ),
            ),
        ],
    )

    task_id = f"test-bet-{int(datetime.now(timezone.utc).timestamp())}"
    async with async_session_factory() as session:
        async with session.begin():
            t = BrowserTask(
                id=task_id,
                owner_id="test-user",
                task_description="Execute Bharat English acceptance test",
                status=BrowserTaskStatus.AWAITING_APPROVAL.value,
                current_step=0,
                plan=plan.model_dump(),
                approved_scope={
                    "allowed_domains": ["corporate.bharatenglish.org"],
                    "max_steps": 10,
                    "allowed_actions": ["navigate", "wait_for", "inspect", "screenshot", "read_text"],
                },
                evidence=[],
            )
            session.add(t)

    # 2. Subscribe to progress events
    queue = runner.subscribe(task_id)

    # 3. Execute the task
    await runner.execute_task(task_id)

    # 4. Verify DB state and outcome
    async with async_session_factory() as session:
        completed_task = await session.get(BrowserTask, task_id)
        assert completed_task is not None
        assert completed_task.status == BrowserTaskStatus.COMPLETED.value
        assert len(completed_task.evidence) >= 4
        assert completed_task.completed_at is not None

    # 5. Verify live screenshot frame was captured
    live_screenshot = runner.get_latest_screenshot(task_id)
    assert live_screenshot is not None
    assert live_screenshot.startswith("data:image/jpeg;base64,")

    # 6. Verify streamed events
    received_events = []
    while not queue.empty():
        received_events.append(queue.get_nowait())

    event_types = [e.get("event_type") for e in received_events]
    assert "task_started" in event_types
    assert "step_started" in event_types
    assert "step_completed" in event_types
    assert "task_completed" in event_types
    assert any("screenshot" in et for et in event_types)

    print("\n[ACCEPTANCE TEST SUCCESSFUL]")
    print(f"Task ID: {task_id}")
    print(f"Result summary: {completed_task.result_summary}")
    print(f"Evidence items: {len(completed_task.evidence)}")
    print(f"Screenshot data URI length: {len(live_screenshot)}")
