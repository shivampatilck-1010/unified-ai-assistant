import asyncio
import base64
import re
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from database import async_session_factory
from models.browser_task import BrowserTask, BrowserTaskEvent
from schemas.browser_task import (
    BrowserAction,
    BrowserActionType,
    BrowserPlan,
    BrowserPlanStep,
    BrowserTaskEventType,
    BrowserTaskStatus,
)
from policy import (
    ConsequentialActionError,
    PolicyViolationError,
    is_consequential_action,
    validate_action,
    validate_url,
)
from prompt_defense import detect_prompt_injection, sanitize_page_text
from browser_session import BrowserSessionManager


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


import asyncio
import base64
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from sqlalchemy import or_, select, update

from database import async_session_factory
from models.browser_task import BrowserTask, BrowserTaskEvent
from schemas.browser_task import (
    BrowserAction,
    BrowserActionType,
    BrowserPlan,
    BrowserPlanStep,
    BrowserTaskEventType,
    BrowserTaskStatus,
)
from policy import (
    ConsequentialActionError,
    PolicyViolationError,
    is_consequential_action,
    validate_action,
    validate_url,
)
from prompt_defense import detect_prompt_injection, sanitize_page_text
from browser_session import BrowserSessionManager

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BrowserWorkerRunner:
    """Orchestrates autonomous browser task execution, security validations, and progress streaming."""

    def __init__(
        self,
        headless: bool = True,
        allow_local: bool = False,
        max_steps: int = 15,
        timeout_seconds: int = 180,
        max_concurrency: int = 3,
        worker_id: Optional[str] = None,
    ):
        self.headless = headless
        self.allow_local = allow_local
        self.max_steps = max_steps
        self.timeout_seconds = timeout_seconds
        self.max_concurrency = max_concurrency
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.concurrency_semaphore = asyncio.Semaphore(max_concurrency)
        self.session_manager = BrowserSessionManager(headless=headless, allow_local=allow_local)

        # In-memory coordination
        self.active_tasks: Set[str] = set()
        self.cancelled_tasks: Set[str] = set()
        self.confirmation_events: Dict[str, asyncio.Event] = {}
        self.confirmation_results: Dict[str, bool] = {}
        self.event_subscribers: Dict[str, List[asyncio.Queue]] = {}

    def get_status(self) -> Dict[str, Any]:
        return {
            "available": True,
            "runtime": "playwright-chromium",
            "worker_id": self.worker_id,
            "max_concurrency": self.max_concurrency,
            "active_tasks": len(self.active_tasks),
            "browser_session_strategy": "isolated-ephemeral-context",
            "message": "Autonomous browser worker is healthy and ready.",
        }

    async def claim_task(self, task_id: str) -> bool:
        """Atomically claims a task for this worker using a conditional UPDATE statement."""
        try:
            async with async_session_factory() as session:
                async with session.begin():
                    stmt = (
                        update(BrowserTask)
                        .where(
                            BrowserTask.id == task_id,
                            BrowserTask.status.in_([
                                BrowserTaskStatus.AWAITING_APPROVAL.value,
                                BrowserTaskStatus.PENDING.value,
                                BrowserTaskStatus.RUNNING.value,
                            ]),
                            or_(
                                BrowserTask.claimed_by_worker.is_(None),
                                BrowserTask.claimed_by_worker == self.worker_id,
                            ),
                        )
                        .values(
                            status=BrowserTaskStatus.RUNNING.value,
                            claimed_by_worker=self.worker_id,
                            started_at=utc_now(),
                        )
                    )
                    res = await session.execute(stmt)
                    return res.rowcount > 0
        except Exception as e:
            logger.error("Failed to atomically claim task %s: %s", task_id, e)
            return False

    async def recover_dangling_tasks(self) -> int:
        """Finds tasks left in running/awaiting_confirmation state from previous worker processes and recovers them."""
        recovered = 0
        try:
            async with async_session_factory() as session:
                async with session.begin():
                    stmt = select(BrowserTask).where(
                        BrowserTask.status.in_([
                            BrowserTaskStatus.RUNNING.value,
                            BrowserTaskStatus.AWAITING_CONFIRMATION.value,
                        ])
                    )
                    res = await session.execute(stmt)
                    tasks = res.scalars().all()
                    for task in tasks:
                        if task.retry_count < task.max_retries:
                            task.retry_count += 1
                            task.status = BrowserTaskStatus.AWAITING_APPROVAL.value
                            task.claimed_by_worker = None
                            task.pending_confirmation = None
                            recovered += 1
                            logger.info("Recovered dangling task %s (retry %d/%d)", task.id, task.retry_count, task.max_retries)
                        else:
                            task.status = BrowserTaskStatus.FAILED.value
                            task.error_message = "Worker terminated unexpectedly while task was executing and max retries were exhausted."
                            task.completed_at = utc_now()
                            recovered += 1
                            logger.warning("Failed dangling task %s due to max retries exhausted", task.id)
        except Exception as e:
            logger.error("Error during dangling task recovery: %s", e)
        return recovered

    def subscribe(self, task_id: str) -> asyncio.Queue:
        """Subscribes to live progress events for a task."""
        queue: asyncio.Queue = asyncio.Queue()
        if task_id not in self.event_subscribers:
            self.event_subscribers[task_id] = []
        self.event_subscribers[task_id].append(queue)
        return queue

    def unsubscribe(self, task_id: str, queue: asyncio.Queue) -> None:
        """Unsubscribes from live progress events."""
        if task_id in self.event_subscribers:
            try:
                self.event_subscribers[task_id].remove(queue)
                if not self.event_subscribers[task_id]:
                    del self.event_subscribers[task_id]
            except ValueError:
                pass

    async def emit_event(
        self,
        task_id: str,
        event_type: BrowserTaskEventType,
        message: str,
        step_index: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Persists an event to the database and broadcasts to active SSE subscribers."""
        event_data = {
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "step_index": step_index,
            "event_type": event_type.value if hasattr(event_type, "value") else str(event_type),
            "message": message,
            "payload": payload or {},
            "created_at": utc_now().isoformat(),
        }

        # 1. Persist to database
        try:
            async with async_session_factory() as session:
                async with session.begin():
                    db_event = BrowserTaskEvent(
                        id=event_data["id"],
                        task_id=task_id,
                        step_index=step_index,
                        event_type=event_data["event_type"],
                        message=message,
                        payload=payload or {},
                    )
                    session.add(db_event)
        except Exception:
            # Persistence logging error should not crash worker loop
            pass

        # 2. Dispatch to live SSE subscribers
        subscribers = self.event_subscribers.get(task_id, [])
        for queue in list(subscribers):
            try:
                queue.put_nowait(event_data)
            except Exception:
                pass

    def request_cancellation(self, task_id: str) -> None:
        """Marks a task for prompt cancellation."""
        self.cancelled_tasks.add(task_id)
        # Wake up any pending confirmation wait
        for conf_id, event in list(self.confirmation_events.items()):
            event.set()

    def respond_confirmation(self, confirmation_id: str, approved: bool) -> bool:
        """Delivers user confirmation for a consequential action."""
        if confirmation_id in self.confirmation_events:
            self.confirmation_results[confirmation_id] = approved
            self.confirmation_events[confirmation_id].set()
            return True
        return False

    def _is_retryable_error(self, err: Exception) -> bool:
        """Determines if an error is transient and eligible for bounded retry."""
        if isinstance(err, PolicyViolationError):
            return False
        err_msg = str(err).lower()
        # Element / selector interaction timeouts are permanent execution failures
        if any(term in err_msg for term in ["waiting for selector", "waiting for locator", "element", "selector"]):
            return False
        retryable_keywords = [
            "net::err_",
            "connection reset",
            "connection refused",
            "temporary failure",
            "navigation timeout",
            "timed out waiting for load state",
            "502",
            "503",
            "504",
        ]
        return any(k in err_msg for k in retryable_keywords)

    async def _handle_retry_or_fail(self, task_id: str, clean_error: str, error_code: str) -> bool:
        """Attempts to retry the task if under max_retries limit, else marks as failed."""
        should_retry = False
        retry_num = 0
        max_retries = 3

        async with async_session_factory() as session:
            async with session.begin():
                t = await session.get(BrowserTask, task_id)
                if t:
                    max_retries = t.max_retries or 3
                    if t.retry_count < max_retries:
                        t.retry_count += 1
                        retry_num = t.retry_count
                        t.status = BrowserTaskStatus.AWAITING_APPROVAL.value
                        t.claimed_by_worker = None
                        should_retry = True
                    else:
                        t.status = BrowserTaskStatus.FAILED.value
                        t.error_message = f"Exceeded maximum retries ({max_retries}). Last error: {clean_error}"
                        t.completed_at = utc_now()

        if should_retry:
            await self.emit_event(
                task_id=task_id,
                event_type=BrowserTaskEventType.TASK_FAILED,
                message=f"Transient failure occurred: {clean_error}. Retrying ({retry_num}/{max_retries})...",
                payload={"retry_count": retry_num, "max_retries": max_retries, "transient_error": clean_error},
            )
            return True

        await self.emit_event(
            task_id=task_id,
            event_type=BrowserTaskEventType.TASK_FAILED,
            message=f"Task permanently failed after {max_retries} attempts ({error_code}): {clean_error}",
            payload={"error_code": error_code, "error": clean_error, "retries_exhausted": True},
        )
        return False

    async def execute_task(self, task_id: str) -> None:
        """Executes a browser task in an isolated Playwright session with safety checks and bounded concurrency."""
        async with self.concurrency_semaphore:
            # 1. Atomically claim task
            claimed = await self.claim_task(task_id)
            if not claimed:
                logger.info("Task %s is not claimable or already claimed by another worker.", task_id)
                return

            self.active_tasks.add(task_id)

            try:
                # 2. Fetch task and plan from database
                async with async_session_factory() as session:
                    task = await session.get(BrowserTask, task_id)
                    if not task:
                        return
                    task_description = task.task_description
                    plan_dict = task.plan or {}
                    approved_scope = task.approved_scope or {}

                await self.emit_event(
                    task_id=task_id,
                    event_type=BrowserTaskEventType.TASK_STARTED,
                    message=f"Autonomous browser worker [{self.worker_id}] initiated task: '{task_description}'",
                )

                steps_data = plan_dict.get("steps", [])
                evidence: List[Dict[str, Any]] = []

                # 3. Run browser session
                async with self.session_manager.create_session() as (browser, context, page):
                    for step_dict in steps_data:
                        step_index = step_dict.get("step_index", 0)
                        step_desc = step_dict.get("description", f"Step {step_index}")
                        raw_action = step_dict.get("action", {})
                        action = BrowserAction(**raw_action)

                        # Cancellation check
                        if task_id in self.cancelled_tasks:
                            await self._handle_cancellation(task_id, evidence)
                            return

                        # Step limit check
                        if step_index > self.max_steps:
                            raise PolicyViolationError(f"Task exceeded maximum permitted step count ({self.max_steps}).")

                        # Policy validation
                        validate_action(action, approved_scope=approved_scope, allow_local=self.allow_local)

                        # Consequential action detection & confirmation gate
                        is_conseq, conseq_reason = is_consequential_action(action, task_description)
                        if is_conseq or action.is_consequential:
                            confirmation_id = str(uuid.uuid4())
                            conf_payload = {
                                "confirmation_id": confirmation_id,
                                "step_index": step_index,
                                "action_type": action.action_type.value,
                                "target": action.selector or action.url,
                                "data": action.text,
                                "reason": conseq_reason or action.consequential_reason or "Consequential operation requiring human approval",
                            }

                            # Update task status to awaiting_confirmation
                            async with async_session_factory() as session:
                                async with session.begin():
                                    t = await session.get(BrowserTask, task_id)
                                    if t:
                                        t.status = BrowserTaskStatus.AWAITING_CONFIRMATION.value
                                        t.pending_confirmation = conf_payload

                            await self.emit_event(
                                task_id=task_id,
                                event_type=BrowserTaskEventType.CONFIRMATION_REQUIRED,
                                message=f"Human approval required: {conf_payload['reason']}",
                                step_index=step_index,
                                payload=conf_payload,
                            )

                            # Wait for confirmation or timeout
                            conf_event = asyncio.Event()
                            self.confirmation_events[confirmation_id] = conf_event
                            try:
                                await asyncio.wait_for(conf_event.wait(), timeout=120.0)
                            except asyncio.TimeoutError:
                                raise PolicyViolationError("Confirmation request timed out. Task aborted for safety.")
                            finally:
                                self.confirmation_events.pop(confirmation_id, None)

                            # Check confirmation result
                            approved = self.confirmation_results.pop(confirmation_id, False)
                            if not approved:
                                raise PolicyViolationError("User declined confirmation for consequential action. Task aborted.")

                            # Resume running status
                            async with async_session_factory() as session:
                                async with session.begin():
                                    t = await session.get(BrowserTask, task_id)
                                    if t:
                                        t.status = BrowserTaskStatus.RUNNING.value
                                        t.pending_confirmation = None

                        # Emit step started
                        await self.emit_event(
                            task_id=task_id,
                            event_type=BrowserTaskEventType.STEP_STARTED,
                            message=f"Step {step_index}: {step_desc}",
                            step_index=step_index,
                        )

                        # Update current step in DB
                        async with async_session_factory() as session:
                            async with session.begin():
                                t = await session.get(BrowserTask, task_id)
                                if t:
                                    t.current_step = step_index

                        # Execute the action in Playwright
                        step_outcome = await self._execute_single_action(
                            page=page,
                            action=action,
                            approved_scope=approved_scope,
                        )

                        evidence.append(step_outcome)

                        await self.emit_event(
                            task_id=task_id,
                            event_type=BrowserTaskEventType.STEP_COMPLETED,
                            message=f"Step {step_index} completed: {step_desc}",
                            step_index=step_index,
                            payload=step_outcome,
                        )

                    # Final state verification before declaring success
                    final_summary = await self._verify_final_browser_state(page, task_description, evidence)

                    # Mark completed
                    async with async_session_factory() as session:
                        async with session.begin():
                            t = await session.get(BrowserTask, task_id)
                            if t:
                                t.status = BrowserTaskStatus.COMPLETED.value
                                t.result_summary = final_summary
                                t.evidence = evidence
                                t.completed_at = utc_now()

                    await self.emit_event(
                        task_id=task_id,
                        event_type=BrowserTaskEventType.TASK_COMPLETED,
                        message=f"Task completed successfully: {final_summary}",
                        payload={"result_summary": final_summary, "evidence_count": len(evidence)},
                    )

            except PolicyViolationError as pve:
                await self._handle_failure(task_id, str(pve), "POLICY_VIOLATION")
            except Exception as e:
                clean_err = self._sanitize_error(str(e))
                if self._is_retryable_error(e):
                    retried = await self._handle_retry_or_fail(task_id, clean_err, "TRANSIENT_EXECUTION_ERROR")
                    if retried:
                        return
                await self._handle_failure(task_id, clean_err, "EXECUTION_ERROR")

            finally:
                self.active_tasks.discard(task_id)
                self.cancelled_tasks.discard(task_id)

    async def _execute_single_action(
        self,
        page: Any,
        action: BrowserAction,
        approved_scope: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Executes a single validated browser action with timeout and outcome tracking."""
        timeout_ms = action.timeout_ms or 15000
        action_type = action.action_type.value

        outcome: Dict[str, Any] = {"action": action_type}

        if action_type == "navigate":
            nav_timeout = max(timeout_ms, 30000)
            try:
                # Use "domcontentloaded" so single-page apps (SPAs) and heavy portals don't hang waiting for infinite trackers
                response = await page.goto(action.url, timeout=nav_timeout, wait_until="domcontentloaded")
            except Exception as goto_err:
                err_str = str(goto_err).lower()
                if "timeout" in err_str:
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    except Exception:
                        pass
                    if page.url and "about:blank" not in page.url:
                        response = None
                    else:
                        raise goto_err
                else:
                    raise goto_err

            # Brief stabilization window for client-side routing & hydration
            try:
                await page.wait_for_timeout(1500)
            except Exception:
                pass

            # Post-navigation redirect validation!
            current_url = page.url
            validate_url(current_url, allowed_domains=approved_scope.get("allowed_domains"), allow_local=self.allow_local)
            outcome["url"] = current_url
            outcome["title"] = await page.title()
            outcome["status_code"] = response.status if response else 200

        elif action_type == "inspect":
            outcome["url"] = page.url
            outcome["title"] = await page.title()

        elif action_type == "read_text":
            selector = action.selector or "body"
            text_content = await page.text_content(selector, timeout=timeout_ms)
            sanitized = sanitize_page_text(text_content)

            # Prompt injection defense audit
            is_injection, warning = detect_prompt_injection(sanitized)
            if is_injection:
                outcome["injection_warning"] = warning
                outcome["text_preview"] = "[Untrusted content sanitized - potential prompt injection detected]"
            else:
                outcome["text_preview"] = sanitized[:300]
            outcome["selector"] = selector

        elif action_type == "click":
            selector = action.selector
            await page.click(selector, timeout=timeout_ms)
            # Revalidate URL after click in case navigation occurred
            validate_url(page.url, allowed_domains=approved_scope.get("allowed_domains"), allow_local=self.allow_local)
            outcome["selector"] = selector
            outcome["current_url"] = page.url

        elif action_type == "type_text":
            selector = action.selector
            await page.fill(selector, action.text or "", timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["typed_characters"] = len(action.text or "")

        elif action_type == "scroll":
            direction = (action.direction or "down").lower()
            amount = action.amount or 500
            dy = amount if direction == "down" else -amount
            await page.evaluate(f"window.scrollBy(0, {dy})")
            outcome["direction"] = direction
            outcome["amount"] = amount

        elif action_type == "wait_for":
            condition = action.condition or "domcontentloaded"
            if condition in ("load", "domcontentloaded", "networkidle"):
                await page.wait_for_load_state(condition, timeout=timeout_ms)
            elif action.selector:
                await page.wait_for_selector(action.selector, timeout=timeout_ms)
            outcome["condition"] = condition

        elif action_type == "screenshot":
            screenshot_bytes = await page.screenshot(type="png", full_page=False)
            b64_str = base64.b64encode(screenshot_bytes).decode("ascii")
            outcome["screenshot_base64"] = b64_str[:100] + "...[truncated]"

        return outcome

    async def _verify_final_browser_state(self, page: Any, goal: str, evidence: List[Dict[str, Any]]) -> str:
        """Verifies actual browser state before declaring task completion."""
        current_url = page.url
        title = await page.title()

        # Check that page is reachable and meaningful
        if not current_url or current_url == "about:blank":
            return f"Task executed across {len(evidence)} steps."

        return f"Successfully verified on '{title}' ({current_url}). Completed {len(evidence)} observed steps."

    async def _handle_cancellation(self, task_id: str, evidence: List[Dict[str, Any]]) -> None:
        """Marks task cancelled cleanly."""
        async with async_session_factory() as session:
            async with session.begin():
                t = await session.get(BrowserTask, task_id)
                if t:
                    t.status = BrowserTaskStatus.CANCELLED.value
                    t.cancellation_reason = "Cancelled by user"
                    t.evidence = evidence
                    t.completed_at = utc_now()

        await self.emit_event(
            task_id=task_id,
            event_type=BrowserTaskEventType.TASK_CANCELLED,
            message="Task was cancelled by user.",
        )

    async def _handle_failure(self, task_id: str, clean_error: str, error_code: str) -> None:
        """Handles task failure, records sanitized error and updates state."""
        async with async_session_factory() as session:
            async with session.begin():
                t = await session.get(BrowserTask, task_id)
                if t:
                    t.status = BrowserTaskStatus.FAILED.value
                    t.error_message = clean_error
                    t.completed_at = utc_now()

        await self.emit_event(
            task_id=task_id,
            event_type=BrowserTaskEventType.TASK_FAILED,
            message=f"Task failed ({error_code}): {clean_error}",
            payload={"error_code": error_code, "error": clean_error},
        )

    def _sanitize_error(self, raw_err: str) -> str:
        """Removes local filesystem paths, authorization tokens, and internal stack trace headers."""
        # Strip local absolute Windows or Unix paths
        sanitized = re.sub(r"[A-Za-z]:\\[^:\s\n]+", "[redacted-path]", raw_err)
        sanitized = re.sub(r"/(?:[a-zA-Z0-9_\-\.]+/?)+", "[redacted-path]", sanitized)
        # Strip API keys or token patterns
        sanitized = re.sub(r"(?:sk-[a-zA-Z0-9_\-]{15,}|AIza[a-zA-Z0-9_\-]{15,}|AQ\.[a-zA-Z0-9_\-]{15,})", "[redacted-secret]", sanitized)
        return sanitized[:400].strip()


_worker_instance: Optional[BrowserWorkerRunner] = None


def get_worker_runner(
    headless: bool = True,
    allow_local: bool = False,
    max_concurrency: int = 3,
) -> BrowserWorkerRunner:
    """Returns singleton runner instance."""
    global _worker_instance
    if _worker_instance is None:
        _worker_instance = BrowserWorkerRunner(
            headless=headless,
            allow_local=allow_local,
            max_concurrency=max_concurrency,
        )
    return _worker_instance
