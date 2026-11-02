import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("orchestrator.multi_agent")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgentRole(str, Enum):
    PLANNING = "planning_agent"
    RESEARCH = "research_agent"
    BROWSER_EXECUTION = "browser_execution_agent"
    FILE_PROCESSING = "file_processing_agent"
    VERIFICATION = "verification_agent"


class AgentHandoffEvent(BaseModel):
    from_agent: str
    to_agent: str
    reason: str
    timestamp: str = Field(default_factory=utc_now_iso)
    context_data: Optional[Dict[str, Any]] = None


class VerificationVerdict(BaseModel):
    status: str  # "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "WAITING_FOR_USER", "UNVERIFIED"
    confidence_score: float  # 0.0 - 1.0
    reasoning: str
    verified_criteria: List[str] = Field(default_factory=list)
    unverified_criteria: List[str] = Field(default_factory=list)
    evidence_items_reviewed: int = 0


class MultiAgentOrchestrator:
    """Coordinates specialized agents (Planning, Research, Browser, Files, Verification) for autonomous workflows."""

    def __init__(self, model_gateway: Optional[Any] = None):
        self.model_gateway = model_gateway

    def create_initial_stages(self, user_goal: str, initial_url: Optional[str] = None) -> List[Dict[str, Any]]:
        """Decomposes a complex goal into structured multi-agent stages."""
        has_file_task = any(term in user_goal.lower() for term in ["download", "pdf", "csv", "sheet", "export", "file"])
        has_research = any(term in user_goal.lower() for term in ["research", "compare", "search", "investigate"])

        stages = [
            {
                "id": "stage_1_plan",
                "name": "Decomposition & Strategy",
                "assigned_agent": AgentRole.PLANNING.value,
                "status": "completed",
                "subtasks": ["Analyze user intent", "Define verification conditions", "Generate safe action sequence"],
            },
        ]

        if has_research:
            stages.append({
                "id": "stage_2_research",
                "name": "Knowledge & Context Gathering",
                "assigned_agent": AgentRole.RESEARCH.value,
                "status": "pending",
                "subtasks": ["Query domain references", "Identify target URL paths"],
            })

        stages.append({
            "id": "stage_3_execution",
            "name": "Autonomous Browser Execution",
            "assigned_agent": AgentRole.BROWSER_EXECUTION.value,
            "status": "in_progress",
            "subtasks": [
                f"Navigate to {initial_url or 'target site'}",
                "Observe page state & interactive DOM",
                "Execute planned actions with self-correction",
                "Capture checkpoint snapshots",
            ],
        })

        if has_file_task:
            stages.append({
                "id": "stage_4_files",
                "name": "File Intelligence & Processing",
                "assigned_agent": AgentRole.FILE_PROCESSING.value,
                "status": "pending",
                "subtasks": ["Save downloaded assets", "Inspect PDF/spreadsheet contents", "Extract relevant metrics"],
            })

        stages.append({
            "id": "stage_5_verify",
            "name": "Evidence-Based Verification",
            "assigned_agent": AgentRole.VERIFICATION.value,
            "status": "pending",
            "subtasks": [
                "Audit final DOM and visible text",
                "Verify success indicators against user criteria",
                "Issue final verification verdict",
            ],
        })

        return stages

    async def verify_task_completion(
        self,
        task_description: str,
        evidence: List[Dict[str, Any]],
        downloaded_files: Optional[List[Dict[str, Any]]] = None,
        final_summary: Optional[str] = None,
        has_error: bool = False,
        error_message: Optional[str] = None,
    ) -> VerificationVerdict:
        """VerificationAgent independently audits collected evidence against original goal."""
        if has_error:
            return VerificationVerdict(
                status="FAILED",
                confidence_score=1.0,
                reasoning=f"Task aborted with error: {error_message or 'Execution failure'}",
                evidence_items_reviewed=len(evidence),
                unverified_criteria=["All actions succeeded without unrecovered errors"],
            )

        if not evidence:
            return VerificationVerdict(
                status="UNVERIFIED",
                confidence_score=0.2,
                reasoning="No evidence recorded during task execution.",
                evidence_items_reviewed=0,
            )

        verified_criteria: List[str] = []
        unverified_criteria: List[str] = []

        # 1. Check navigation evidence
        has_nav = any(e.get("action_type") == "navigate" or "url" in e for e in evidence)
        if has_nav:
            verified_criteria.append("Target website reached and DOM initialized")
        else:
            unverified_criteria.append("Navigation to target website")

        # 2. Check visual screenshots
        has_screenshots = any(e.get("screenshot_data_url") or e.get("screenshot_url") for e in evidence)
        if has_screenshots:
            verified_criteria.append("Visual viewport evidence captured")

        # 3. Check file requirements
        req_files = any(term in task_description.lower() for term in ["download", "pdf", "csv", "file", "export"])
        if req_files:
            if downloaded_files and len(downloaded_files) > 0:
                verified_criteria.append(f"Retrieved and inspected {len(downloaded_files)} file artifact(s)")
            else:
                unverified_criteria.append("Download and inspect required file artifact")

        # 4. Check text reading / DOM inspection
        has_inspection = any(e.get("action_type") in ("read_text", "inspect", "extract_table") for e in evidence)
        if has_inspection:
            verified_criteria.append("Page DOM content inspected and analyzed")

        # 5. Determine overall verdict
        if unverified_criteria:
            if verified_criteria:
                status = "PARTIALLY_COMPLETED"
                score = len(verified_criteria) / (len(verified_criteria) + len(unverified_criteria))
                reasoning = f"Partially completed: {', '.join(verified_criteria)}. Missing: {', '.join(unverified_criteria)}."
            else:
                status = "FAILED"
                score = 0.0
                reasoning = f"Failed to verify user objective: {', '.join(unverified_criteria)}."
        else:
            status = "COMPLETED"
            score = 0.95
            reasoning = f"All verification conditions satisfied ({len(verified_criteria)} criteria confirmed)."

        logger.info(
            "[VERIFICATION_AGENT] Verdict: %s (confidence: %.2f) for task: '%s'",
            status,
            score,
            task_description[:60],
        )

        return VerificationVerdict(
            status=status,
            confidence_score=score,
            reasoning=reasoning,
            verified_criteria=verified_criteria,
            unverified_criteria=unverified_criteria,
            evidence_items_reviewed=len(evidence),
        )
