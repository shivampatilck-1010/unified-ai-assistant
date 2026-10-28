from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.knowledge import (
    KnowledgeAnswerRequest,
    KnowledgeAnswerResponse,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
)
from services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/api/knowledge", tags=["Knowledge"])


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> KnowledgeSearchResponse:
    """Search indexed document chunks using semantic similarity or lexical fallback."""
    results, strategy = await KnowledgeService.search(
        db,
        owner_id=user_id,
        query=payload.query,
        file_ids=payload.file_ids,
        top_k=payload.top_k,
    )
    return KnowledgeSearchResponse(
        query=payload.query,
        results=results,
        citations=results,
        total_results=len(results),
        strategy_used=strategy,
    )


@router.post("/answer", response_model=KnowledgeAnswerResponse)
async def answer_knowledge(
    payload: KnowledgeAnswerRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> KnowledgeAnswerResponse:
    """Generate a grounded answer with verified document citations."""
    try:
        return await KnowledgeService.answer(
            db,
            owner_id=user_id,
            query=payload.query,
            file_ids=payload.file_ids,
            provider=payload.provider,
            model=payload.model,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Answering failed: {str(exc)}",
        )
