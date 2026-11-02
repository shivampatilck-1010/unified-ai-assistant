from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.conversation import ConversationCreate, ConversationSummary
from schemas.project import (
    PinFileRequest,
    ProjectCreate,
    ProjectDetail,
    ProjectListResponse,
    ProjectSummary,
    ProjectUpdate,
)
from services.conversation_service import ConversationService
from services.project_service import ProjectService

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.post("", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectSummary:
    """Create a new isolated project workspace."""
    return await ProjectService.create_project(db, owner_id=user_id, payload=payload)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    limit: int = Query(default=50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectListResponse:
    """List paginated projects for current identity."""
    items, total = await ProjectService.list_projects(
        db, owner_id=user_id, limit=limit, offset=offset
    )
    return ProjectListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectDetail:
    """Retrieve detailed project workspace info, including conversations and pinned knowledge files."""
    proj = await ProjectService.get_project(db, project_id=project_id, owner_id=user_id)
    if not proj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    return proj


@router.patch("/{project_id}", response_model=ProjectSummary)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectSummary:
    """Update project settings, system prompt instructions, or appearance."""
    proj = await ProjectService.update_project(
        db, project_id=project_id, owner_id=user_id, payload=payload
    )
    if not proj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    return proj


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Delete a project workspace while preserving unlinked conversations safely."""
    deleted = await ProjectService.delete_project(db, project_id=project_id, owner_id=user_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    return None


@router.post("/{project_id}/conversations", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_project_conversation(
    project_id: str,
    payload: Optional[ConversationCreate] = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ConversationSummary:
    """Create a new conversation scoped directly inside this project."""
    # Verify project exists
    proj = await ProjectService.get_project(db, project_id=project_id, owner_id=user_id)
    if not proj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    title = payload.title if payload and payload.title else f"New thread in {proj.name}"
    return await ConversationService.create_conversation(
        db, owner_id=user_id, title=title, project_id=project_id
    )


@router.post("/{project_id}/pin-file", response_model=ProjectDetail)
async def pin_file(
    project_id: str,
    payload: PinFileRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectDetail:
    """Pin a knowledge file to this project for automatic grounding."""
    detail = await ProjectService.pin_file(
        db, project_id=project_id, owner_id=user_id, file_id=payload.file_id
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project or file not found.",
        )
    return detail


@router.post("/{project_id}/unpin-file", response_model=ProjectDetail)
async def unpin_file(
    project_id: str,
    payload: PinFileRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ProjectDetail:
    """Unpin a knowledge file from this project."""
    detail = await ProjectService.unpin_file(
        db, project_id=project_id, owner_id=user_id, file_id=payload.file_id
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )
    return detail
