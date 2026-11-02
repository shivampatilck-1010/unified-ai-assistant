import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from schemas.calendar_event import CalendarEventCreate
from schemas.orchestration import (
    CONSEQUENTIAL_CAPABILITIES,
    SAFE_READ_CAPABILITIES,
    CapabilityType,
)
from schemas.reminder import ReminderCreate
from schemas.research import ResearchJobCreate
from schemas.task import TaskCreate, TaskUpdate
from services.calendar_service import CalendarService
from services.knowledge_service import KnowledgeService
from services.model_gateway import get_model_gateway
from services.orchestration.registry import (
    CapabilityDefinition,
    CapabilityRiskLevel,
    get_capability_registry,
)
from services.reminder_service import ReminderService
from services.research.job_service import ResearchJobService
from services.task_service import TaskService
from services.wifi_sensing_tool import WifiSensingTool

logger = logging.getLogger("orchestration_dispatcher")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CapabilityDispatcher:
    """Dispatches workflow steps to verified, typed subsystem capabilities via CapabilityRegistry."""

    @classmethod
    def interpolate_parameters(
        cls,
        parameters: Dict[str, Any],
        context: Dict[int, Any],
    ) -> Dict[str, Any]:
        """
        Interpolates `{step_N.output...}` or `{step_N.output.field}` references
        into step parameters using outputs from previous dependency steps.
        """
        if not parameters:
            return {}

        def _resolve_match(match: re.Match) -> str:
            path = match.group(1).split(".")
            # Expected format: step_N.output or step_N.output.field
            if not path or not path[0].startswith("step_"):
                return match.group(0)

            try:
                step_num = int(path[0].replace("step_", ""))
            except ValueError:
                return match.group(0)

            if step_num not in context:
                return match.group(0)

            val = context[step_num]
            # Navigate nested keys if present
            for part in path[1:]:
                if part == "output" and isinstance(val, dict) and "output" in val:
                    val = val["output"]
                elif isinstance(val, dict) and part in val:
                    val = val[part]
                else:
                    break

            if isinstance(val, (dict, list)):
                return json.dumps(val)
            return str(val)

        def _resolve_val(v: Any) -> Any:
            if isinstance(v, str):
                return re.sub(r"\{([a-zA-Z0-9_\.]+)\}", _resolve_match, v)
            elif isinstance(v, dict):
                return {k: _resolve_val(sub_v) for k, sub_v in v.items()}
            elif isinstance(v, list):
                return [_resolve_val(sub_v) for sub_v in v]
            return v

        return {k: _resolve_val(v) for k, v in parameters.items()}

    @classmethod
    async def dispatch(
        cls,
        db: AsyncSession,
        owner_id: str,
        capability: str,
        parameters: Dict[str, Any],
        step_number: int,
        context: Dict[int, Any],
    ) -> Dict[str, Any]:
        """
        Dispatches step execution to the registered internal capability handler.
        Never executes hallucinated or unknown capabilities.
        """
        interpolated_params = cls.interpolate_parameters(parameters, context)
        logger.info(
            "Dispatching step %s (capability: %s) for user %s",
            step_number,
            capability,
            owner_id,
        )

        registry = get_capability_registry()
        try:
            return await registry.execute(
                identifier=capability,
                db=db,
                owner_id=owner_id,
                parameters=interpolated_params,
                context=context,
            )
        except Exception as exc:
            logger.error("Step %s execution failed: %s", step_number, exc, exc_info=True)
            return {
                "success": False,
                "error": str(exc),
                "summary": f"Failed executing step: {str(exc)}",
                "data": None,
                "citations": [],
            }

    # --------------------------------------------------------------------------
    # Individual Capability Handlers
    # --------------------------------------------------------------------------

    @classmethod
    async def execute_knowledge_search(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        query = params.get("query") or params.get("question") or ""
        file_ids = params.get("file_ids")
        top_k = int(params.get("top_k", 5))

        if not query:
            return {
                "success": False,
                "error": "Query parameter is required for knowledge search.",
                "summary": "Knowledge search missing query parameter.",
                "data": None,
                "citations": [],
            }

        citations, context_text = await KnowledgeService.search(
            db=db,
            owner_id=owner_id,
            query=query,
            file_ids=file_ids,
            top_k=top_k,
        )

        formatted_citations = []
        for c in citations:
            ref_str = f"[Doc: {c.filename}, Page {c.page_number or 1}]"
            formatted_citations.append(
                {
                    "source_type": "document",
                    "citation_key": ref_str,
                    "title": c.filename,
                    "page_number": c.page_number,
                    "snippet": c.snippet,
                    "score": c.score,
                }
            )

        summary = f"Found {len(citations)} relevant document excerpts for query: '{query}'."
        return {
            "success": True,
            "data": {
                "query": query,
                "context_text": context_text,
                "chunks_found": len(citations),
            },
            "summary": summary,
            "citations": formatted_citations,
        }

    @classmethod
    async def execute_web_research(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        question = params.get("question") or params.get("query") or ""
        depth = params.get("depth", "quick")
        allowed_domains = params.get("allowed_domains") or []
        max_sources = int(params.get("max_sources", 3))

        if not question:
            return {
                "success": False,
                "error": "Question parameter is required for web research.",
                "summary": "Web research missing question.",
                "data": None,
                "citations": [],
            }

        job_create = ResearchJobCreate(
            question=question,
            depth=depth,
            allowed_domains=allowed_domains,
            max_sources=max_sources,
            requires_approval=False,
        )

        # Create job without auto_start so we can run directly in step sequence
        job = await ResearchJobService.create_job(
            db=db,
            owner_id=owner_id,
            payload=job_create,
            auto_start=False,
        )

        # Run research job execution
        await ResearchJobService._execute_job(job.id)

        # Fetch completed job and sources
        refreshed_job = await ResearchJobService.get_job_detail(db, owner_id, job.id)
        if not refreshed_job:
            return {
                "success": False,
                "error": "Research job record could not be loaded.",
                "summary": "Failed to load research job result.",
                "data": None,
                "citations": [],
            }

        sources = await ResearchJobService.list_sources(db, owner_id, job.id)
        formatted_citations = []
        for i, src in enumerate(sources):
            ref_str = f"[Web {i+1}: {src.title or src.publisher or 'Source'}]"
            formatted_citations.append(
                {
                    "source_type": "web",
                    "citation_key": ref_str,
                    "title": src.title or src.publisher,
                    "url": src.canonical_url,
                    "publisher": src.publisher,
                    "validation_status": src.validation_status,
                }
            )

        return {
            "success": True,
            "data": {
                "job_id": job.id,
                "status": refreshed_job.status,
                "summary": refreshed_job.summary,
                "report": refreshed_job.report,
                "sources_count": len(sources),
            },
            "summary": refreshed_job.summary or f"Completed web research on '{question}'.",
            "citations": formatted_citations,
        }

    @classmethod
    async def execute_browser_action(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        task_description = params.get("task_description") or params.get("description") or "Execute browser navigation"
        initial_url = params.get("url") or params.get("initial_url")
        allowed_domains = params.get("allowed_domains") or []

        from policy import validate_url
        if initial_url:
            validate_url(initial_url, allowed_domains=allowed_domains, allow_local=True)

        from services.browser_task_service import BrowserTaskService
        from schemas.browser_task import BrowserTaskCreateRequest, BrowserTaskApproveRequest
        from worker import get_worker_runner
        from config import get_settings

        settings = get_settings()
        runner = get_worker_runner(
            headless=settings.browser_headless,
            allow_local=settings.allow_local_browser_targets,
            max_concurrency=settings.browser_worker_concurrency,
        )

        svc = BrowserTaskService(db=db)
        b_task = await svc.create_task(
            user_id=owner_id,
            req=BrowserTaskCreateRequest(
                task_description=task_description,
                initial_url=initial_url,
                allowed_domains=allowed_domains or None,
            ),
        )
        approved_task = await svc.approve_task(
            user_id=owner_id,
            task_id=b_task.id,
            req=BrowserTaskApproveRequest(approved=True),
            runner=runner,
        )

        # Wait for worker completion or timeout
        final_task = approved_task
        for _ in range(60):
            await asyncio.sleep(0.5)
            final_task = await svc.get_task(user_id=owner_id, task_id=b_task.id)
            if final_task.status in ("completed", "failed", "cancelled", "awaiting_confirmation"):
                break

        latest_screenshot = runner.get_latest_screenshot(b_task.id)

        return {
            "success": final_task.status == "completed",
            "data": {
                "task_id": b_task.id,
                "status": final_task.status,
                "evidence_count": len(final_task.evidence or []),
                "screenshot_data_url": latest_screenshot,
            },
            "summary": final_task.result_summary or f"Browser task {final_task.status}: {task_description}",
            "citations": [
                {
                    "title": f"Browser Session: {initial_url or 'Target Page'}",
                    "source_url": initial_url or "https://unified-ai-assistant.pages.dev",
                    "snippet": final_task.result_summary or "Browser execution verified.",
                    "author": "Autonomous Browser Agent",
                }
            ] if initial_url else [],
        }

    @classmethod
    async def execute_task_create(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        title = params.get("title")
        if not title:
            return {
                "success": False,
                "error": "Task title is required.",
                "summary": "Cannot create task without title.",
                "data": None,
                "citations": [],
            }

        due_date = params.get("due_date")
        if isinstance(due_date, str):
            try:
                due_date = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
            except ValueError:
                due_date = None

        payload = TaskCreate(
            title=title,
            description=params.get("description") or params.get("notes"),
            priority=params.get("priority", "medium"),
            due_date=due_date,
            timezone=params.get("timezone", "UTC"),
        )

        task = await TaskService.create_task(db=db, owner_id=owner_id, data=payload)
        return {
            "success": True,
            "data": {
                "task_id": task.id,
                "title": task.title,
                "priority": task.priority,
                "due_date": task.due_date.isoformat() if task.due_date else None,
            },
            "summary": f"Created task: '{task.title}' (ID: {task.id}).",
            "citations": [],
        }

    @classmethod
    async def execute_task_update(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        task_id = params.get("task_id")
        if not task_id:
            return {
                "success": False,
                "error": "task_id is required.",
                "summary": "Cannot update task without task_id.",
                "data": None,
                "citations": [],
            }

        payload = TaskUpdate(
            status=params.get("status"),
            priority=params.get("priority"),
            title=params.get("title"),
            description=params.get("description"),
        )

        updated_task = await TaskService.update_task(db=db, owner_id=owner_id, task_id=task_id, data=payload)
        if not updated_task:
            return {
                "success": False,
                "error": f"Task {task_id} not found or unauthorized.",
                "summary": "Task update failed.",
                "data": None,
                "citations": [],
            }

        return {
            "success": True,
            "data": {
                "task_id": updated_task.id,
                "status": updated_task.status,
                "priority": updated_task.priority,
            },
            "summary": f"Updated task '{updated_task.title}' to status: {updated_task.status}.",
            "citations": [],
        }

    @classmethod
    async def execute_calendar_event_create(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        title = params.get("title")
        start_time_raw = params.get("start_time")
        end_time_raw = params.get("end_time")

        if not title or not start_time_raw or not end_time_raw:
            return {
                "success": False,
                "error": "title, start_time, and end_time are required for calendar event.",
                "summary": "Missing calendar event parameters.",
                "data": None,
                "citations": [],
            }

        try:
            start_time = datetime.fromisoformat(str(start_time_raw).replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(str(end_time_raw).replace("Z", "+00:00"))
        except Exception as exc:
            return {
                "success": False,
                "error": f"Invalid start_time or end_time ISO format: {exc}",
                "summary": "Invalid date format for calendar event.",
                "data": None,
                "citations": [],
            }

        payload = CalendarEventCreate(
            title=title,
            start_time=start_time,
            end_time=end_time,
            description=params.get("description"),
            location=params.get("location"),
            timezone=params.get("timezone", "UTC"),
            all_day=params.get("all_day", False),
        )

        event = await CalendarService.create_event(db=db, owner_id=owner_id, data=payload)
        return {
            "success": True,
            "data": {
                "event_id": event.id,
                "title": event.title,
                "start_time": event.start_time.isoformat(),
                "end_time": event.end_time.isoformat(),
            },
            "summary": f"Created calendar event: '{event.title}' scheduled for {event.start_time.isoformat()}.",
            "citations": [],
        }

    @classmethod
    async def execute_reminder_create(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        title = params.get("title")
        scheduled_raw = params.get("scheduled_time")

        if not title or not scheduled_raw:
            return {
                "success": False,
                "error": "title and scheduled_time are required for reminder.",
                "summary": "Missing reminder parameters.",
                "data": None,
                "citations": [],
            }

        try:
            scheduled_time = datetime.fromisoformat(str(scheduled_raw).replace("Z", "+00:00"))
        except Exception as exc:
            return {
                "success": False,
                "error": f"Invalid scheduled_time ISO format: {exc}",
                "summary": "Invalid date format for reminder.",
                "data": None,
                "citations": [],
            }

        payload = ReminderCreate(
            title=title,
            scheduled_time=scheduled_time,
            task_id=params.get("task_id"),
            event_id=params.get("event_id"),
            timezone=params.get("timezone", "UTC"),
        )

        reminder = await ReminderService.create_reminder(db=db, owner_id=owner_id, data=payload)
        return {
            "success": True,
            "data": {
                "reminder_id": reminder.id,
                "title": reminder.title,
                "scheduled_time": reminder.scheduled_time.isoformat(),
            },
            "summary": f"Created reminder: '{reminder.title}' for {reminder.scheduled_time.isoformat()}.",
            "citations": [],
        }

    @classmethod
    async def execute_wifi_sensing(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        action = params.get("action", "check_availability")
        room_id = params.get("room_id")

        tool_result = await WifiSensingTool.execute(
            db=db,
            owner_id=owner_id,
            action=action,
            room_id=room_id,
        )

        disclaimer = tool_result.get("disclaimer") or (
            "NOTICE: Observations are algorithmic simulation proxies and do not represent real physical humans."
        )

        room_label = f"Room '{room_id}'" if room_id else "General"
        sensing_citation = {
            "source_type": "sensing",
            "citation_key": f"[Synthetic Observation: {room_label} (Simulated)]",
            "title": f"Wi-Fi Sensing Simulation: {action}",
            "is_simulated": True,
            "disclaimer": disclaimer,
        }

        return {
            "success": True,
            "data": tool_result,
            "summary": f"Wi-Fi sensing inspection '{action}' executed in simulation mode. {disclaimer}",
            "citations": [sensing_citation],
            "is_simulated": True,
        }

    @classmethod
    async def execute_general_synthesis(
        cls,
        db: AsyncSession,
        owner_id: str,
        params: Dict[str, Any],
        context: Optional[Dict[int, Any]] = None,
    ) -> Dict[str, Any]:
        prompt = params.get("prompt") or params.get("instructions") or params.get("query") or "Synthesize final workflow outcome."
        ctx = context or {}

        # Compile previous step outputs and citations into blackboard context
        context_blocks = []
        all_citations = []

        for step_num in sorted(ctx.keys()):
            res = ctx[step_num]
            if isinstance(res, dict):
                summary = res.get("summary", "")
                data = res.get("data")
                cits = res.get("citations", [])
                all_citations.extend(cits)

                block = f"--- Step {step_num} Output ---\nSummary: {summary}\n"
                if data:
                    block += f"Data: {json.dumps(data, default=str)}\n"
                context_blocks.append(block)

        aggregated_context = "\n\n".join(context_blocks)

        system_prompt = f"""You are the synthesis agent of the Unified AI Assistant.
Produce a comprehensive, grounded summary combining the outputs of preceding steps.

CRITICAL GROUNDING RULES:
1. Treat all outputs from previous steps as factual within their respective domains.
2. For web findings, preserve citations in the format [Web N: Title].
3. For document excerpts, preserve citations in the format [Doc: filename, Page X].
4. For Wi-Fi sensing, always explicitly state that data is synthetic/simulated.
5. If tasks, events, or reminders were created, note their details clearly.
6. Do not fabricate citations or external facts not present in the context.

PRECEDING WORKFLOW OUTPUTS:
{aggregated_context}
"""
        gateway = get_model_gateway()
        if not gateway.is_any_provider_configured():
            fallback_answer = (
                f"Workflow completed successfully across {len(ctx)} step(s).\n\n"
                f"Summary of results:\n"
            )
            for s_num in sorted(ctx.keys()):
                fallback_answer += f"- Step {s_num}: {ctx[s_num].get('summary', 'Done')}\n"
            return {
                "success": True,
                "data": {"synthesis": fallback_answer},
                "summary": fallback_answer,
                "citations": all_citations,
            }

        adapter, model_id = gateway.resolve_provider_and_model()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]

        try:
            synthesis_text = await adapter.generate_text(messages, model=model_id)
            return {
                "success": True,
                "data": {"synthesis": synthesis_text.strip()},
                "summary": synthesis_text.strip(),
                "citations": all_citations,
            }
        except Exception as exc:
            logger.warning("LLM synthesis failed, returning deterministic summary: %s", exc)
            fallback_summary = f"Workflow completed. Preceding steps summary:\n" + "\n".join(
                f"- Step {k}: {ctx[k].get('summary', '')}" for k in sorted(ctx.keys())
            )
            return {
                "success": True,
                "data": {"synthesis": fallback_summary},
                "summary": fallback_summary,
                "citations": all_citations,
            }


def register_default_capabilities() -> None:
    """Registers all 9 system capabilities into the global CapabilityRegistry."""
    registry = get_capability_registry()

    # 1. Knowledge Search
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.KNOWLEDGE_SEARCH.value,
            name="Knowledge Search (RAG)",
            description="Searches uploaded user documents and knowledge base for grounded excerpts and citations.",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search question or text query"},
                    "file_ids": {"type": "array", "items": {"type": "string"}},
                    "top_k": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "context_text": {"type": "string"},
                    "chunks_found": {"type": "integer"},
                },
            },
            required_permissions=["knowledge:read"],
            risk_level=CapabilityRiskLevel.LOW,
            requires_confirmation=False,
        ),
        CapabilityDispatcher.execute_knowledge_search,
    )

    # 2. Web Research
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.WEB_RESEARCH.value,
            name="Deep Web Research",
            description="Performs multi-source web investigation with domain allowlists, citations, and reporting.",
            input_schema={
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "depth": {"type": "string", "enum": ["quick", "standard", "deep"]},
                    "allowed_domains": {"type": "array", "items": {"type": "string"}},
                    "max_sources": {"type": "integer", "default": 3},
                },
                "required": ["question"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "job_id": {"type": "string"},
                    "status": {"type": "string"},
                    "summary": {"type": "string"},
                    "report": {"type": "string"},
                    "sources_count": {"type": "integer"},
                },
            },
            required_permissions=["research:execute"],
            risk_level=CapabilityRiskLevel.LOW,
            requires_confirmation=False,
        ),
        CapabilityDispatcher.execute_web_research,
    )

    # 3. Autonomous Browser Action (Consequential)
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.BROWSER_ACTION.value,
            name="Autonomous Browser Action",
            description="Navigates target web pages, inspects web content, or executes automation via Playwright sandbox.",
            input_schema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "format": "uri"},
                    "task_description": {"type": "string"},
                    "allowed_domains": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["url"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "task_description": {"type": "string"},
                    "initial_url": {"type": "string"},
                    "status": {"type": "string"},
                },
            },
            required_permissions=["browser:navigate"],
            risk_level=CapabilityRiskLevel.CONSEQUENTIAL,
            requires_confirmation=True,
        ),
        CapabilityDispatcher.execute_browser_action,
    )

    # 4. Task Create (Consequential)
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.TASK_CREATE.value,
            name="Task Creation",
            description="Creates a persistent personal task with title, priority, due date, and timezone.",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "due_date": {"type": "string", "format": "date-time"},
                    "timezone": {"type": "string"},
                },
                "required": ["title"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "title": {"type": "string"},
                    "priority": {"type": "string"},
                    "due_date": {"type": "string"},
                },
            },
            required_permissions=["tasks:write"],
            risk_level=CapabilityRiskLevel.CONSEQUENTIAL,
            requires_confirmation=True,
        ),
        CapabilityDispatcher.execute_task_create,
    )

    # 5. Task Update (Consequential)
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.TASK_UPDATE.value,
            name="Task Modification",
            description="Modifies an existing task's status, priority, or content.",
            input_schema={
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "status": {"type": "string"},
                    "priority": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["task_id"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "task_id": {"type": "string"},
                    "status": {"type": "string"},
                    "priority": {"type": "string"},
                },
            },
            required_permissions=["tasks:write"],
            risk_level=CapabilityRiskLevel.CONSEQUENTIAL,
            requires_confirmation=True,
        ),
        CapabilityDispatcher.execute_task_update,
    )

    # 6. Calendar Event Create (Consequential)
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.CALENDAR_EVENT_CREATE.value,
            name="Calendar Event Scheduling",
            description="Schedules a calendar event with start/end timestamps and location.",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "start_time": {"type": "string", "format": "date-time"},
                    "end_time": {"type": "string", "format": "date-time"},
                    "description": {"type": "string"},
                    "location": {"type": "string"},
                    "timezone": {"type": "string"},
                },
                "required": ["title", "start_time", "end_time"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "event_id": {"type": "string"},
                    "title": {"type": "string"},
                    "start_time": {"type": "string"},
                    "end_time": {"type": "string"},
                },
            },
            required_permissions=["calendar:write"],
            risk_level=CapabilityRiskLevel.CONSEQUENTIAL,
            requires_confirmation=True,
        ),
        CapabilityDispatcher.execute_calendar_event_create,
    )

    # 7. Reminder Create (Consequential)
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.REMINDER_CREATE.value,
            name="Reminder Scheduling",
            description="Creates a time-based in-app reminder alert linked to a task or standalone.",
            input_schema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "scheduled_time": {"type": "string", "format": "date-time"},
                    "task_id": {"type": "string"},
                    "event_id": {"type": "string"},
                },
                "required": ["title", "scheduled_time"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "reminder_id": {"type": "string"},
                    "title": {"type": "string"},
                    "scheduled_time": {"type": "string"},
                },
            },
            required_permissions=["reminders:write"],
            risk_level=CapabilityRiskLevel.CONSEQUENTIAL,
            requires_confirmation=True,
        ),
        CapabilityDispatcher.execute_reminder_create,
    )

    # 8. Wi-Fi Sensing Query
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.WIFI_SENSING_QUERY.value,
            name="Wi-Fi Sensing Observation",
            description="Queries synthetic Wi-Fi sensing activity/presence simulation for designated rooms.",
            input_schema={
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["check_availability", "get_status", "list_rooms"]},
                    "room_id": {"type": "string"},
                },
                "required": ["room_id"],
            },
            output_schema={
                "type": "object",
                "properties": {
                    "disclaimer": {"type": "string"},
                    "room_id": {"type": "string"},
                    "is_simulated": {"type": "boolean"},
                },
            },
            required_permissions=["sensing:read"],
            risk_level=CapabilityRiskLevel.LOW,
            requires_confirmation=False,
        ),
        CapabilityDispatcher.execute_wifi_sensing,
    )

    # 9. General Synthesis
    registry.register(
        CapabilityDefinition(
            identifier=CapabilityType.GENERAL_SYNTHESIS.value,
            name="Multi-Source Grounded Synthesis",
            description="Synthesizes multi-step findings, preserves source citations, and generates grounded conclusions.",
            input_schema={
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "instructions": {"type": "string"},
                    "query": {"type": "string"},
                },
            },
            output_schema={
                "type": "object",
                "properties": {
                    "synthesis": {"type": "string"},
                },
            },
            required_permissions=["gateway:generate"],
            risk_level=CapabilityRiskLevel.LOW,
            requires_confirmation=False,
        ),
        CapabilityDispatcher.execute_general_synthesis,
    )


# Automatically register all default capabilities upon module load
register_default_capabilities()
