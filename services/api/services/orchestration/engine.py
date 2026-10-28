import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, status
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import async_session_factory
from models.workflow import Workflow, WorkflowEvent, WorkflowStep
from schemas.orchestration import (
    CONSEQUENTIAL_CAPABILITIES,
    CapabilityType,
    WorkflowPlan,
    WorkflowStatus,
    WorkflowStepCreate,
    WorkflowStepStatus,
)
from services.orchestration.dispatcher import CapabilityDispatcher
from services.orchestration.planner import OrchestrationPlanner

logger = logging.getLogger("orchestration_engine")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# In-memory pub/sub listener queues for real-time SSE streaming
_workflow_subscribers: Dict[str, Set[asyncio.Queue]] = {}


def _broadcast_event(workflow_id: str, event_data: Dict[str, Any]) -> None:
    """Delivers an event to all active SSE subscribers for this workflow."""
    queues = _workflow_subscribers.get(workflow_id, set())
    for q in list(queues):
        try:
            q.put_nowait(event_data)
        except Exception:
            pass


class OrchestrationEngine:
    """Durable state machine, dependency DAG coordinator, and execution supervisor."""

    # --------------------------------------------------------------------------
    # Lifecycle Management
    # --------------------------------------------------------------------------

    @classmethod
    async def create_workflow(
        cls,
        db: AsyncSession,
        owner_id: str,
        prompt: str,
        file_ids: Optional[List[str]] = None,
        conversation_id: Optional[str] = None,
    ) -> Workflow:
        """
        Interprets user prompt, produces a structured plan or clarification request,
        and persists the initial workflow and steps.
        """
        clean_prompt = prompt.strip()
        if not clean_prompt:
            raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

        plan, clarification, title = await OrchestrationPlanner.generate_plan(
            prompt=clean_prompt,
            file_ids=file_ids,
        )

        workflow_id = str(uuid.uuid4())
        initial_status = WorkflowStatus.WAITING_FOR_INPUT.value if clarification else WorkflowStatus.AWAITING_APPROVAL.value

        workflow = Workflow(
            id=workflow_id,
            owner_id=owner_id,
            conversation_id=conversation_id,
            title=title,
            request_prompt=clean_prompt,
            status=initial_status,
            plan_version=1,
            plan=plan.model_dump() if plan else None,
            clarification_question=clarification,
            context_data={"file_ids": file_ids or []},
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(workflow)

        # Initial workflow creation event
        create_evt = WorkflowEvent(
            id=str(uuid.uuid4()),
            workflow_id=workflow_id,
            event_type="workflow_created",
            message=f"Workflow initialized with status: {initial_status}.",
            payload={"status": initial_status, "title": title},
            created_at=utc_now(),
        )
        db.add(create_evt)

        # If clarification is required, record event and halt until user answers
        if clarification:
            clarify_evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow_id,
                event_type="clarification_requested",
                message=clarification,
                payload={"question": clarification},
                created_at=utc_now(),
            )
            db.add(clarify_evt)
            await db.commit()
            return await cls.get_workflow(db, owner_id, workflow_id)

        # If a valid plan was generated, persist individual steps
        has_consequential_steps = False
        if plan and plan.steps:
            for step_data in plan.steps:
                if step_data.is_consequential:
                    has_consequential_steps = True

                step_rec = WorkflowStep(
                    id=str(uuid.uuid4()),
                    workflow_id=workflow_id,
                    step_number=step_data.step_number,
                    title=step_data.title,
                    capability=step_data.capability.value,
                    parameters=step_data.parameters,
                    depends_on=step_data.depends_on,
                    is_consequential=step_data.is_consequential,
                    consequential_reason=step_data.consequential_reason,
                    requires_confirmation=step_data.is_consequential,
                    status=WorkflowStepStatus.PENDING.value,
                )
                workflow.steps.append(step_rec)
                db.add(step_rec)

            plan_evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow_id,
                event_type="plan_generated",
                message=f"Generated execution plan with {len(plan.steps)} steps (consequential: {has_consequential_steps}).",
                payload={"steps_count": len(plan.steps), "has_consequential": has_consequential_steps},
                created_at=utc_now(),
            )
            db.add(plan_evt)

        # If there are no consequential steps, we can transition to RUNNING immediately
        if not has_consequential_steps and plan and plan.steps:
            workflow.status = WorkflowStatus.RUNNING.value
            auto_evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow_id,
                event_type="plan_auto_approved",
                message="Plan contains only safe read operations; starting execution automatically.",
                created_at=utc_now(),
            )
            db.add(auto_evt)

        await db.commit()
        refreshed_wf = await cls.get_workflow(db, owner_id, workflow_id)

        # If automatically started, launch execution in background task
        if refreshed_wf and refreshed_wf.status == WorkflowStatus.RUNNING.value:
            asyncio.create_task(cls.run_workflow(workflow_id))

        return refreshed_wf

    @classmethod
    async def approve_plan(
        cls,
        db: AsyncSession,
        owner_id: str,
        workflow_id: str,
        plan_version: int,
    ) -> Workflow:
        """Approves the workflow plan version and transitions to RUNNING."""
        workflow = await cls.get_workflow(db, owner_id, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found.")

        if workflow.status != WorkflowStatus.AWAITING_APPROVAL.value:
            raise HTTPException(
                status_code=400,
                detail=f"Workflow is not awaiting approval (current status: {workflow.status}).",
            )

        if workflow.plan_version != plan_version:
            raise HTTPException(
                status_code=409,
                detail=f"Plan version mismatch (expected {workflow.plan_version}, got {plan_version}).",
            )

        workflow.status = WorkflowStatus.RUNNING.value
        workflow.updated_at = utc_now()

        approve_evt = WorkflowEvent(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id,
            event_type="plan_approved",
            message=f"Plan version {plan_version} approved by user.",
            payload={"plan_version": plan_version},
            created_at=utc_now(),
        )
        db.add(approve_evt)
        await db.commit()
        refreshed_wf = await cls.get_workflow(db, owner_id, workflow.id)

        _broadcast_event(workflow_id, {"type": "plan_approved", "plan_version": plan_version})

        # Launch execution in background task
        asyncio.create_task(cls.run_workflow(workflow.id))
        return refreshed_wf

    @classmethod
    async def submit_clarification(
        cls,
        db: AsyncSession,
        owner_id: str,
        workflow_id: str,
        clarification_response: str,
    ) -> Workflow:
        """Receives user clarification, refines the plan, and transitions out of WAITING_FOR_INPUT."""
        workflow = await cls.get_workflow(db, owner_id, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found.")

        if workflow.status != WorkflowStatus.WAITING_FOR_INPUT.value:
            raise HTTPException(
                status_code=400,
                detail=f"Workflow is not waiting for input (current status: {workflow.status}).",
            )

        clean_resp = clarification_response.strip()
        if not clean_resp:
            raise HTTPException(status_code=400, detail="Clarification response cannot be empty.")

        workflow.clarification_response = clean_resp
        combined_prompt = f"{workflow.request_prompt}\nUser clarification: {clean_resp}"

        # Generate refined plan with clarified context
        file_ids = (workflow.context_data or {}).get("file_ids", [])
        plan, clarification, _ = await OrchestrationPlanner.generate_plan(
            prompt=combined_prompt,
            file_ids=file_ids,
        )

        workflow.plan_version += 1
        workflow.updated_at = utc_now()

        if clarification:
            workflow.clarification_question = clarification
            evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow.id,
                event_type="clarification_requested",
                message=clarification,
                payload={"question": clarification},
                created_at=utc_now(),
            )
            db.add(evt)
        else:
            workflow.clarification_question = None
            workflow.plan = plan.model_dump() if plan else None

            # Clear prior draft steps if any
            workflow.steps.clear()

            has_consequential = False
            if plan and plan.steps:
                for step_data in plan.steps:
                    if step_data.is_consequential:
                        has_consequential = True
                    step_rec = WorkflowStep(
                        id=str(uuid.uuid4()),
                        workflow_id=workflow.id,
                        step_number=step_data.step_number,
                        title=step_data.title,
                        capability=step_data.capability.value,
                        parameters=step_data.parameters,
                        depends_on=step_data.depends_on,
                        is_consequential=step_data.is_consequential,
                        consequential_reason=step_data.consequential_reason,
                        requires_confirmation=step_data.is_consequential,
                        status=WorkflowStepStatus.PENDING.value,
                    )
                    workflow.steps.append(step_rec)
                    db.add(step_rec)

            if has_consequential:
                workflow.status = WorkflowStatus.AWAITING_APPROVAL.value
            else:
                workflow.status = WorkflowStatus.RUNNING.value

            plan_evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow.id,
                event_type="plan_updated",
                message=f"Plan regenerated (version {workflow.plan_version}) following clarification.",
                payload={"plan_version": workflow.plan_version, "steps_count": len(plan.steps) if plan else 0},
                created_at=utc_now(),
            )
            db.add(plan_evt)

        await db.commit()
        refreshed_wf = await cls.get_workflow(db, owner_id, workflow.id)

        _broadcast_event(workflow_id, {"type": "plan_updated", "status": refreshed_wf.status if refreshed_wf else "running"})

        if refreshed_wf and refreshed_wf.status == WorkflowStatus.RUNNING.value:
            asyncio.create_task(cls.run_workflow(workflow.id))

        return refreshed_wf

    @classmethod
    async def confirm_step(
        cls,
        db: AsyncSession,
        owner_id: str,
        workflow_id: str,
        step_number: int,
        approved: bool,
    ) -> Workflow:
        """Confirms or rejects a consequential action paused at WAITING_FOR_CONFIRMATION."""
        workflow = await cls.get_workflow(db, owner_id, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found.")

        if workflow.status != WorkflowStatus.WAITING_FOR_CONFIRMATION.value:
            raise HTTPException(
                status_code=400,
                detail=f"Workflow is not waiting for confirmation (status: {workflow.status}).",
            )

        # Locate the paused step
        target_step: Optional[WorkflowStep] = None
        for s in workflow.steps:
            if s.step_number == step_number:
                target_step = s
                break

        if not target_step:
            raise HTTPException(status_code=404, detail=f"Step {step_number} not found in workflow.")

        if approved:
            target_step.confirmed_by_user = True
            target_step.status = WorkflowStepStatus.READY.value
            workflow.pending_confirmation = None
            workflow.status = WorkflowStatus.RUNNING.value
            workflow.updated_at = utc_now()

            evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow.id,
                step_id=target_step.id,
                event_type="step_confirmed",
                message=f"Step {step_number} ('{target_step.title}') confirmed by user.",
                payload={"step_number": step_number, "approved": True},
                created_at=utc_now(),
            )
            db.add(evt)
            await db.commit()
            refreshed_wf = await cls.get_workflow(db, owner_id, workflow.id)

            _broadcast_event(workflow_id, {"type": "step_confirmed", "step_number": step_number})
            asyncio.create_task(cls.run_workflow(workflow.id))
            return refreshed_wf
        else:
            target_step.confirmed_by_user = False
            target_step.status = WorkflowStepStatus.CANCELLED.value
            workflow.pending_confirmation = None
            workflow.status = WorkflowStatus.RUNNING.value
            workflow.updated_at = utc_now()

            evt = WorkflowEvent(
                id=str(uuid.uuid4()),
                workflow_id=workflow.id,
                step_id=target_step.id,
                event_type="step_rejected",
                message=f"Step {step_number} ('{target_step.title}') rejected by user.",
                payload={"step_number": step_number, "approved": False},
                created_at=utc_now(),
            )
            db.add(evt)
            await db.commit()
            refreshed_wf = await cls.get_workflow(db, owner_id, workflow.id)

            _broadcast_event(workflow_id, {"type": "step_rejected", "step_number": step_number})
            asyncio.create_task(cls.run_workflow(workflow.id))
            return refreshed_wf

    @classmethod
    async def cancel_workflow(
        cls,
        db: AsyncSession,
        owner_id: str,
        workflow_id: str,
        reason: Optional[str] = None,
    ) -> Workflow:
        """Cancels a workflow and all non-completed steps."""
        workflow = await cls.get_workflow(db, owner_id, workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found.")

        terminal_statuses = {
            WorkflowStatus.COMPLETED.value,
            WorkflowStatus.FAILED.value,
            WorkflowStatus.CANCELLED.value,
        }
        if workflow.status in terminal_statuses:
            return workflow

        workflow.status = WorkflowStatus.CANCELLED.value
        workflow.error_message = reason or "Workflow cancelled by user."
        workflow.updated_at = utc_now()
        workflow.completed_at = utc_now()

        for s in workflow.steps:
            if s.status in (WorkflowStepStatus.PENDING.value, WorkflowStepStatus.READY.value, WorkflowStepStatus.WAITING_FOR_CONFIRMATION.value):
                s.status = WorkflowStepStatus.CANCELLED.value

        cancel_evt = WorkflowEvent(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id,
            event_type="workflow_cancelled",
            message=reason or "Workflow cancelled by user.",
            payload={"reason": reason},
            created_at=utc_now(),
        )
        db.add(cancel_evt)
        await db.commit()
        refreshed_wf = await cls.get_workflow(db, owner_id, workflow.id)

        _broadcast_event(workflow_id, {"type": "workflow_cancelled", "reason": reason})
        return refreshed_wf

    # --------------------------------------------------------------------------
    # Queries
    # --------------------------------------------------------------------------

    @classmethod
    async def get_workflow(
        cls,
        db: AsyncSession,
        owner_id: str,
        workflow_id: str,
    ) -> Optional[Workflow]:
        stmt = (
            select(Workflow)
            .where(Workflow.id == workflow_id, Workflow.owner_id == owner_id)
            .options(selectinload(Workflow.steps), selectinload(Workflow.events))
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @classmethod
    async def list_workflows(
        cls,
        db: AsyncSession,
        owner_id: str,
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Workflow], int]:
        base_stmt = select(Workflow).where(Workflow.owner_id == owner_id)
        if status:
            base_stmt = base_stmt.where(Workflow.status == status)

        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        total_count = (await db.execute(count_stmt)).scalar() or 0

        list_stmt = (
            base_stmt.order_by(desc(Workflow.created_at))
            .limit(limit)
            .offset(offset)
            .options(selectinload(Workflow.steps), selectinload(Workflow.events))
        )
        workflows = (await db.execute(list_stmt)).scalars().all()
        return list(workflows), total_count

    # --------------------------------------------------------------------------
    # State Machine & DAG Execution Loop
    # --------------------------------------------------------------------------

    @classmethod
    async def run_workflow(cls, workflow_id: str, worker_id: Optional[str] = None) -> None:
        """
        Durable workflow execution loop. Coordinates dependencies, evaluates consequential
        gates, executes independent steps concurrently, and records provenance.
        """
        assigned_worker = worker_id or f"worker_{uuid.uuid4().hex[:8]}"

        # Step-execution blackboard context: {step_number: result_dict}
        context: Dict[int, Any] = {}

        while True:
            async with async_session_factory() as db:
                workflow = await db.get(Workflow, workflow_id)
                if not workflow:
                    logger.warning("Workflow %s not found during execution cycle", workflow_id)
                    return

                # Stop if in a paused or terminal state
                if workflow.status not in (WorkflowStatus.RUNNING.value, WorkflowStatus.AWAITING_APPROVAL.value):
                    logger.info("Workflow %s loop exited with status: %s", workflow_id, workflow.status)
                    return

                # Atomic lease acquisition
                workflow.status = WorkflowStatus.RUNNING.value
                workflow.claimed_by_worker = assigned_worker
                workflow.updated_at = utc_now()
                await db.commit()

                # Load steps
                stmt = select(WorkflowStep).where(WorkflowStep.workflow_id == workflow_id).order_by(WorkflowStep.step_number)
                steps: List[WorkflowStep] = (await db.execute(stmt)).scalars().all()

                # Hydrate blackboard context with outputs of already completed steps
                for s in steps:
                    if s.status == WorkflowStepStatus.COMPLETED.value and s.output_data is not None:
                        context[s.step_number] = {
                            "success": True,
                            "data": s.output_data,
                            "summary": s.output_data.get("summary") if isinstance(s.output_data, dict) else str(s.output_data),
                            "citations": s.citations or [],
                            "is_simulated": s.is_simulated,
                        }

                completed_step_nums = {s.step_number for s in steps if s.status == WorkflowStepStatus.COMPLETED.value}
                terminal_step_nums = {
                    s.step_number
                    for s in steps
                    if s.status in (WorkflowStepStatus.COMPLETED.value, WorkflowStepStatus.SKIPPED.value, WorkflowStepStatus.CANCELLED.value)
                }

                # Check if all steps are finished
                if len(terminal_step_nums) == len(steps):
                    await cls._finalize_workflow(db, workflow, steps, context)
                    return

                # Find eligible pending steps (all depends_on are satisfied)
                eligible_steps: List[WorkflowStep] = []
                for s in steps:
                    if s.status in (WorkflowStepStatus.PENDING.value, WorkflowStepStatus.READY.value):
                        deps = s.depends_on or []
                        # Check if all dependencies are satisfied
                        if all(dep in completed_step_nums for dep in deps):
                            eligible_steps.append(s)
                        # If a dependency failed or was cancelled, skip this dependent step
                        elif any(
                            dep_step.step_number in deps and dep_step.status in (WorkflowStepStatus.FAILED.value, WorkflowStepStatus.CANCELLED.value)
                            for dep_step in steps
                        ):
                            s.status = WorkflowStepStatus.SKIPPED.value
                            evt = WorkflowEvent(
                                id=str(uuid.uuid4()),
                                workflow_id=workflow.id,
                                step_id=s.id,
                                event_type="step_skipped",
                                message=f"Step {s.step_number} skipped because preceding dependency failed or was cancelled.",
                                created_at=utc_now(),
                            )
                            db.add(evt)
                            await db.commit()

                if not eligible_steps:
                    # No steps can make progress. Check if any steps failed.
                    failed_steps = [s for s in steps if s.status == WorkflowStepStatus.FAILED.value]
                    if failed_steps:
                        workflow.status = WorkflowStatus.FAILED.value
                        workflow.error_message = f"{len(failed_steps)} step(s) failed."
                        workflow.completed_at = utc_now()
                        await db.commit()
                        _broadcast_event(workflow_id, {"type": "workflow_failed", "status": "failed"})
                        return
                    # Otherwise, nothing more to do
                    await cls._finalize_workflow(db, workflow, steps, context)
                    return

                # Check for consequential confirmation requirement
                paused_for_confirmation = False
                for s in eligible_steps:
                    if s.is_consequential and not s.confirmed_by_user:
                        # Consequential action gate: Pause execution!
                        s.status = WorkflowStepStatus.WAITING_FOR_CONFIRMATION.value
                        workflow.status = WorkflowStatus.WAITING_FOR_CONFIRMATION.value
                        workflow.pending_confirmation = {
                            "step_id": s.id,
                            "step_number": s.step_number,
                            "title": s.title,
                            "capability": s.capability,
                            "parameters": s.parameters,
                            "consequential_reason": s.consequential_reason,
                        }
                        evt = WorkflowEvent(
                            id=str(uuid.uuid4()),
                            workflow_id=workflow.id,
                            step_id=s.id,
                            event_type="confirmation_required",
                            message=f"Confirmation required before executing step {s.step_number}: '{s.title}' ({s.consequential_reason}).",
                            payload=workflow.pending_confirmation,
                            created_at=utc_now(),
                        )
                        db.add(evt)
                        await db.commit()

                        _broadcast_event(workflow_id, {
                            "type": "confirmation_required",
                            "step_number": s.step_number,
                            "confirmation": workflow.pending_confirmation,
                        })
                        paused_for_confirmation = True
                        break

                if paused_for_confirmation:
                    return

                # Separate safe steps ready to run concurrently
                ready_to_run = [s for s in eligible_steps if s.status in (WorkflowStepStatus.PENDING.value, WorkflowStepStatus.READY.value)]
                if not ready_to_run:
                    return

                # Mark ready steps as running
                for s in ready_to_run:
                    s.status = WorkflowStepStatus.RUNNING.value
                    s.started_at = utc_now()
                    start_evt = WorkflowEvent(
                        id=str(uuid.uuid4()),
                        workflow_id=workflow.id,
                        step_id=s.id,
                        event_type="step_started",
                        message=f"Starting step {s.step_number}: '{s.title}'.",
                        payload={"step_number": s.step_number, "capability": s.capability},
                        created_at=utc_now(),
                    )
                    db.add(start_evt)
                await db.commit()

                for s in ready_to_run:
                    _broadcast_event(workflow_id, {"type": "step_started", "step_number": s.step_number})

            # Execute eligible steps concurrently outside the shared DB session
            tasks = [
                cls._execute_single_step(
                    workflow_id=workflow_id,
                    step_id=step.id,
                    step_number=step.step_number,
                    title=step.title,
                    capability=step.capability,
                    parameters=step.parameters or {},
                    context=context,
                )
                for step in ready_to_run
            ]

            step_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Persist outcomes of this batch
            async with async_session_factory() as db:
                for idx, step_model in enumerate(ready_to_run):
                    res = step_results[idx]
                    step_rec = await db.get(WorkflowStep, step_model.id)
                    if not step_rec:
                        continue

                    if isinstance(res, Exception):
                        logger.error("Step %s execution raised unhandled exception: %s", step_model.step_number, res)
                        step_rec.status = WorkflowStepStatus.FAILED.value
                        step_rec.error_message = str(res)
                        step_rec.completed_at = utc_now()
                        fail_evt = WorkflowEvent(
                            id=str(uuid.uuid4()),
                            workflow_id=workflow_id,
                            step_id=step_rec.id,
                            event_type="step_failed",
                            message=f"Step {step_rec.step_number} failed: {str(res)}",
                            payload={"error": str(res)},
                            created_at=utc_now(),
                        )
                        db.add(fail_evt)
                    elif isinstance(res, dict) and not res.get("success"):
                        step_rec.status = WorkflowStepStatus.FAILED.value
                        step_rec.error_message = res.get("error", "Execution failed")
                        step_rec.completed_at = utc_now()
                        fail_evt = WorkflowEvent(
                            id=str(uuid.uuid4()),
                            workflow_id=workflow_id,
                            step_id=step_rec.id,
                            event_type="step_failed",
                            message=f"Step {step_rec.step_number} failed: {res.get('error')}",
                            payload={"error": res.get("error")},
                            created_at=utc_now(),
                        )
                        db.add(fail_evt)
                    else:
                        step_rec.status = WorkflowStepStatus.COMPLETED.value
                        step_rec.output_data = res.get("data")
                        step_rec.citations = res.get("citations", [])
                        step_rec.is_simulated = res.get("is_simulated", False)
                        step_rec.completed_at = utc_now()
                        context[step_rec.step_number] = res

                        comp_evt = WorkflowEvent(
                            id=str(uuid.uuid4()),
                            workflow_id=workflow_id,
                            step_id=step_rec.id,
                            event_type="step_completed",
                            message=f"Completed step {step_rec.step_number}: {res.get('summary', 'Success')}",
                            payload={"summary": res.get("summary"), "citations_count": len(res.get("citations", []))},
                            created_at=utc_now(),
                        )
                        db.add(comp_evt)

                    _broadcast_event(workflow_id, {
                        "type": "step_finished",
                        "step_number": step_rec.step_number,
                        "status": step_rec.status,
                        "error": step_rec.error_message,
                    })

                await db.commit()

    @classmethod
    async def _execute_single_step(
        cls,
        workflow_id: str,
        step_id: str,
        step_number: int,
        title: str,
        capability: str,
        parameters: Dict[str, Any],
        context: Dict[int, Any],
    ) -> Dict[str, Any]:
        """Runs a single step within an isolated database session."""
        async with async_session_factory() as step_db:
            workflow = await step_db.get(Workflow, workflow_id)
            owner_id = workflow.owner_id if workflow else "system"

            return await CapabilityDispatcher.dispatch(
                db=step_db,
                owner_id=owner_id,
                capability=capability,
                parameters=parameters,
                step_number=step_number,
                context=context,
            )

    @classmethod
    async def _finalize_workflow(
        cls,
        db: AsyncSession,
        workflow: Workflow,
        steps: List[WorkflowStep],
        context: Dict[int, Any],
    ) -> None:
        """Assembles final results, gathers citations, and transitions workflow to COMPLETED."""
        has_failures = any(s.status == WorkflowStepStatus.FAILED.value for s in steps)
        has_cancelled = any(s.status == WorkflowStepStatus.CANCELLED.value for s in steps)

        if has_failures:
            workflow.status = WorkflowStatus.FAILED.value
        elif has_cancelled:
            workflow.status = WorkflowStatus.PARTIALLY_COMPLETED.value
        else:
            workflow.status = WorkflowStatus.COMPLETED.value

        workflow.completed_at = utc_now()
        workflow.updated_at = utc_now()

        # Consolidate all step citations and summaries
        all_citations: List[Dict[str, Any]] = []
        summary_lines: List[str] = []

        for s in steps:
            if s.citations:
                all_citations.extend(s.citations)
            if s.status == WorkflowStepStatus.COMPLETED.value:
                out = s.output_data or {}
                summary = out.get("summary") if isinstance(out, dict) else str(out)
                summary_lines.append(f"Step {s.step_number} ({s.title}): {summary or 'Completed successfully.'}")
            elif s.status == WorkflowStepStatus.CANCELLED.value:
                summary_lines.append(f"Step {s.step_number} ({s.title}): Cancelled or rejected by user.")
            elif s.status == WorkflowStepStatus.SKIPPED.value:
                summary_lines.append(f"Step {s.step_number} ({s.title}): Skipped due to dependency.")

        result_summary = "\n".join(summary_lines)
        workflow.result_summary = result_summary
        workflow.final_report = {
            "title": workflow.title,
            "status": workflow.status,
            "steps_count": len(steps),
            "citations": all_citations,
            "summary": result_summary,
            "completed_at": workflow.completed_at.isoformat() if workflow.completed_at else None,
        }

        fin_evt = WorkflowEvent(
            id=str(uuid.uuid4()),
            workflow_id=workflow.id,
            event_type="workflow_completed",
            message=f"Workflow reached terminal status: {workflow.status}.",
            payload={"status": workflow.status, "citations_count": len(all_citations)},
            created_at=utc_now(),
        )
        db.add(fin_evt)
        await db.commit()

        _broadcast_event(workflow.id, {
            "type": "workflow_completed",
            "status": workflow.status,
            "summary": result_summary,
            "citations_count": len(all_citations),
        })

    # --------------------------------------------------------------------------
    # Streaming & SSE Pub/Sub
    # --------------------------------------------------------------------------

    @classmethod
    async def subscribe_events(
        cls,
        workflow_id: str,
    ) -> AsyncGenerator[str, None]:
        """Streams real-time workflow events as SSE data chunks."""
        queue: asyncio.Queue = asyncio.Queue()
        if workflow_id not in _workflow_subscribers:
            _workflow_subscribers[workflow_id] = set()
        _workflow_subscribers[workflow_id].add(queue)

        try:
            # Yield initial connect event
            yield f"event: connected\ndata: {json.dumps({'workflow_id': workflow_id})}\n\n"

            # Replay historical events first
            async with async_session_factory() as db:
                stmt = select(WorkflowEvent).where(WorkflowEvent.workflow_id == workflow_id).order_by(WorkflowEvent.created_at)
                historical_events = (await db.execute(stmt)).scalars().all()
                for evt in historical_events:
                    payload = {
                        "id": evt.id,
                        "event_type": evt.event_type,
                        "message": evt.message,
                        "payload": evt.payload,
                        "created_at": evt.created_at.isoformat(),
                    }
                    yield f"event: {evt.event_type}\ndata: {json.dumps(payload)}\n\n"

            # Stream live events
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    evt_type = event.get("type", "update")
                    yield f"event: {evt_type}\ndata: {json.dumps(event)}\n\n"

                    # If workflow completed or terminal, exit stream
                    if evt_type in ("workflow_completed", "workflow_failed", "workflow_cancelled"):
                        break
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat
                    yield f": heartbeat\n\n"
        finally:
            _workflow_subscribers.get(workflow_id, set()).discard(queue)
            if workflow_id in _workflow_subscribers and not _workflow_subscribers[workflow_id]:
                del _workflow_subscribers[workflow_id]

    # --------------------------------------------------------------------------
    # Recovery
    # --------------------------------------------------------------------------

    @classmethod
    async def recover_dangling_workflows(cls) -> None:
        """Reconciles workflows left in active states across server restarts."""
        async with async_session_factory() as db:
            active_statuses = [
                WorkflowStatus.RUNNING.value,
                WorkflowStatus.PLANNING.value,
            ]
            stmt = select(Workflow).where(Workflow.status.in_(active_statuses))
            dangling = (await db.execute(stmt)).scalars().all()

            for wf in dangling:
                logger.info("Recovering dangling workflow %s (status: %s)", wf.id, wf.status)
                # Reschedule or mark failed
                wf.status = WorkflowStatus.FAILED.value
                wf.error_message = "Server restarted during execution."
                wf.completed_at = utc_now()

                evt = WorkflowEvent(
                    id=str(uuid.uuid4()),
                    workflow_id=wf.id,
                    event_type="workflow_recovered",
                    message="Workflow marked failed due to server restart.",
                    created_at=utc_now(),
                )
                db.add(evt)

            if dangling:
                await db.commit()
                logger.info("Recovered %s dangling workflow(s)", len(dangling))
