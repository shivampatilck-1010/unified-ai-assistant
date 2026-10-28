from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.conversation import (
    ConversationCreate,
    ConversationDetail,
    ConversationListResponse,
    ConversationSummary,
    ConversationUpdate,
    SearchResponse,
)
from services.conversation_service import ConversationService

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.post("", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: Optional[ConversationCreate] = None,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ConversationSummary:
    """Create a new empty conversation for the current identity."""
    title = payload.title if payload and payload.title else "New conversation"
    return await ConversationService.create_conversation(db, owner_id=user_id, title=title)


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    limit: int = Query(default=50, ge=1, le=100, description="Max items to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ConversationListResponse:
    """List paginated conversations belonging to the current user."""
    items, total = await ConversationService.list_conversations(
        db, owner_id=user_id, limit=limit, offset=offset
    )
    return ConversationListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/search", response_model=SearchResponse)
async def search_conversations(
    q: str = Query(min_length=1, max_length=100, description="Search term"),
    limit: int = Query(default=20, ge=1, le=50, description="Max search results"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> SearchResponse:
    """Search conversation titles and message contents owned by the current user."""
    matches = await ConversationService.search(db, owner_id=user_id, query=q, limit=limit)
    return SearchResponse(query=q, matches=matches, total=len(matches))


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ConversationDetail:
    """Retrieve full conversation details with messages, verifying ownership."""
    conv = await ConversationService.get_conversation(db, conversation_id=conversation_id, owner_id=user_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )
    return conv


@router.patch("/{conversation_id}", response_model=ConversationSummary)
async def update_conversation_title(
    conversation_id: str,
    payload: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ConversationSummary:
    """Rename a conversation title, enforcing ownership."""
    conv = await ConversationService.update_conversation_title(
        db, conversation_id=conversation_id, owner_id=user_id, title=payload.title
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )
    return conv


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a conversation and all its messages, enforcing ownership."""
    deleted = await ConversationService.delete_conversation(
        db, conversation_id=conversation_id, owner_id=user_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found or access denied.",
        )
