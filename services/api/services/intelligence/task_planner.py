import logging
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from .context_manager import UnifiedContext
from .intent_classifier import AssistantIntent, IntentClassificationResult
from .tool_selector import ToolSelectionPlan

logger = logging.getLogger("intelligence.task_planner")


class ExecutionStep(BaseModel):
    step_number: int
    title: str
    capability: str
    assigned_agent: str
    description: str
    is_consequential: bool = False
    verification_criteria: str


class StructuredPlan(BaseModel):
    plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_goal: str
    steps: List[ExecutionStep] = Field(default_factory=list)
    risk_level: str = "low"  # low | medium | high
    requires_approval: bool = False
    estimated_duration_seconds: int = 10


class TaskPlanner:
    """Decomposes user objectives into an execution plan with agent assignments and verification criteria."""

    @classmethod
    def generate_plan(
        cls,
        user_goal: str,
        classification: IntentClassificationResult,
        context: UnifiedContext,
        tool_plan: ToolSelectionPlan,
    ) -> StructuredPlan:
        intent = classification.intent
        steps: List[ExecutionStep] = []
        requires_approval = tool_plan.requires_human_approval
        risk_level = "high" if requires_approval else ("medium" if classification.complexity == "complex" else "low")

        # 1. BROWSER WORKFLOW PLAN
        if intent == AssistantIntent.BROWSER_AGENT:
            target_url = classification.extracted_entities.get("target_url") or "target website"
            steps.append(ExecutionStep(
                step_number=1,
                title="Initialize Browser Session & Navigate",
                capability="browser_worker",
                assigned_agent="browser_execution_agent",
                description=f"Launch isolated browser instance and navigate to {target_url}.",
                verification_criteria="Page load event completed and valid DOM initialized.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Perceive & Execute Actions",
                capability="browser_worker",
                assigned_agent="browser_execution_agent",
                description="Extract interactive DOM, resolve elements, and execute actions with adaptive fallback.",
                is_consequential=requires_approval,
                verification_criteria="Required form inputs populated or interactive target triggered.",
            ))
            steps.append(ExecutionStep(
                step_number=3,
                title="Verify Outcome with Evidence",
                capability="browser_worker",
                assigned_agent="verification_agent",
                description="Capture final viewport screenshot and verify success confirmation state.",
                verification_criteria="Confirmation message or expected DOM element confirmed visible.",
            ))

        # 2. RESEARCH WORKFLOW PLAN
        elif intent == AssistantIntent.RESEARCH:
            steps.append(ExecutionStep(
                step_number=1,
                title="Formulate Research Queries",
                capability="research_synthesizer",
                assigned_agent="research_agent",
                description="Extract search queries and target reference domains from objective.",
                verification_criteria="At least 2 search queries generated.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Collect & Inspect Source Evidence",
                capability="research_synthesizer",
                assigned_agent="research_agent",
                description="Query search providers, fetch candidate pages, and extract grounded facts.",
                verification_criteria="Minimum 3 sources retrieved and parsed without errors.",
            ))
            steps.append(ExecutionStep(
                step_number=3,
                title="Synthesize Comparative Report",
                capability="research_synthesizer",
                assigned_agent="reporting_agent",
                description="Synthesize structured markdown findings with inline verified citations.",
                verification_criteria="Report contains findings, citations, and source URLs.",
            ))

        # 3. AUTONOMOUS CODING PLAN
        elif intent == AssistantIntent.AUTONOMOUS_CODING:
            steps.append(ExecutionStep(
                step_number=1,
                title="Inspect Project Workspace",
                capability="coding_sandbox",
                assigned_agent="coding_agent",
                description="Analyze repository structure, configuration, and target files.",
                verification_criteria="Target files and relevant symbols identified.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Implement Code Modifications",
                capability="coding_sandbox",
                assigned_agent="coding_agent",
                description="Apply code changes adhering strictly to project patterns.",
                verification_criteria="Modified files pass syntax validation.",
            ))
            steps.append(ExecutionStep(
                step_number=3,
                title="Execute Automated Tests & Verify",
                capability="coding_sandbox",
                assigned_agent="verification_agent",
                description="Run relevant test suites, parse test outcome, and confirm build passing.",
                verification_criteria="All tests exit with status code 0.",
            ))

        # 4. DATA ANALYSIS PLAN
        elif intent == AssistantIntent.DATA_ANALYSIS:
            steps.append(ExecutionStep(
                step_number=1,
                title="Load & Validate Dataset",
                capability="data_analyzer",
                assigned_agent="data_analysis_agent",
                description="Parse tabular data, validate schema, and clean missing values.",
                verification_criteria="Dataset dimensions and column types established.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Compute Statistical Metrics & Trends",
                capability="data_analyzer",
                assigned_agent="data_analysis_agent",
                description="Perform mathematical calculations, descriptive stats, and correlations.",
                verification_criteria="Quantitative metrics calculated without hallucination.",
            ))

        # 5. DOCUMENT INTELLIGENCE PLAN
        elif intent == AssistantIntent.DOCUMENT_INTELLIGENCE:
            steps.append(ExecutionStep(
                step_number=1,
                title="Extract Document Text & Structure",
                capability="file_extractor",
                assigned_agent="file_processing_agent",
                description="Extract text, headers, and tables from specified documents.",
                verification_criteria="Document text extracted and indexed.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Analyze Content & Extract Grounded Answers",
                capability="file_extractor",
                assigned_agent="reporting_agent",
                description="Extract specific criteria, answer queries, and format deliverables.",
                verification_criteria="Answers grounded directly in document chunks with citations.",
            ))

        # 6. CALENDAR & AUTOMATION PLAN
        elif intent == AssistantIntent.CALENDAR_AUTOMATION:
            steps.append(ExecutionStep(
                step_number=1,
                title="Parse Schedule or Reminder Parameters",
                capability="calendar_scheduler",
                assigned_agent="planning_agent",
                description="Extract date, time, title, priority, or recurrence rule.",
                verification_criteria="Valid ISO timestamp or recurrence rule established.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Commit Task / Event to Calendar Store",
                capability="calendar_scheduler",
                assigned_agent="planning_agent",
                description="Persist schedule and activate reminder trigger.",
                verification_criteria="Record saved to database with unique identifier.",
            ))

        # 7. MULTI-AGENT WORKFLOW PLAN
        elif intent == AssistantIntent.MULTI_AGENT_WORKFLOW:
            steps.append(ExecutionStep(
                step_number=1,
                title="Decompose Multi-Domain Objective",
                capability="multi_agent_orchestrator",
                assigned_agent="planning_agent",
                description="Decompose goal into synchronized research, browser, and reporting stages.",
                verification_criteria="Stage dependency graph constructed.",
            ))
            steps.append(ExecutionStep(
                step_number=2,
                title="Gather Evidence via Research & Browser",
                capability="multi_agent_orchestrator",
                assigned_agent="research_agent",
                description="Execute concurrent data gathering and web inspection.",
                verification_criteria="Cross-domain evidence artifacts generated.",
            ))
            steps.append(ExecutionStep(
                step_number=3,
                title="Synthesize Comprehensive Deliverable",
                capability="multi_agent_orchestrator",
                assigned_agent="reporting_agent",
                description="Compile findings into cohesive presentation/report artifact.",
                verification_criteria="Final deliverable formatted with verified citations.",
            ))
            steps.append(ExecutionStep(
                step_number=4,
                title="Independent Audit & Verification",
                capability="multi_agent_orchestrator",
                assigned_agent="verification_agent",
                description="Audit output completeness against original goal criteria.",
                verification_criteria="All user requirements verified with authentic evidence.",
            ))

        # 8. CONVERSATIONAL DIRECT
        else:
            steps.append(ExecutionStep(
                step_number=1,
                title="Generate Grounded Conversational Response",
                capability="llm_chat",
                assigned_agent="planning_agent",
                description="Formulate direct, context-aware answer using model gateway.",
                verification_criteria="Response generated without errors.",
            ))

        return StructuredPlan(
            user_goal=user_goal,
            steps=steps,
            risk_level=risk_level,
            requires_approval=requires_approval,
            estimated_duration_seconds=len(steps) * 5,
        )
