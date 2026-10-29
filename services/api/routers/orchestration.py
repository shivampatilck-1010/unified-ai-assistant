import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.workflow import Workflow, WorkflowEvent
from routers.deps import get_current_user_id
from schemas.orchestration import (
    CapabilityDefinitionResponse,
    WorkflowApproveRequest,
    WorkflowCancelRequest,
    WorkflowClarifyRequest,
    WorkflowConfirmStepRequest,
    WorkflowCreateRequest,
    WorkflowEventResponse,
    WorkflowListResponse,
    WorkflowPlan,
    WorkflowResponse,
)
from services.orchestration.engine import OrchestrationEngine
from services.orchestration.registry import get_capability_registry

logger = logging.getLogger("orchestration_router")

router = APIRouter(prefix="/api/orchestration", tags=["Orchestration"])


@router.get("/capabilities", response_model=List[CapabilityDefinitionResponse])
async def list_capabilities(
    user_id: str = Depends(get_current_user_id),
) -> List[CapabilityDefinitionResponse]:
    """Lists all registered subsystem capabilities, schemas, risk levels, and confirmation rules."""
    registry = get_capability_registry()
    caps = registry.list_all()
    return [
        CapabilityDefinitionResponse(
            identifier=c.identifier,
            name=c.name,
            description=c.description,
            input_schema=c.input_schema,
            output_schema=c.output_schema,
            required_permissions=c.required_permissions,
            risk_level=c.risk_level.value if hasattr(c.risk_level, "value") else str(c.risk_level),
            requires_confirmation=c.requires_confirmation,
        )
        for c in caps
    ]


@router.post("/workflows", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreateRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Creates a new orchestrated workflow, generating a multi-capability plan or asking for clarification."""
    try:
        workflow = await OrchestrationEngine.create_workflow(
            db=db,
            owner_id=user_id,
            prompt=payload.prompt,
            file_ids=payload.file_ids,
            conversation_id=payload.conversation_id,
        )
        return WorkflowResponse.model_validate(workflow)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to create workflow: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create workflow: {str(exc)}",
        )


@router.get("/workflows", response_model=WorkflowListResponse)
async def list_workflows(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by workflow status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowListResponse:
    """Lists workflows belonging to the authenticated user."""
    workflows, total = await OrchestrationEngine.list_workflows(
        db=db,
        owner_id=user_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return WorkflowListResponse(
        items=[WorkflowResponse.model_validate(w) for w in workflows],
        total=total,
    )


@router.get("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Retrieves full workflow details, including DAG steps and execution state."""
    workflow = await OrchestrationEngine.get_workflow(db=db, owner_id=user_id, workflow_id=workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    return WorkflowResponse.model_validate(workflow)


@router.get("/workflows/{workflow_id}/plan", response_model=WorkflowPlan)
async def get_workflow_plan(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowPlan:
    """Retrieves the proposed structured plan for human review."""
    workflow = await OrchestrationEngine.get_workflow(db=db, owner_id=user_id, workflow_id=workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
    if not workflow.plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No plan currently exists for this workflow.")
    return WorkflowPlan.model_validate(workflow.plan)


@router.post("/workflows/{workflow_id}/approve", response_model=WorkflowResponse)
async def approve_workflow_plan(
    workflow_id: str,
    payload: WorkflowApproveRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Approves a proposed workflow plan version to begin background execution."""
    if not payload.approved:
        # User explicitly rejected the plan
        workflow = await OrchestrationEngine.cancel_workflow(
            db=db,
            owner_id=user_id,
            workflow_id=workflow_id,
            reason="User declined the proposed plan.",
        )
        return WorkflowResponse.model_validate(workflow)

    workflow = await OrchestrationEngine.approve_plan(
        db=db,
        owner_id=user_id,
        workflow_id=workflow_id,
        plan_version=payload.plan_version,
    )
    return WorkflowResponse.model_validate(workflow)


@router.post("/workflows/{workflow_id}/clarify", response_model=WorkflowResponse)
async def submit_workflow_clarification(
    workflow_id: str,
    payload: WorkflowClarifyRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Submits user clarification to resolve missing parameters and refine the plan."""
    workflow = await OrchestrationEngine.submit_clarification(
        db=db,
        owner_id=user_id,
        workflow_id=workflow_id,
        clarification_response=payload.clarification_response,
    )
    return WorkflowResponse.model_validate(workflow)


@router.post("/workflows/{workflow_id}/confirm", response_model=WorkflowResponse)
async def confirm_consequential_step(
    workflow_id: str,
    payload: WorkflowConfirmStepRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Approves or rejects a consequential step requiring explicit confirmation."""
    workflow = await OrchestrationEngine.confirm_step(
        db=db,
        owner_id=user_id,
        workflow_id=workflow_id,
        step_number=payload.step_number,
        approved=payload.approved,
    )
    return WorkflowResponse.model_validate(workflow)


@router.post("/workflows/{workflow_id}/cancel", response_model=WorkflowResponse)
async def cancel_workflow(
    workflow_id: str,
    payload: WorkflowCancelRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> WorkflowResponse:
    """Cancels an in-progress or awaiting workflow."""
    workflow = await OrchestrationEngine.cancel_workflow(
        db=db,
        owner_id=user_id,
        workflow_id=workflow_id,
        reason=payload.reason,
    )
    return WorkflowResponse.model_validate(workflow)


@router.get("/workflows/{workflow_id}/events", response_model=List[WorkflowEventResponse])
async def list_workflow_events(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> List[WorkflowEventResponse]:
    """Lists audit events for a workflow."""
    workflow = await OrchestrationEngine.get_workflow(db=db, owner_id=user_id, workflow_id=workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    stmt = select(WorkflowEvent).where(WorkflowEvent.workflow_id == workflow_id).order_by(WorkflowEvent.created_at)
    events = (await db.execute(stmt)).scalars().all()
    return [WorkflowEventResponse.model_validate(e) for e in events]


@router.get("/workflows/{workflow_id}/stream")
async def stream_workflow_events(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Establishes an SSE connection streaming live execution events for a workflow."""
    workflow = await OrchestrationEngine.get_workflow(db=db, owner_id=user_id, workflow_id=workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")

    return StreamingResponse(
        OrchestrationEngine.subscribe_events(workflow_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
