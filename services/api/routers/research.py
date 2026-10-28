from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.research import (
    ResearchEventResponse,
    ResearchJobCancelRequest,
    ResearchJobCreate,
    ResearchJobDetailResponse,
    ResearchJobListResponse,
    ResearchJobResponse,
    ResearchReport,
    ResearchSourceResponse,
)
from services.research.job_service import ResearchJobService

router = APIRouter(prefix="/api/research", tags=["Web Research"])


@router.post("/jobs", response_model=ResearchJobResponse, status_code=status.HTTP_201_CREATED)
async def create_research_job(
    payload: ResearchJobCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchJobResponse:
    """Creates a new web research job, generates a plan, and begins execution or awaits approval."""
    try:
        job = await ResearchJobService.create_job(db, owner_id=user_id, payload=payload)
        return ResearchJobResponse.model_validate(job)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create research job: {str(exc)}",
        )


@router.get("/jobs", response_model=ResearchJobListResponse)
async def list_research_jobs(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by job status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchJobListResponse:
    """Lists research jobs belonging to the authenticated identity."""
    items, total = await ResearchJobService.list_jobs(
        db, owner_id=user_id, status=status_filter, limit=limit, offset=offset
    )
    return ResearchJobListResponse(
        items=[ResearchJobResponse.model_validate(j) for j in items],
        total=total,
    )


@router.get("/jobs/{job_id}", response_model=ResearchJobDetailResponse)
async def get_research_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchJobDetailResponse:
    """Retrieves full research job details including sources and execution progress events."""
    res = await ResearchJobService.get_job_detail(db, owner_id=user_id, job_id=job_id)
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")

    job, sources, events = res
    return ResearchJobDetailResponse(
        job=ResearchJobResponse.model_validate(job),
        sources=[ResearchSourceResponse.model_validate(s) for s in sources],
        events=[ResearchEventResponse.model_validate(e) for e in events],
    )


@router.post("/jobs/{job_id}/approve", response_model=ResearchJobResponse)
async def approve_research_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchJobResponse:
    """Approves a research plan awaiting confirmation and commences execution."""
    try:
        job = await ResearchJobService.approve_job(db, owner_id=user_id, job_id=job_id)
        return ResearchJobResponse.model_validate(job)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/jobs/{job_id}/cancel", response_model=ResearchJobResponse)
async def cancel_research_job(
    job_id: str,
    payload: Optional[ResearchJobCancelRequest] = None,
    reason: Optional[str] = Query(None, description="Optional cancellation reason"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchJobResponse:
    """Cancels a pending or running research job."""
    effective_reason = (payload.reason if payload and payload.reason else reason) or "Cancelled by user"
    try:
        job = await ResearchJobService.cancel_job(
            db, owner_id=user_id, job_id=job_id, reason=effective_reason
        )
        return ResearchJobResponse.model_validate(job)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/jobs/{job_id}/sources", response_model=List[ResearchSourceResponse])
async def list_research_sources(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> List[ResearchSourceResponse]:
    """Lists web sources discovered and retrieved for the research job."""
    try:
        sources = await ResearchJobService.list_sources(db, owner_id=user_id, job_id=job_id)
        return [ResearchSourceResponse.model_validate(s) for s in sources]
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/jobs/{job_id}/sources/{source_id}", response_model=ResearchSourceResponse)
async def get_research_source(
    job_id: str,
    source_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchSourceResponse:
    """Retrieves evidence details and inspection metadata for a single source."""
    src = await ResearchJobService.get_source(
        db, owner_id=user_id, job_id=job_id, source_id=source_id
    )
    if not src:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research source not found.")
    return ResearchSourceResponse.model_validate(src)


@router.get("/jobs/{job_id}/report", response_model=ResearchReport)
async def get_research_report(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ResearchReport:
    """Retrieves the finalized synthesized research report."""
    job = await ResearchJobService.get_job(db, owner_id=user_id, job_id=job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")

    if not job.final_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report has not been generated yet. Current status: '{job.status}'.",
        )

    return ResearchReport.model_validate(job.final_report)


@router.get("/jobs/{job_id}/export")
async def export_research_report_markdown(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> Response:
    """Exports the completed research report as formatted Markdown."""
    try:
        md = await ResearchJobService.export_report_markdown(db, owner_id=user_id, job_id=job_id)
        return Response(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="research_report_{job_id[:8]}.md"'},
        )
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
