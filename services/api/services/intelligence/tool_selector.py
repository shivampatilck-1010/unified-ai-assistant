import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from .context_manager import UnifiedContext
from .intent_classifier import AssistantIntent, IntentClassificationResult

logger = logging.getLogger("intelligence.tool_selector")


class ToolSelectionPlan(BaseModel):
    primary_capability: str
    supporting_tools: List[str] = Field(default_factory=list)
    requires_human_approval: bool = False
    approval_reason: Optional[str] = None
    execution_mode: str = "direct"  # direct | staged_workflow | background_job
    selected_model_hint: str = "standard"


class ToolSelector:
    """Selects the minimal, reliable capability and toolchain for a classified intent."""

    @classmethod
    def select_tools(
        cls,
        classification: IntentClassificationResult,
        context: UnifiedContext,
    ) -> ToolSelectionPlan:
        intent = classification.intent
        entities = classification.extracted_entities
        has_files = bool(context.pinned_file_ids or entities.get("has_file_context"))

        # 1. Conversational Chat
        if intent == AssistantIntent.CONVERSATIONAL:
            supporting = ["project_guidance"] if context.project_guidance else []
            if has_files:
                supporting.append("knowledge_rag")
            return ToolSelectionPlan(
                primary_capability="llm_chat",
                supporting_tools=supporting,
                execution_mode="direct",
                selected_model_hint="standard",
            )

        # 2. Browser Agent / Computer Use
        if intent == AssistantIntent.BROWSER_AGENT:
            raw_p = entities.get("raw_prompt", "").lower()
            is_conseq = any(w in raw_p for w in ("buy", "order", "purchase", "pay", "delete", "destroy", "submit form"))
            return ToolSelectionPlan(
                primary_capability="browser_worker",
                supporting_tools=["universal_perception", "adaptive_interaction", "self_recovery", "checkpoint_manager"],
                requires_human_approval=is_conseq,
                approval_reason="Action involves consequential web mutation or financial transaction." if is_conseq else None,
                execution_mode="staged_workflow",
                selected_model_hint="standard",
            )

        # 3. Advanced Research
        if intent == AssistantIntent.RESEARCH:
            return ToolSelectionPlan(
                primary_capability="research_synthesizer",
                supporting_tools=["web_collector", "citation_verifier", "evidence_evaluator"],
                execution_mode="staged_workflow",
                selected_model_hint="standard",
            )

        # 4. Autonomous Coding Agent
        if intent == AssistantIntent.AUTONOMOUS_CODING:
            return ToolSelectionPlan(
                primary_capability="coding_sandbox",
                supporting_tools=["repo_inspector", "code_modifier", "test_runner", "build_verifier"],
                requires_human_approval=False,
                execution_mode="staged_workflow",
                selected_model_hint="reasoning",
            )

        # 5. Data Analysis
        if intent == AssistantIntent.DATA_ANALYSIS:
            return ToolSelectionPlan(
                primary_capability="data_analyzer",
                supporting_tools=["csv_parser", "stat_calculator", "chart_generator"],
                execution_mode="direct",
                selected_model_hint="standard",
            )

        # 6. Document Intelligence
        if intent == AssistantIntent.DOCUMENT_INTELLIGENCE:
            return ToolSelectionPlan(
                primary_capability="file_extractor",
                supporting_tools=["pdf_parser", "docx_parser", "semantic_chunker", "rag_retriever"],
                execution_mode="direct",
                selected_model_hint="standard",
            )

        # 7. Calendar & Automation
        if intent == AssistantIntent.CALENDAR_AUTOMATION:
            return ToolSelectionPlan(
                primary_capability="calendar_scheduler",
                supporting_tools=["task_extractor", "reminder_dispatcher", "recurrence_engine"],
                execution_mode="direct",
                selected_model_hint="fast",
            )

        # 8. Multi-Agent Workflow
        return ToolSelectionPlan(
            primary_capability="multi_agent_orchestrator",
            supporting_tools=["planning_agent", "research_agent", "browser_agent", "reporting_agent", "verification_agent"],
            execution_mode="staged_workflow",
            selected_model_hint="reasoning",
        )
