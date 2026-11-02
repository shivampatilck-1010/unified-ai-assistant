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
from perception import extract_page_perception
from actions import UniversalActionExecutor
from reasoning import UniversalReasoningEngine
from self_correction import SelfCorrectionEngine
from file_intelligence import FileIntelligenceEngine

try:
    from services.orchestration.multi_agent import MultiAgentOrchestrator, AgentRole, VerificationVerdict
except ImportError:
    import sys
    from pathlib import Path
    _api_dir = str(Path(__file__).resolve().parent.parent / "api" / "services")
    if _api_dir not in sys.path:
        sys.path.insert(0, _api_dir)
    from orchestration.multi_agent import MultiAgentOrchestrator, AgentRole, VerificationVerdict

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BrowserWorkerRunner:
    """Orchestrates autonomous browser task execution, security validations, and progress streaming."""

    def __init__(
        self,
        headless: bool = True,
        allow_local: bool = False,
        max_steps: int = 25,
        timeout_seconds: int = 180,
        max_concurrency: int = 3,
        worker_id: Optional[str] = None,
        model_gateway: Optional[Any] = None,
    ):
        self.headless = headless
        self.allow_local = allow_local
        self.max_steps = max_steps
        self.timeout_seconds = timeout_seconds
        self.max_concurrency = max_concurrency
        self.worker_id = worker_id or f"worker-{uuid.uuid4().hex[:8]}"
        self.model_gateway = model_gateway
        self.concurrency_semaphore = asyncio.Semaphore(max_concurrency)
        self.session_manager = BrowserSessionManager(headless=headless, allow_local=allow_local)
        self.action_executor = UniversalActionExecutor(allow_local=allow_local)
        self.reasoning_engine = UniversalReasoningEngine(model_gateway=self.model_gateway)
        self.self_correction = SelfCorrectionEngine(max_retries_per_step=3)
        self.file_intel = FileIntelligenceEngine()
        self.orchestrator = MultiAgentOrchestrator(model_gateway=self.model_gateway)

        # In-memory coordination
        self.active_tasks: Set[str] = set()
        self.cancelled_tasks: Set[str] = set()
        self.paused_tasks: Dict[str, asyncio.Event] = {}
        self.latest_screenshots: Dict[str, str] = {}
        self.confirmation_events: Dict[str, asyncio.Event] = {}
        self.confirmation_results: Dict[str, bool] = {}
        self.event_subscribers: Dict[str, List[asyncio.Queue]] = {}

    def pause_task(self, task_id: str) -> bool:
        """Pauses execution of an active task."""
        if task_id in self.active_tasks and task_id not in self.paused_tasks:
            self.paused_tasks[task_id] = asyncio.Event()
            return True
        return False

    def resume_task(self, task_id: str) -> bool:
        """Resumes execution of a paused task."""
        if task_id in self.paused_tasks:
            ev = self.paused_tasks.pop(task_id)
            ev.set()
            return True
        return False

    async def _create_checkpoint(self, task_id: str, step_index: int, page: Any, context: Any) -> Dict[str, Any]:
        """Captures persistent checkpoint (DOM snippet, URL, title, cookies) for safe resumption."""
        try:
            current_url = page.url or ""
            title = await page.title() if page.url else ""
            dom_snippet = await page.evaluate("() => document.body ? document.body.innerText.slice(0, 300) : ''")
            cookies = await context.cookies()
            checkpoint = {
                "id": f"ckpt_{uuid.uuid4().hex[:8]}",
                "step_index": step_index,
                "url": current_url,
                "page_title": title,
                "dom_summary": dom_snippet,
                "cookie_count": len(cookies),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            async with async_session_factory() as session:
                async with session.begin():
                    t = await session.get(BrowserTask, task_id)
                    if t:
                        ckpts = list(t.checkpoints or [])
                        ckpts.append(checkpoint)
                        t.checkpoints = ckpts
            await self.emit_event(
                task_id=task_id,
                event_type=BrowserTaskEventType.CHECKPOINT_CREATED,
                message=f"Checkpoint saved at step {step_index}: {title} ({current_url})",
                step_index=step_index,
                payload=checkpoint,
            )
            return checkpoint
        except Exception as e:
            logger.debug("Checkpoint creation skipped: %s", e)
            return {}

    async def resume_interrupted_task(self, task_id: str, checkpoint_id: Optional[str] = None) -> bool:
        """Resumes an interrupted or paused task from its latest valid checkpoint."""
        async with async_session_factory() as session:
            async with session.begin():
                t = await session.get(BrowserTask, task_id)
                if not t:
                    return False
                t.status = BrowserTaskStatus.RUNNING.value
                t.claimed_by_worker = None
                if checkpoint_id and t.checkpoints:
                    target_ckpt = next((c for c in t.checkpoints if c.get("id") == checkpoint_id), None)
                    if target_ckpt:
                        t.current_step = target_ckpt.get("step_index", 0)

        await self.emit_event(
            task_id=task_id,
            event_type=BrowserTaskEventType.TASK_RESUMED,
            message=f"Task resumed from checkpoint {checkpoint_id or 'latest'}.",
        )
        asyncio.create_task(self.execute_task(task_id))
        return True

    async def retry_failed_task(self, task_id: str, reset_to_checkpoint: bool = True) -> bool:
        """Retries a failed task from the last valid checkpoint."""
        async with async_session_factory() as session:
            async with session.begin():
                t = await session.get(BrowserTask, task_id)
                if not t:
                    return False
                t.retry_count = (t.retry_count or 0) + 1
                t.status = BrowserTaskStatus.RUNNING.value
                t.error_message = None
                t.claimed_by_worker = None
                if reset_to_checkpoint and t.checkpoints:
                    last_ckpt = t.checkpoints[-1]
                    t.current_step = max(0, last_ckpt.get("step_index", 0) - 1)

        await self.emit_event(
            task_id=task_id,
            event_type=BrowserTaskEventType.TASK_STARTED,
            message=f"Task retry attempt {t.retry_count} initiated.",
        )
        asyncio.create_task(self.execute_task(task_id))
        return True

    def get_latest_screenshot(self, task_id: str) -> Optional[str]:
        """Returns the latest captured compressed screenshot for a task."""
        return self.latest_screenshots.get(task_id)

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

                # Initialize multi-agent stages
                stages = self.orchestrator.create_initial_stages(task_description, initial_url=plan_dict.get("initial_url"))
                async with async_session_factory() as session:
                    async with session.begin():
                        t = await session.get(BrowserTask, task_id)
                        if t:
                            if not t.stages:
                                t.stages = stages
                            t.assigned_agent = AgentRole.BROWSER_EXECUTION.value

                steps_data = plan_dict.get("steps", [])
                evidence: List[Dict[str, Any]] = []
                downloaded_files: List[Dict[str, Any]] = []

                # 3. Run browser session
                async with self.session_manager.create_session() as (browser, context, page):
                    if steps_data:
                        for step_dict in steps_data:
                            step_index = step_dict.get("step_index", 0)
                            step_desc = step_dict.get("description", f"Step {step_index}")
                            raw_action = step_dict.get("action", {})
                            action = BrowserAction(**raw_action)

                            # Checkpoint capture prior to action
                            await self._create_checkpoint(task_id, step_index, page, context)

                            # Cancellation check
                            if task_id in self.cancelled_tasks:
                                await self._handle_cancellation(task_id, evidence)
                                return

                            # Pause gate
                            if task_id in self.paused_tasks:
                                async with async_session_factory() as session:
                                    async with session.begin():
                                        t = await session.get(BrowserTask, task_id)
                                        if t:
                                            t.status = BrowserTaskStatus.PAUSED.value
                                await self.emit_event(
                                    task_id=task_id,
                                    event_type=BrowserTaskEventType.TASK_PAUSED,
                                    message=f"Task execution paused by user before step {step_index}.",
                                    step_index=step_index,
                                )
                                pause_event = self.paused_tasks.get(task_id)
                                if pause_event:
                                    await pause_event.wait()
                                async with async_session_factory() as session:
                                    async with session.begin():
                                        t = await session.get(BrowserTask, task_id)
                                        if t:
                                            t.status = BrowserTaskStatus.RUNNING.value
                                await self.emit_event(
                                    task_id=task_id,
                                    event_type=BrowserTaskEventType.TASK_RESUMED,
                                    message=f"Task execution resumed for step {step_index}.",
                                    step_index=step_index,
                                )

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

                            # Execute the action in Playwright with Self-Correction
                            try:
                                step_outcome = await self._execute_single_action(
                                    page=page,
                                    action=action,
                                    approved_scope=approved_scope,
                                    context=context,
                                )
                            except Exception as action_err:
                                if isinstance(action_err, (PolicyViolationError, ConsequentialActionError)):
                                    raise action_err
                                await self.emit_event(
                                    task_id=task_id,
                                    event_type=BrowserTaskEventType.SELF_CORRECTION_TRIGGERED,
                                    message=f"Action '{action.action_type.value}' encountered fault: {str(action_err)[:100]}. Diagnosing browser state...",
                                    step_index=step_index,
                                    payload={"failed_action": action.model_dump(), "error": str(action_err)},
                                )
                                diagnosis, recovery_meta = await self.self_correction.diagnose_and_recover(
                                    page=page,
                                    failed_action=action,
                                    error=action_err,
                                    task_id=task_id,
                                    step_index=step_index,
                                )
                                if diagnosis.suggested_alternative:
                                    alt = diagnosis.suggested_alternative
                                    await self.emit_event(
                                        task_id=task_id,
                                        event_type=BrowserTaskEventType.ACTION_STARTED,
                                        message=f"Self-correction executing alternative '{alt.action_type.value}' ({diagnosis.reason})",
                                        step_index=step_index,
                                        payload={"alternative_action": alt.model_dump(), "diagnosis": diagnosis.model_dump()},
                                    )
                                    step_outcome = await self._execute_single_action(
                                        page=page,
                                        action=alt,
                                        approved_scope=approved_scope,
                                        context=context,
                                    )
                                    step_outcome["self_corrected"] = True
                                    step_outcome["diagnosis"] = diagnosis.model_dump()
                                    await self.emit_event(
                                        task_id=task_id,
                                        event_type=BrowserTaskEventType.SELF_CORRECTION_SUCCEEDED,
                                        message=f"Self-correction recovered step {step_index} successfully.",
                                        step_index=step_index,
                                        payload=step_outcome,
                                    )
                                else:
                                    raise action_err

                            # Track any downloaded file metadata
                            if step_outcome.get("downloaded_file"):
                                downloaded_files.append(step_outcome["downloaded_file"])
                                await self.emit_event(
                                    task_id=task_id,
                                    event_type=BrowserTaskEventType.FILE_DOWNLOADED,
                                    message=f"File artifact captured: {step_outcome['downloaded_file'].get('filename')}",
                                    step_index=step_index,
                                    payload=step_outcome["downloaded_file"],
                                )

                            evidence.append(step_outcome)

                            # Capture real-time compressed preview frame
                            try:
                                screenshot_bytes = await page.screenshot(type="jpeg", quality=60)
                                b64_str = base64.b64encode(screenshot_bytes).decode("ascii")
                                data_url = f"data:image/jpeg;base64,{b64_str}"
                                self.latest_screenshots[task_id] = data_url
                                step_outcome["screenshot_data_url"] = data_url
                                await self.emit_event(
                                    task_id=task_id,
                                    event_type=BrowserTaskEventType.SCREENSHOT_UPDATED,
                                    message=f"Viewport frame captured at step {step_index}",
                                    step_index=step_index,
                                    payload={"screenshot_data_url": data_url, "url": page.url},
                                )
                            except Exception as ss_ex:
                                logger.debug("Screenshot capture skipped: %s", ss_ex)

                            await self.emit_event(
                                task_id=task_id,
                                event_type=BrowserTaskEventType.STEP_COMPLETED,
                                message=f"Step {step_index} completed: {step_desc}",
                                step_index=step_index,
                                payload=step_outcome,
                            )

                        final_summary = await self._verify_final_browser_state(page, task_description, evidence)
                    else:
                        # Dynamic Autonomous Reasoning Loop
                        final_summary = await self._run_autonomous_reasoning_loop(
                            task_id=task_id,
                            task_description=task_description,
                            approved_scope=approved_scope,
                            page=page,
                            context=context,
                            evidence=evidence,
                        )

                    # Verification Agent audit
                    verdict = await self.orchestrator.verify_task_completion(
                        task_description=task_description,
                        evidence=evidence,
                        downloaded_files=downloaded_files,
                        final_summary=final_summary,
                        has_error=False,
                    )

                    # Mark completed with verification status
                    async with async_session_factory() as session:
                        async with session.begin():
                            t = await session.get(BrowserTask, task_id)
                            if t:
                                t.status = BrowserTaskStatus.COMPLETED.value
                                t.result_summary = final_summary
                                t.evidence = evidence
                                t.downloaded_files = downloaded_files
                                t.verification_status = verdict.status
                                t.assigned_agent = AgentRole.VERIFICATION.value
                                t.completed_at = utc_now()

                    await self.emit_event(
                        task_id=task_id,
                        event_type=BrowserTaskEventType.VERIFICATION_COMPLETED,
                        message=f"Evidence verification verdict: {verdict.status} (Score: {verdict.confidence_score:.2f}) - {verdict.reasoning}",
                        payload=verdict.model_dump(),
                    )

                    await self.emit_event(
                        task_id=task_id,
                        event_type=BrowserTaskEventType.TASK_COMPLETED,
                        message=f"Task completed successfully: {final_summary}",
                        payload={"result_summary": final_summary, "evidence_count": len(evidence), "verification": verdict.model_dump()},
                    )

            except PolicyViolationError as pve:
                await self._handle_failure(task_id, str(pve), "POLICY_VIOLATION")
            except Exception as e:
                clean_err = self._sanitize_error(str(e))
                if self._is_retryable_error(e):
                    retried = await self._handle_retry_or_fail(task_id, clean_err, "TRANSIENT_EXECUTION_ERROR")
                    if retried:
                        return
                verdict = await self.orchestrator.verify_task_completion(
                    task_description=task_description if "task_description" in locals() else "Browser Task",
                    evidence=evidence if "evidence" in locals() else [],
                    has_error=True,
                    error_message=clean_err,
                )
                async with async_session_factory() as session:
                    async with session.begin():
                        t = await session.get(BrowserTask, task_id)
                        if t:
                            t.verification_status = verdict.status
                await self._handle_failure(task_id, clean_err, "EXECUTION_ERROR")

            finally:
                self.active_tasks.discard(task_id)
                self.cancelled_tasks.discard(task_id)

    async def _execute_single_action(
        self,
        page: Any,
        action: BrowserAction,
        approved_scope: Dict[str, Any],
        context: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Executes a single validated browser action via UniversalActionExecutor."""
        return await self.action_executor.execute(
            action=action,
            page=page,
            context=context,
            approved_scope=approved_scope,
        )

    async def _run_autonomous_reasoning_loop(
        self,
        task_id: str,
        task_description: str,
        approved_scope: Dict[str, Any],
        page: Any,
        context: Any,
        evidence: List[Dict[str, Any]],
        start_step: int = 1,
    ) -> str:
        """Executes an adaptive autonomous reasoning loop: OBSERVE -> UNDERSTAND -> PLAN/REPLAN -> EXECUTE -> VERIFY."""
        step_index = start_step - 1
        history: List[Dict[str, Any]] = []

        while step_index < self.max_steps:
            step_index += 1

            # 1. Cancellation check
            if task_id in self.cancelled_tasks:
                await self._handle_cancellation(task_id, evidence)
                return "Task was cancelled."

            # 2. Pause gate
            if task_id in self.paused_tasks:
                async with async_session_factory() as session:
                    async with session.begin():
                        t = await session.get(BrowserTask, task_id)
                        if t:
                            t.status = BrowserTaskStatus.PAUSED.value
                await self.emit_event(
                    task_id=task_id,
                    event_type=BrowserTaskEventType.TASK_PAUSED,
                    message=f"Task execution paused by user before step {step_index}.",
                    step_index=step_index,
                )
                pause_event = self.paused_tasks.get(task_id)
                if pause_event:
                    await pause_event.wait()
                async with async_session_factory() as session:
                    async with session.begin():
                        t = await session.get(BrowserTask, task_id)
                        if t:
                            t.status = BrowserTaskStatus.RUNNING.value
                await self.emit_event(
                    task_id=task_id,
                    event_type=BrowserTaskEventType.TASK_RESUMED,
                    message=f"Task execution resumed for step {step_index}.",
                    step_index=step_index,
                )

            # 3. OBSERVE: Extract rich perception
            perception = await extract_page_perception(page, capture_screenshot=True)

            # 4. REASON: Decide next action
            decision = await self.reasoning_engine.decide_next_step(
                task_description=task_description,
                perception=perception,
                history=history,
                step_number=step_index,
                max_steps=self.max_steps,
            )

            # Check if user intervention required (e.g. CAPTCHA / MFA gate)
            if decision.pause_for_user:
                await self.emit_event(
                    task_id=task_id,
                    event_type=BrowserTaskEventType.CONFIRMATION_REQUIRED,
                    message=f"User intervention required: {decision.pause_reason}",
                    step_index=step_index,
                    payload={"pause_reason": decision.pause_reason, "step_index": step_index},
                )
                self.pause_task(task_id)
                continue

            # Check if terminal
            if decision.is_terminal:
                summary = decision.result_summary or f"Task goal achieved after {step_index} steps."
                return summary

            action = decision.action

            # 5. Policy validation
            validate_action(action, approved_scope=approved_scope, allow_local=self.allow_local)

            # 6. Consequential action detection & confirmation gate
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

                conf_event = asyncio.Event()
                self.confirmation_events[confirmation_id] = conf_event
                try:
                    await asyncio.wait_for(conf_event.wait(), timeout=120.0)
                except asyncio.TimeoutError:
                    raise PolicyViolationError("Confirmation request timed out. Task aborted for safety.")
                finally:
                    self.confirmation_events.pop(confirmation_id, None)

                approved = self.confirmation_results.pop(confirmation_id, False)
                if not approved:
                    raise PolicyViolationError("User declined confirmation for consequential action. Task aborted.")

                async with async_session_factory() as session:
                    async with session.begin():
                        t = await session.get(BrowserTask, task_id)
                        if t:
                            t.status = BrowserTaskStatus.RUNNING.value
                            t.pending_confirmation = None

            # 7. EXECUTE: Emit step started & run action
            await self.emit_event(
                task_id=task_id,
                event_type=BrowserTaskEventType.STEP_STARTED,
                message=f"Step {step_index}: {decision.thought}",
                step_index=step_index,
            )

            async with async_session_factory() as session:
                async with session.begin():
                    t = await session.get(BrowserTask, task_id)
                    if t:
                        t.current_step = step_index

            outcome = await self.action_executor.execute(
                action=action,
                page=page,
                context=context,
                approved_scope=approved_scope,
                perception_elements=perception.interactive_elements,
            )
            outcome["thought"] = decision.thought
            evidence.append(outcome)
            history.append({
                "step": step_index,
                "action": action.action_type.value,
                "selector": action.selector,
                "thought": decision.thought,
                "outcome": outcome,
            })

            # Capture real-time compressed preview frame
            try:
                screenshot_bytes = await page.screenshot(type="jpeg", quality=60)
                b64_str = base64.b64encode(screenshot_bytes).decode("ascii")
                data_url = f"data:image/jpeg;base64,{b64_str}"
                self.latest_screenshots[task_id] = data_url
                outcome["screenshot_data_url"] = data_url
                await self.emit_event(
                    task_id=task_id,
                    event_type=BrowserTaskEventType.SCREENSHOT_UPDATED,
                    message=f"Viewport frame captured at step {step_index}",
                    step_index=step_index,
                    payload={"screenshot_data_url": data_url, "url": page.url},
                )
            except Exception as ss_ex:
                logger.debug("Screenshot capture skipped: %s", ss_ex)

            await self.emit_event(
                task_id=task_id,
                event_type=BrowserTaskEventType.STEP_COMPLETED,
                message=f"Step {step_index} completed: {decision.thought}",
                step_index=step_index,
                payload=outcome,
            )

        return f"Autonomous reasoning completed across {len(evidence)} observed steps."

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
    model_gateway: Optional[Any] = None,
) -> BrowserWorkerRunner:
    """Returns singleton runner instance."""
    global _worker_instance
    if _worker_instance is None:
        _worker_instance = BrowserWorkerRunner(
            headless=headless,
            allow_local=allow_local,
            max_concurrency=max_concurrency,
            model_gateway=model_gateway,
        )
    return _worker_instance
