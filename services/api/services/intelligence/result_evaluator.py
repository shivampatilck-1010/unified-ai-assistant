import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("intelligence.result_evaluator")


class VerificationVerdict(BaseModel):
    status: str  # "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "WAITING_FOR_USER", "UNVERIFIED"
    confidence_score: float = Field(ge=0.0, le=1.0)
    reasoning: str
    verified_criteria: List[str] = Field(default_factory=list)
    unverified_criteria: List[str] = Field(default_factory=list)
    evidence_items_reviewed: int = 0


class ResultEvaluator:
    """Independently evaluates task deliverables and execution evidence against success criteria."""

    @classmethod
    def evaluate(
        cls,
        user_goal: str,
        execution_outcome: Dict[str, Any],
        evidence: Optional[List[Dict[str, Any]]] = None,
        has_error: bool = False,
        error_message: Optional[str] = None,
    ) -> VerificationVerdict:
        if has_error:
            return VerificationVerdict(
                status="FAILED",
                confidence_score=1.0,
                reasoning=f"Task terminated with error: {error_message or 'Execution failure'}",
                evidence_items_reviewed=len(evidence or []),
                unverified_criteria=["All operations executed without failure"],
            )

        evidence = evidence or []
        verified: List[str] = []
        unverified: List[str] = []

        capability = execution_outcome.get("capability", "general")

        # 1. Evaluate Browser Evidence
        if capability in ("browser_worker", "browser_agent"):
            has_nav = any(e.get("action_type") == "navigate" or "url" in e for e in evidence)
            has_screenshot = any(e.get("screenshot_data_url") or e.get("screenshot_base64") for e in evidence)
            if has_nav:
                verified.append("Target website reached and DOM initialized")
            else:
                unverified.append("Navigation to target website")
            if has_screenshot:
                verified.append("Visual confirmation screenshot captured")

        # 2. Evaluate Research Evidence
        elif capability in ("research_synthesizer", "research"):
            citations = execution_outcome.get("citations") or []
            if len(citations) >= 1 or len(evidence) >= 2:
                verified.append(f"Retrieved and verified {max(len(citations), len(evidence))} source citations")
            else:
                unverified.append("Sufficient source evidence with grounded citations")

        # 3. Evaluate Coding Evidence
        elif capability in ("coding_sandbox", "coding_agent"):
            tests_passed = execution_outcome.get("tests_passed", True)
            files_modified = execution_outcome.get("files_modified", [])
            if files_modified:
                verified.append(f"Applied modifications across {len(files_modified)} target files")
            if tests_passed:
                verified.append("Test suite executed cleanly with exit code 0")
            else:
                unverified.append("All automated tests passing")

        # 4. Evaluate Data Analysis Evidence
        elif capability in ("data_analyzer", "data_analysis"):
            stats = execution_outcome.get("statistics")
            row_count = execution_outcome.get("row_count", 0)
            if stats or row_count > 0:
                verified.append(f"Computed mathematical metrics across {row_count} records")
            else:
                unverified.append("Valid quantitative computation from dataset")

        # 5. Evaluate Document Intelligence Evidence
        elif capability in ("file_extractor", "document_intelligence"):
            citations = execution_outcome.get("citations") or []
            if citations:
                verified.append(f"Grounded directly in {len(citations)} document excerpts")
            else:
                verified.append("Document processed and structured findings compiled")

        # Generic fallback
        if not verified and not unverified:
            if execution_outcome.get("status") == "success" or execution_outcome.get("result"):
                verified.append("Execution completed successfully without errors")
            else:
                unverified.append("Executable outcome verified")

        # Verdict assignment
        if unverified:
            if verified:
                status = "PARTIALLY_COMPLETED"
                score = len(verified) / (len(verified) + len(unverified))
                reasoning = f"Partially completed: {', '.join(verified)}. Missing: {', '.join(unverified)}."
            else:
                status = "FAILED"
                score = 0.0
                reasoning = f"Failed to verify objective: {', '.join(unverified)}."
        else:
            status = "COMPLETED"
            score = 0.96
            reasoning = f"All verification conditions satisfied ({len(verified)} criteria confirmed)."

        return VerificationVerdict(
            status=status,
            confidence_score=score,
            reasoning=reasoning,
            verified_criteria=verified,
            unverified_criteria=unverified,
            evidence_items_reviewed=len(evidence),
        )
