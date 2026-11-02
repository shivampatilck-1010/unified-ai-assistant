import logging
from typing import Any, Callable, Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .context_manager import ContextManager, UnifiedContext
from .execution_controller import ExecutionController
from .intent_classifier import IntentClassificationResult, IntentClassifier
from .reasoning_engine import ReasoningEngine
from .response_generator import ResponseGenerator
from .result_evaluator import ResultEvaluator, VerificationVerdict
from .task_planner import StructuredPlan, TaskPlanner
from .tool_selector import ToolSelectionPlan, ToolSelector

logger = logging.getLogger("intelligence.core")


class IntelligenceCore:
    """The central intelligence operating system coordinating understanding, planning, execution, and verification."""

    def __init__(self, model_gateway: Optional[Any] = None):
        self.reasoning_engine = ReasoningEngine(model_gateway)

    async def process(
        self,
        db: AsyncSession,
        user_id: str,
        message: str,
        conversation_id: Optional[str] = None,
        project_id: Optional[str] = None,
        file_ids: Optional[List[str]] = None,
        on_progress: Optional[Callable[[str], Any]] = None,
    ) -> Dict[str, Any]:
        """End-to-end execution pipeline: Understand -> Plan -> Observe -> Act -> Verify -> Synthesize."""
        logger.info("Intelligence Core processing request for user %s: '%s'", user_id, message[:60])

        # 1. UNDERSTAND: Context Aggregation & Reference Resolution
        context: UnifiedContext = await ContextManager.resolve_context(
            db=db,
            user_id=user_id,
            conversation_id=conversation_id,
            project_id=project_id,
            explicit_file_ids=file_ids,
            current_prompt=message,
        )

        # 2. CLASSIFY: Intent & Entity Extraction
        classification: IntentClassificationResult = IntentClassifier.classify(
            prompt=message,
            context={"file_ids": context.pinned_file_ids},
        )
        logger.info("Intent classified as %s (confidence: %.2f)", classification.intent.value, classification.confidence)

        # 3. SELECT TOOLS: Minimal, reliable toolchain
        tool_plan: ToolSelectionPlan = ToolSelector.select_tools(
            classification=classification,
            context=context,
        )

        # 4. PLAN: Decompose into verifiable stages
        plan: StructuredPlan = TaskPlanner.generate_plan(
            user_goal=message,
            classification=classification,
            context=context,
            tool_plan=tool_plan,
        )

        # 5. ACT: Execute via ExecutionController (or direct LLM chat if conversational)
        if tool_plan.primary_capability == "llm_chat":
            # Direct conversational stream is handled by streaming service; return classification & plan
            return {
                "is_conversational_direct": True,
                "classification": classification,
                "tool_plan": tool_plan,
                "plan": plan,
                "context": context,
            }

        exec_res = await ExecutionController.execute_plan(
            db=db,
            plan=plan,
            context=context,
            on_step_progress=on_progress,
        )

        execution_outcome = exec_res.get("execution_outcome", {})
        evidence = exec_res.get("evidence", [])

        # 6. VERIFY: Independent verification audit
        verdict: VerificationVerdict = ResultEvaluator.evaluate(
            user_goal=message,
            execution_outcome=execution_outcome,
            evidence=evidence,
            has_error=(execution_outcome.get("status") == "failed"),
            error_message=execution_outcome.get("error"),
        )

        # 7. SYNTHESIZE: Formulate structured user-facing deliverable
        final_markdown = ResponseGenerator.format_final_response(
            user_goal=message,
            plan=plan,
            execution_outcome=execution_outcome,
            verdict=verdict,
            context=context,
        )

        return {
            "is_conversational_direct": False,
            "classification": classification,
            "tool_plan": tool_plan,
            "plan": plan,
            "execution_outcome": execution_outcome,
            "evidence": evidence,
            "verdict": verdict,
            "response_markdown": final_markdown,
            "context": context,
        }
