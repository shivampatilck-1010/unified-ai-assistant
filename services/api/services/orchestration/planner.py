import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from schemas.orchestration import (
    CONSEQUENTIAL_CAPABILITIES,
    SAFE_READ_CAPABILITIES,
    CapabilityType,
    WorkflowPlan,
    WorkflowStepCreate,
)
from services.model_gateway import get_model_gateway
from services.orchestration.classifier import (
    IntentClassificationResult,
    IntentClassifier,
    UserIntentType,
)

logger = logging.getLogger("orchestration_planner")


class OrchestrationPlanner:
    """Interprets user requests, identifies necessary capabilities, and produces structured plans."""

    SUPPORTED_CAPABILITIES = {c.value for c in CapabilityType}

    @classmethod
    async def generate_plan(
        cls,
        prompt: str,
        file_ids: Optional[List[str]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
    ) -> Tuple[Optional[WorkflowPlan], Optional[str], str]:
        """Interprets request and outputs (plan, clarification_question, title)."""
        clean_prompt = prompt.strip()

        # 1. Intent Classification & Ambiguity Detection Gates
        intent_result = await IntentClassifier.classify(clean_prompt, file_ids)
        if intent_result.is_ambiguous and intent_result.clarification_prompt:
            title = cls._generate_title(clean_prompt)
            return None, intent_result.clarification_prompt, title

        # 2. Attempt LLM-based structured plan if model gateway has an active provider
        gateway = get_model_gateway()
        if gateway.is_any_provider_configured():
            try:
                adapter, model_id = gateway.resolve_provider_and_model()
                plan, title = await cls._generate_plan_via_llm(clean_prompt, file_ids, adapter, model_id)
                if plan:
                    cls._validate_and_sanitize_plan(plan)
                    return plan, None, title
            except Exception as e:
                logger.warning("LLM plan generation failed, falling back to deterministic planner: %s", e)

        # 3. Deterministic Heuristic Planner (resilient, safe, deterministic fallback)
        plan, title = cls._generate_plan_deterministic(clean_prompt, file_ids, intent_result=intent_result)
        cls._validate_and_sanitize_plan(plan)
        return plan, None, title

    @classmethod
    def _generate_title(cls, prompt: str) -> str:
        """Derives a concise 3-8 word title for the workflow."""
        words = prompt.strip().split()
        if len(words) <= 7:
            return prompt.strip()
        return " ".join(words[:6]) + "..."

    @classmethod
    def _validate_and_sanitize_plan(cls, plan: WorkflowPlan) -> None:
        """Enforces server-side security policies, dependency invariants, and capability allowlists."""
        step_numbers = set()
        consequential_count = 0

        for step in plan.steps:
            # 1. Reject unknown or invented capabilities
            cap_str = step.capability.value if hasattr(step.capability, "value") else str(step.capability)
            if cap_str not in cls.SUPPORTED_CAPABILITIES:
                raise ValueError(
                    f"Unsupported or invented capability '{cap_str}'. Allowed: {sorted(list(cls.SUPPORTED_CAPABILITIES))}"
                )

            # 2. Enforce sequential step numbers
            if step.step_number in step_numbers:
                raise ValueError(f"Duplicate step number {step.step_number} in plan")
            step_numbers.add(step.step_number)

            # 3. Validate dependency integrity (DAG constraint: must depend only on prior steps)
            for dep in step.depends_on:
                if dep not in step_numbers or dep >= step.step_number:
                    raise ValueError(
                        f"Step {step.step_number} has invalid dependency {dep}. Dependencies must precede the step."
                    )

            # 4. Enforce consequential action rules server-side
            if step.capability.value in CONSEQUENTIAL_CAPABILITIES:
                step.is_consequential = True
                step.requires_confirmation = True
                if not step.consequential_reason:
                    step.consequential_reason = f"Performs state modification ({step.capability.value})"
                consequential_count += 1
            else:
                # Safe read-only steps do not require human confirmation
                step.is_consequential = False
                step.requires_confirmation = False

        plan.consequential_actions_count = consequential_count

    @classmethod
    def _generate_plan_deterministic(
        cls,
        prompt: str,
        file_ids: Optional[List[str]] = None,
        intent_result: Optional[IntentClassificationResult] = None,
    ) -> Tuple[WorkflowPlan, str]:
        """Constructs a deterministic multi-step plan matching detected intents."""
        p_lower = prompt.lower()
        steps: List[WorkflowStepCreate] = []
        step_seq = 1

        # Capability Detection Flags
        wants_knowledge = bool(file_ids) or any(k in p_lower for k in ["my file", "my doc", "internal document", "uploaded file", "in my notes", "document"])
        wants_research = any(k in p_lower for k in ["research", "latest news", "investigate", "find on the web", "search online", "market trends", "overview of"])
        wants_browser = any(k in p_lower for k in ["navigate to", "visit http", "open website", "click on", "scrape http", "browser"])
        wants_sensing = any(k in p_lower for k in ["wi-fi", "wifi", "sensing", "occupancy", "presence in room", "motion in room", "is anyone in"])
        wants_task = any(k in p_lower for k in ["create task", "create a task", "add task", "add a task", "todo", "to-do", "follow up task", "create a to-do", "add to my tasks", "task:"])
        wants_calendar = any(k in p_lower for k in ["calendar", "schedule", "meeting", "event on", "schedule an event", "create event", "create an event", "appointment"])
        wants_reminder = any(k in p_lower for k in ["remind me", "set reminder", "reminder at", "alert me", "create a reminder"])

        # Also incorporate flags from intent classification result if available
        if intent_result:
            all_intents = [intent_result.primary_intent] + intent_result.secondary_intents
            if UserIntentType.DOCUMENT_ANALYZE in all_intents:
                wants_knowledge = True
            if UserIntentType.RESEARCH_TOPIC in all_intents:
                wants_research = True
            if UserIntentType.BROWSER_ANALYZE in all_intents:
                wants_browser = True
            if UserIntentType.SENSING_OPERATION in all_intents:
                wants_sensing = True
            if UserIntentType.MANAGE_TASK in all_intents:
                wants_task = True
            if UserIntentType.MANAGE_CALENDAR in all_intents:
                wants_calendar = True
            if UserIntentType.SET_REMINDER in all_intents:
                wants_reminder = True

        # If nothing specific was flagged, default to web research or knowledge search if documents are present
        if not (wants_knowledge or wants_research or wants_browser or wants_sensing or wants_task or wants_calendar or wants_reminder):
            wants_research = True

        prior_step_refs: List[int] = []

        # 1. Knowledge Retrieval Step
        if wants_knowledge:
            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title="Retrieve Relevant Document Knowledge",
                    capability=CapabilityType.KNOWLEDGE_SEARCH,
                    parameters={"query": prompt, "file_ids": file_ids or []},
                    depends_on=[],
                    is_consequential=False,
                )
            )
            prior_step_refs.append(step_seq)
            step_seq += 1

        # 2. Web Research Step
        if wants_research:
            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title="Investigate Primary Sources and Web Evidence",
                    capability=CapabilityType.WEB_RESEARCH,
                    parameters={"question": prompt, "depth": "quick"},
                    depends_on=[],
                    is_consequential=False,
                )
            )
            prior_step_refs.append(step_seq)
            step_seq += 1

        # 3. Wi-Fi Sensing Query Step
        if wants_sensing:
            room_id = (intent_result.entities.get("room_id") if intent_result else None)
            if not room_id:
                room_match = re.search(r"room\s+([a-zA-Z0-9_\-]+)", p_lower)
                room_id = room_match.group(1) if room_match else "office_101"

            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title=f"Query Environmental Sensing Status for {room_id}",
                    capability=CapabilityType.WIFI_SENSING_QUERY,
                    parameters={"room_id": room_id},
                    depends_on=[],
                    is_consequential=False,
                )
            )
            prior_step_refs.append(step_seq)
            step_seq += 1

        # 4. Autonomous Browser Step
        if wants_browser:
            target_url = (intent_result.entities.get("url") if intent_result else None)
            if not target_url:
                url_match = re.search(r"https?://[^\s]+", prompt)
                target_url = url_match.group(0) if url_match else "https://example.com"

            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title=f"Navigate and Inspect Web Target ({target_url})",
                    capability=CapabilityType.BROWSER_ACTION,
                    parameters={"url": target_url, "task_description": "Navigate and inspect web target"},
                    depends_on=list(prior_step_refs),
                    is_consequential=True,
                    consequential_reason="Launches autonomous cloud browser session",
                    requires_confirmation=True,
                )
            )
            prior_step_refs.append(step_seq)
            step_seq += 1

        # 5. Synthesis Step (integrates collected evidence)
        synthesis_step_num = step_seq
        steps.append(
            WorkflowStepCreate(
                step_number=step_seq,
                title="Synthesize Unified Findings and Analysis",
                capability=CapabilityType.GENERAL_SYNTHESIS,
                parameters={"instructions": "Synthesize findings across all prior evidence steps with citations."},
                depends_on=list(prior_step_refs),
                is_consequential=False,
            )
        )
        step_seq += 1

        # 6. Actionable Output Steps (Consequential Mutation Steps)
        if wants_task:
            task_title = cls._extract_task_title(prompt)
            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title=f"Create Follow-up Task: '{task_title}'",
                    capability=CapabilityType.TASK_CREATE,
                    parameters={"title": task_title, "notes": f"Generated from workflow prompt: '{prompt}'"},
                    depends_on=[synthesis_step_num],
                    is_consequential=True,
                    consequential_reason="Creates a persistent item in your Task List",
                    requires_confirmation=True,
                )
            )
            step_seq += 1

        if wants_calendar:
            event_title = cls._extract_calendar_title(prompt)
            now_iso = "2026-10-29T14:00:00Z"
            end_iso = "2026-10-29T15:00:00Z"
            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title=f"Schedule Calendar Event: '{event_title}'",
                    capability=CapabilityType.CALENDAR_EVENT_CREATE,
                    parameters={"title": event_title, "start_time": now_iso, "end_time": end_iso},
                    depends_on=[synthesis_step_num],
                    is_consequential=True,
                    consequential_reason="Modifies your calendar with a new scheduled event",
                    requires_confirmation=True,
                )
            )
            step_seq += 1

        if wants_reminder:
            rem_title = cls._extract_task_title(prompt)
            rem_time = "2026-10-29T09:00:00Z"
            steps.append(
                WorkflowStepCreate(
                    step_number=step_seq,
                    title=f"Schedule In-App Reminder: '{rem_title}'",
                    capability=CapabilityType.REMINDER_CREATE,
                    parameters={"title": rem_title, "scheduled_time": rem_time},
                    depends_on=[synthesis_step_num],
                    is_consequential=True,
                    consequential_reason="Schedules an automated in-app reminder alert",
                    requires_confirmation=True,
                )
            )
            step_seq += 1

        plan = WorkflowPlan(
            summary=f"Unified plan executing {len(steps)} steps across requested capabilities.",
            steps=steps,
            estimated_duration_seconds=len(steps) * 10,
        )
        return plan, cls._generate_title(prompt)

    @classmethod
    def _extract_task_title(cls, prompt: str) -> str:
        match = re.search(r"(?:create|add)(?:\s+a)?\s+task(?:\s+to|:)?\s+(.+?)(?:\.|$)", prompt, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return "Review and follow up on orchestrated findings"

    @classmethod
    def _extract_calendar_title(cls, prompt: str) -> str:
        match = re.search(r"(?:schedule|meeting|event)(?:\s+for)?\s+(.+?)(?:\.|$)", prompt, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return "Strategy Review Meeting"

    @classmethod
    async def _generate_plan_via_llm(
        cls,
        prompt: str,
        file_ids: Optional[List[str]],
        adapter: Any,
        model_id: Optional[str] = None,
    ) -> Tuple[Optional[WorkflowPlan], str]:
        """Leverages ModelGateway to construct a validated multi-capability plan."""
        system_prompt = (
            "You are the Unified AI Assistant Orchestration Planner. "
            "Given a user request, produce a JSON object with: 'title', 'summary', and 'steps'. "
            "Supported capabilities:\n"
            "- 'knowledge_search': parameters: {'query': string, 'file_ids': list}\n"
            "- 'web_research': parameters: {'question': string, 'depth': 'quick' | 'standard' | 'deep'}\n"
            "- 'browser_action': parameters: {'url': string, 'task_description': string}\n"
            "- 'task_create': parameters: {'title': string, 'notes': string}\n"
            "- 'calendar_event_create': parameters: {'title': string, 'start_time': ISO8601, 'end_time': ISO8601}\n"
            "- 'reminder_create': parameters: {'title': string, 'scheduled_time': ISO8601}\n"
            "- 'wifi_sensing_query': parameters: {'room_id': string}\n"
            "- 'general_synthesis': parameters: {'instructions': string}\n"
            "Rules:\n"
            "1. Output ONLY a valid JSON object.\n"
            "2. 'steps' must be a list of objects: { 'step_number': int, 'title': string, 'capability': string, 'parameters': dict, 'depends_on': list of ints }.\n"
            "3. Dependencies ('depends_on') must ONLY refer to earlier step numbers."
        )

        full_prompt = f"User Request: {prompt}\nAttached Files: {file_ids or []}"
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": full_prompt},
        ]
        response_text = await adapter.generate_text(messages, model=model_id)

        # Parse JSON from LLM output
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if not json_match:
            return None, cls._generate_title(prompt)

        raw_data = json.loads(json_match.group(0))
        title = raw_data.get("title") or cls._generate_title(prompt)
        plan = WorkflowPlan(
            summary=raw_data.get("summary", "AI generated plan"),
            steps=[WorkflowStepCreate(**step) for step in raw_data.get("steps", [])],
        )
        return plan, title
