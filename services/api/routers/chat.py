from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from schemas.streaming import ChatStreamRequest
from services.streaming_service import StreamingService

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("/stream", tags=["Chat"])
async def chat_stream(
    request: ChatStreamRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Initiates an SSE streaming AI response, persisting conversation and messages."""
    generator = StreamingService.stream_chat(db, request, user_id)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
