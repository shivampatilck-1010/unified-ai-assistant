import logging
from typing import Any, Dict, List, Optional
from .context_manager import UnifiedContext
from .result_evaluator import VerificationVerdict
from .task_planner import StructuredPlan

logger = logging.getLogger("intelligence.response_generator")


class ResponseGenerator:
    """Synthesizes transparent, grounded final responses with evidence, citations, and status badges."""

    @classmethod
    def format_final_response(
        cls,
        user_goal: str,
        plan: StructuredPlan,
        execution_outcome: Dict[str, Any],
        verdict: VerificationVerdict,
        context: UnifiedContext,
    ) -> str:
        blocks: List[str] = []

        # 1. Main summary or result text
        result_text = execution_outcome.get("result_summary") or execution_outcome.get("result") or execution_outcome.get("text")
        if not result_text:
            if verdict.status == "COMPLETED":
                result_text = f"Successfully completed objective: **{user_goal}**."
            else:
                result_text = f"Task execution finished with status: **{verdict.status}**."

        blocks.append(result_text)

        # 2. Citations / References block if available
        citations = execution_outcome.get("citations") or []
        if citations:
            blocks.append("\n### 📚 Sources & Verified Citations")
            for i, c in enumerate(citations[:6]):
                if isinstance(c, dict):
                    title = c.get("title") or c.get("filename") or f"Source {i+1}"
                    url = c.get("url") or c.get("source_url")
                    snippet = c.get("snippet", "")[:120]
                    if url:
                        blocks.append(f"- **[{title}]({url})**: \"{snippet}...\"" if snippet else f"- **[{title}]({url})**")
                    else:
                        blocks.append(f"- **{title}**: \"{snippet}...\"" if snippet else f"- **{title}**")
                else:
                    blocks.append(f"- {c}")

        # 3. File Artifacts block if generated or downloaded
        artifacts = execution_outcome.get("artifacts") or execution_outcome.get("downloaded_files") or []
        if artifacts:
            blocks.append("\n### 💾 Generated Artifacts")
            for f in artifacts:
                if isinstance(f, dict):
                    name = f.get("filename") or f.get("name") or "File"
                    size_kb = (f.get("file_size_bytes") or 0) / 1024
                    blocks.append(f"- 📄 **{name}** ({size_kb:.1f} KB)")
                else:
                    blocks.append(f"- 📄 {f}")

        # 4. Independent Verification Footer
        verif_badge = "✅ **Verified Complete**" if verdict.status == "COMPLETED" else f"ℹ️ **Status: {verdict.status}**"
        verif_details = [
            f"{verif_badge} (Score: {int(verdict.confidence_score * 100)}%)",
        ]
        if verdict.verified_criteria:
            verif_details.append(f"- *Verified: {'; '.join(verdict.verified_criteria)}*")
        if verdict.unverified_criteria:
            verif_details.append(f"- *Pending/Unverified: {'; '.join(verdict.unverified_criteria)}*")

        blocks.append("\n---\n" + "\n".join(verif_details))

        return "\n\n".join(blocks)
