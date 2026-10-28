import json
import uuid
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models.conversation import Conversation
from providers.base import ProviderError
from schemas.streaming import ChatStreamRequest, SSEEventPayload, SSEEventType
from services.conversation_service import ConversationService
from services.model_gateway import get_model_gateway


def format_sse(event_type: SSEEventType, payload: SSEEventPayload) -> str:
    return f"event: {event_type.value}\ndata: {json.dumps(payload.model_dump())}\n\n"


def derive_title(text: str) -> str:
    cleaned = text.strip()
    if len(cleaned) <= 45:
        return cleaned
    return cleaned[:42] + "..."


class StreamingService:
    """Orchestrates persistent streaming generation, database record synchronization, and SSE delivery."""

    @staticmethod
    async def stream_chat(
        db: AsyncSession,
        request: ChatStreamRequest,
        owner_id: str,
    ) -> AsyncGenerator[str, None]:
        gateway = get_model_gateway()

        # 1. Resolve or create conversation
        conversation_id = request.conversation_id
        if conversation_id:
            conv_detail = await ConversationService.get_conversation(db, conversation_id, owner_id)
            if not conv_detail:
                # Specified conversation does not exist or unauthorized
                err_payload = SSEEventPayload(
                    event=SSEEventType.ERROR,
                    conversation_id=conversation_id,
                    message_id=str(uuid.uuid4()),
                    data={"code": "CONVERSATION_NOT_FOUND", "message": "Conversation not found or access denied."},
                )
                yield format_sse(SSEEventType.ERROR, err_payload)
                yield format_sse(
                    SSEEventType.MESSAGE_COMPLETE,
                    SSEEventPayload(
                        event=SSEEventType.MESSAGE_COMPLETE,
                        conversation_id=conversation_id,
                        message_id=err_payload.message_id,
                        data={"finish_reason": "error"},
                    ),
                )
                return
        else:
            # Create a new conversation
            new_title = derive_title(request.message)
            created_conv = await ConversationService.create_conversation(db, owner_id, new_title)
            conversation_id = created_conv.id

        # 2. Persist user message
        user_msg = await ConversationService.add_message(
            db=db,
            conversation_id=conversation_id,
            role="user",
            content=request.message,
            status="completed",
        )

        # 3. Create placeholder assistant message record
        assistant_msg_id = str(uuid.uuid4())
        assistant_msg = await ConversationService.add_message(
            db=db,
            conversation_id=conversation_id,
            role="assistant",
            content="",
            status="streaming",
            provider=request.provider,
            model=request.model,
            message_id=assistant_msg_id,
        )

        # 4. Emit message_start event
        start_payload = SSEEventPayload(
            event=SSEEventType.MESSAGE_START,
            conversation_id=conversation_id,
            message_id=assistant_msg_id,
            data={"role": "assistant"},
        )
        yield format_sse(SSEEventType.MESSAGE_START, start_payload)

        # 5. Check provider resolution
        try:
            adapter, model_id = gateway.resolve_provider_and_model(
                requested_provider=request.provider,
                requested_model=request.model,
            )
        except ProviderError as err:
            # Update assistant message in DB with error status
            await ConversationService.update_message(
                db=db,
                message_id=assistant_msg_id,
                content=err.message,
                status="error",
                extra_metadata=json.dumps({"error_code": err.code}),
            )

            # Emit error SSE
            err_payload = SSEEventPayload(
                event=SSEEventType.ERROR,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"code": err.code, "message": err.message},
            )
            yield format_sse(SSEEventType.ERROR, err_payload)

            # Emit terminal message_complete with error finish_reason
            complete_payload = SSEEventPayload(
                event=SSEEventType.MESSAGE_COMPLETE,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"finish_reason": "error"},
            )
            yield format_sse(SSEEventType.MESSAGE_COMPLETE, complete_payload)
            return

        # 6. Stream generation from provider
        accumulated_chunks = []
        conversation_history = [
            {"role": "user", "content": request.message}
        ]

        try:
            async for chunk in adapter.generate_stream(conversation_history, model=model_id):
                accumulated_chunks.append(chunk)
                delta_payload = SSEEventPayload(
                    event=SSEEventType.TEXT_DELTA,
                    conversation_id=conversation_id,
                    message_id=assistant_msg_id,
                    data={"text": chunk},
                )
                yield format_sse(SSEEventType.TEXT_DELTA, delta_payload)

            # 7. Persist completed response
            full_content = "".join(accumulated_chunks)
            await ConversationService.update_message(
                db=db,
                message_id=assistant_msg_id,
                content=full_content,
                status="completed",
                extra_metadata=json.dumps({"finish_reason": "stop", "provider": adapter.provider_id, "model": model_id}),
            )

            # 8. Emit message_complete event
            complete_payload = SSEEventPayload(
                event=SSEEventType.MESSAGE_COMPLETE,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"finish_reason": "stop", "provider": adapter.provider_id, "model": model_id},
            )
            yield format_sse(SSEEventType.MESSAGE_COMPLETE, complete_payload)

        except ProviderError as err:
            # Partial or total error during stream
            partial_content = "".join(accumulated_chunks)
            final_status = "interrupted" if partial_content else "error"
            await ConversationService.update_message(
                db=db,
                message_id=assistant_msg_id,
                content=partial_content or err.message,
                status=final_status,
                extra_metadata=json.dumps({"error_code": err.code, "error_message": err.message}),
            )

            err_payload = SSEEventPayload(
                event=SSEEventType.ERROR,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"code": err.code, "message": err.message},
            )
            yield format_sse(SSEEventType.ERROR, err_payload)

            complete_payload = SSEEventPayload(
                event=SSEEventType.MESSAGE_COMPLETE,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"finish_reason": "error"},
            )
            yield format_sse(SSEEventType.MESSAGE_COMPLETE, complete_payload)

        except Exception as err:
            # Unexpected exception
            partial_content = "".join(accumulated_chunks)
            final_status = "interrupted" if partial_content else "error"
            error_msg = "An unexpected error occurred during model response generation."
            await ConversationService.update_message(
                db=db,
                message_id=assistant_msg_id,
                content=partial_content or error_msg,
                status=final_status,
                extra_metadata=json.dumps({"error": str(err)}),
            )

            err_payload = SSEEventPayload(
                event=SSEEventType.ERROR,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"code": "INTERNAL_STREAM_ERROR", "message": error_msg},
            )
            yield format_sse(SSEEventType.ERROR, err_payload)

            complete_payload = SSEEventPayload(
                event=SSEEventType.MESSAGE_COMPLETE,
                conversation_id=conversation_id,
                message_id=assistant_msg_id,
                data={"finish_reason": "error"},
            )
            yield format_sse(SSEEventType.MESSAGE_COMPLETE, complete_payload)
