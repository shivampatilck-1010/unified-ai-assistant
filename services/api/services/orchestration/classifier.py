import json
import logging
import re
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ValidationError

from services.model_gateway import get_model_gateway

logger = logging.getLogger("orchestration_classifier")


class UserIntentType(str, Enum):
    """Enumeration of user intent categories recognized by the orchestration engine."""
    ASK_QUESTION = "ask_question"
    RESEARCH_TOPIC = "research_topic"
    BROWSER_ANALYZE = "browser_analyze"
    DOCUMENT_ANALYZE = "document_analyze"
    MANAGE_TASK = "manage_task"
    MANAGE_CALENDAR = "manage_calendar"
    SET_REMINDER = "set_reminder"
    SENSING_OPERATION = "sensing_operation"
    MULTI_STEP_WORKFLOW = "multi_step_workflow"


class IntentClassificationResult(BaseModel):
    """Strict schema for intent classification outputs."""
    primary_intent: UserIntentType
    secondary_intents: List[UserIntentType] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)
    entities: Dict[str, Any] = Field(default_factory=dict)
    requires_multi_step: bool = False
    is_ambiguous: bool = False
    clarification_prompt: Optional[str] = None


class IntentClassifier:
    """Classifies user intent using the shared model gateway with deterministic fallback."""

    SYSTEM_PROMPT = (
        "You are the Intent Classification subsystem of the Unified AI Assistant. "
        "Analyze the user's request and classify their intent into one of the following categories:\n"
        "- 'ask_question': General question or knowledge inquiry.\n"
        "- 'research_topic': Multi-source web research or market investigation.\n"
        "- 'browser_analyze': Navigate, inspect, or scrape an external webpage/URL.\n"
        "- 'document_analyze': Inquire about or analyze uploaded user documents/files.\n"
        "- 'manage_task': Create, update, or manage a to-do/task item.\n"
        "- 'manage_calendar': Schedule, view, or modify a calendar meeting/event.\n"
        "- 'set_reminder': Create a scheduled in-app reminder or alert.\n"
        "- 'sensing_operation': Check room occupancy, Wi-Fi motion, or physical presence.\n"
        "- 'multi_step_workflow': Requests combining multiple actions across capabilities.\n\n"
        "Output ONLY a valid JSON object with the following keys:\n"
        "{\n"
        '  "primary_intent": "one of the intent strings above",\n'
        '  "secondary_intents": ["list of secondary intent strings if applicable"],\n'
        '  "confidence": float between 0.0 and 1.0,\n'
        '  "entities": { "extracted_key": "value" },\n'
        '  "requires_multi_step": boolean,\n'
        '  "is_ambiguous": boolean,\n'
        '  "clarification_prompt": "string if request is missing critical parameters, else null"\n'
        "}"
    )

    @classmethod
    async def classify(
        cls,
        prompt: str,
        file_ids: Optional[List[str]] = None,
    ) -> IntentClassificationResult:
        """
        Classifies user prompt using the shared model gateway when available,
        falling back to deterministic rule-based analysis.
        """
        clean_prompt = prompt.strip()

        # Check for ambiguity first
        ambiguity_msg = cls._detect_ambiguity(clean_prompt)
        if ambiguity_msg:
            return IntentClassificationResult(
                primary_intent=UserIntentType.ASK_QUESTION,
                confidence=0.5,
                is_ambiguous=True,
                clarification_prompt=ambiguity_msg,
            )

        # Attempt LLM-based interpretation if gateway has an active configured provider
        gateway = get_model_gateway()
        if gateway.is_any_provider_configured():
            try:
                adapter, model_id = gateway.resolve_provider_and_model()
                messages = [
                    {"role": "system", "content": cls.SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Request: {clean_prompt}\nAttached File IDs: {file_ids or []}",
                    },
                ]
                raw_response = await adapter.generate_text(messages, model=model_id)
                result = cls._parse_and_validate_llm_response(raw_response)
                if result:
                    return result
            except Exception as exc:
                logger.warning("LLM intent classification failed (%s), using rule fallback", exc)

        # Fallback to deterministic rule-based classification
        return cls._classify_deterministic(clean_prompt, file_ids)

    @classmethod
    def _parse_and_validate_llm_response(cls, response_text: str) -> Optional[IntentClassificationResult]:
        """Extracts JSON block from LLM response and validates against strict schema."""
        if not response_text:
            return None

        # Extract JSON object using regex
        match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if not match:
            return None

        try:
            data = json.loads(match.group(0))
            return IntentClassificationResult.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as err:
            logger.warning("Invalid LLM intent output schema: %s", err)
            return None

    @classmethod
    def _detect_ambiguity(cls, prompt: str) -> Optional[str]:
        """Identifies vague requests missing essential operational parameters."""
        p_lower = prompt.lower().strip()

        if p_lower in ("create a task", "add a task", "new task", "remind me", "add to my todo"):
            return "Please specify what task or reminder you would like to create."

        if p_lower in ("schedule a meeting", "add event", "create calendar event", "schedule an event"):
            return "Please provide the title and date/time for the event you wish to schedule."

        if p_lower in ("research this", "investigate", "find information", "search"):
            return "Please provide a specific topic or question you would like me to investigate."

        if p_lower in ("search my files", "check my documents", "look at my docs"):
            return "What specific topic or question would you like me to look for in your files?"

        return None

    @classmethod
    def _classify_deterministic(
        cls,
        prompt: str,
        file_ids: Optional[List[str]] = None,
    ) -> IntentClassificationResult:
        """Deterministic rule-based intent classification."""
        p_lower = prompt.lower()
        detected_intents: List[UserIntentType] = []
        entities: Dict[str, Any] = {}

        # 1. Document / Knowledge Check
        if file_ids or any(k in p_lower for k in ["my file", "my doc", "uploaded file", "in my notes", "document"]):
            detected_intents.append(UserIntentType.DOCUMENT_ANALYZE)

        # 2. Web Research Check
        if any(k in p_lower for k in ["research", "latest news", "investigate", "find on the web", "search online", "market trends", "overview of"]):
            detected_intents.append(UserIntentType.RESEARCH_TOPIC)

        # 3. Browser Agent Check
        url_match = re.search(r"https?://[^\s]+", prompt)
        if url_match or any(k in p_lower for k in ["navigate to", "visit http", "open website", "click on", "scrape http", "browser"]):
            detected_intents.append(UserIntentType.BROWSER_ANALYZE)
            if url_match:
                entities["url"] = url_match.group(0)

        # 4. Wi-Fi Sensing Check
        if any(k in p_lower for k in ["wi-fi", "wifi", "sensing", "occupancy", "presence in room", "motion in room", "is anyone in"]):
            detected_intents.append(UserIntentType.SENSING_OPERATION)
            room_match = re.search(r"room\s+([a-zA-Z0-9_\-]+)", p_lower)
            entities["room_id"] = room_match.group(1) if room_match else "office_101"

        # 5. Task Management Check
        if any(k in p_lower for k in ["create task", "create a task", "add task", "add a task", "todo", "to-do", "follow up task", "create a to-do", "add to my tasks", "task:"]):
            detected_intents.append(UserIntentType.MANAGE_TASK)

        # 6. Calendar Management Check
        if any(k in p_lower for k in ["calendar", "schedule", "meeting", "event on", "schedule an event", "create event", "create an event", "appointment"]):
            detected_intents.append(UserIntentType.MANAGE_CALENDAR)

        # 7. Reminder Check
        if any(k in p_lower for k in ["remind me", "set reminder", "reminder at", "alert me", "create a reminder"]):
            detected_intents.append(UserIntentType.SET_REMINDER)

        # Determine primary intent and multi-step flag
        if len(detected_intents) > 1:
            primary = UserIntentType.MULTI_STEP_WORKFLOW
            secondary = detected_intents
            requires_multi = True
        elif len(detected_intents) == 1:
            primary = detected_intents[0]
            secondary = []
            requires_multi = False
        else:
            primary = UserIntentType.ASK_QUESTION
            secondary = []
            requires_multi = False

        return IntentClassificationResult(
            primary_intent=primary,
            secondary_intents=secondary,
            confidence=0.9,
            entities=entities,
            requires_multi_step=requires_multi,
            is_ambiguous=False,
        )
