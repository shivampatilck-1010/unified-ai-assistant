import logging
import re
from typing import Any, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("intelligence.context_manager")


class UnifiedContext:
    def __init__(
        self,
        user_id: str,
        conversation_id: Optional[str] = None,
        project_id: Optional[str] = None,
        project_guidance: Optional[str] = None,
        project_name: Optional[str] = None,
        pinned_file_ids: Optional[List[str]] = None,
        recent_messages: Optional[List[Dict[str, str]]] = None,
        resolved_entities: Optional[Dict[str, Any]] = None,
    ):
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.project_id = project_id
        self.project_guidance = project_guidance
        self.project_name = project_name
        self.pinned_file_ids = pinned_file_ids or []
        self.recent_messages = recent_messages or []
        self.resolved_entities = resolved_entities or {}

    def to_system_context(self) -> str:
        """Formats active project and conversation context for model reasoning."""
        blocks = []
        if self.project_name:
            blocks.append(f"PROJECT WORKSPACE: {self.project_name}")
        if self.project_guidance:
            blocks.append(f"PROJECT GUIDANCE:\n{self.project_guidance}")
        if self.pinned_file_ids:
            blocks.append(f"PINNED KNOWLEDGE: {len(self.pinned_file_ids)} reference files active.")
        return "\n\n".join(blocks)


class ContextManager:
    """Aggregates and resolves contextual state across conversations, projects, and active files."""

    @classmethod
    async def resolve_context(
        cls,
        db: AsyncSession,
        user_id: str,
        conversation_id: Optional[str] = None,
        project_id: Optional[str] = None,
        explicit_file_ids: Optional[List[str]] = None,
        current_prompt: Optional[str] = None,
    ) -> UnifiedContext:
        recent_messages: List[Dict[str, str]] = []
        resolved_project_id = project_id
        project_name: Optional[str] = None
        project_guidance: Optional[str] = None
        pinned_files: List[str] = list(explicit_file_ids or [])
        resolved_entities: Dict[str, Any] = {}

        # 1. Load conversation context if specified
        if conversation_id:
            try:
                from services.conversation_service import ConversationService
                conv_detail = await ConversationService.get_conversation(db, conversation_id, user_id)
                if conv_detail:
                    if not resolved_project_id and conv_detail.project_id:
                        resolved_project_id = conv_detail.project_id
                    if conv_detail.messages:
                        for m in conv_detail.messages[-6:]:
                            if m.status == "completed" and m.role in ("user", "assistant"):
                                recent_messages.append({"role": m.role, "content": m.content})
            except Exception as e:
                logger.debug("Failed loading conversation context: %s", e)

        # 2. Load Project Workspace context if specified
        if resolved_project_id:
            try:
                from services.project_service import ProjectService
                proj = await ProjectService.get_project(db, resolved_project_id, user_id)
                if proj:
                    project_name = proj.name
                    project_guidance = proj.system_guidance
                    if proj.pinned_file_ids:
                        for pf in proj.pinned_file_ids:
                            if pf not in pinned_files:
                                pinned_files.append(pf)
            except Exception as e:
                logger.debug("Failed loading project workspace: %s", e)

        # 3. Resolve anaphoric references from recent conversation messages
        if current_prompt and recent_messages:
            resolved_entities = cls._resolve_references(current_prompt, recent_messages)

        return UnifiedContext(
            user_id=user_id,
            conversation_id=conversation_id,
            project_id=resolved_project_id,
            project_guidance=project_guidance,
            project_name=project_name,
            pinned_file_ids=pinned_files,
            recent_messages=recent_messages,
            resolved_entities=resolved_entities,
        )

    @classmethod
    def _resolve_references(cls, prompt: str, history: List[Dict[str, str]]) -> Dict[str, Any]:
        """Resolves pronouns or relative references (e.g., 'it', 'the site', 'that URL')."""
        entities: Dict[str, Any] = {}
        prompt_lower = prompt.lower()

        # If prompt mentions "it", "the site", "the url", look for the most recent URL in history
        if any(w in prompt_lower for w in (" it", "that site", "the website", "that url", "the link")):
            for m in reversed(history):
                urls = re.findall(r"https?://[^\s<>\"']+", m.get("content", ""))
                if urls:
                    entities["resolved_url"] = urls[0]
                    break

        return entities
