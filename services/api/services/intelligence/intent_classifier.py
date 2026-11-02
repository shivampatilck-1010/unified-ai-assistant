import logging
import re
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("intelligence.intent_classifier")


class AssistantIntent(str, Enum):
    CONVERSATIONAL = "conversational"
    RESEARCH = "research"
    BROWSER_AGENT = "browser_agent"
    DOCUMENT_INTELLIGENCE = "document_intelligence"
    AUTONOMOUS_CODING = "autonomous_coding"
    DATA_ANALYSIS = "data_analysis"
    CALENDAR_AUTOMATION = "calendar_automation"
    MULTI_AGENT_WORKFLOW = "multi_agent_workflow"


class IntentClassificationResult(BaseModel):
    intent: AssistantIntent
    confidence: float = Field(ge=0.0, le=1.0)
    complexity: str = "simple"  # simple | moderate | complex
    extracted_entities: Dict[str, Any] = Field(default_factory=dict)
    reasoning: str
    suggested_model_tier: str = "standard"  # fast | standard | reasoning


class IntentClassifier:
    """Classifies user intent, identifies required capabilities, and extracts operational parameters."""

    URL_REGEX = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)

    RESEARCH_PATTERNS = [
        r"\bresearch\b",
        r"\bcompare\s+(?:products|services|alternatives|universities|models|options)\b",
        r"\bfind\s+(?:best|top|latest|alternatives)\b",
        r"\bmarket\s+analysis\b",
        r"\bliterature\s+review\b",
        r"\binvestigate\b",
        r"\bdeep\s+dive\s+into\b",
    ]

    BROWSER_PATTERNS = [
        r"\b(?:open|navigate\s+to|visit|go\s+to|browse)\s+(?:https?://|website|page|portal|url)\b",
        r"\b(?:fill\s+out|submit|complete)\s+(?:the\s+)?(?:form|lesson|survey|application|quiz)\b",
        r"\bclick\s+(?:on\s+)?(?:the\s+)?(?:button|link)\b",
        r"\bdownload\s+(?:from|via)\s+(?:the\s+)?(?:website|portal|page)\b",
    ]

    CODING_PATTERNS = [
        r"\b(?:build|write|create|develop)\s+(?:a\s+)?(?:full-stack\s+)?(?:app|application|script|program|module|function|backend|frontend)\b",
        r"\b(?:fix|debug|resolve)\s+(?:the\s+)?(?:error|bug|issue|exception|failure)\b",
        r"\b(?:run|execute)\s+(?:unit\s+)?tests?\b",
        r"\brefactor\b",
        r"\banalyse\s+my\s+project\b",
        r"\bcheck\s+(?:build|compiler|linter)\b",
    ]

    DOCUMENT_PATTERNS = [
        r"\b(?:analyse|analyze|inspect|read|summarize|extract)\s+(?:these\s+|the\s+|this\s+)?(?:documents?|pdf|docx?|pptx?|files?|study\s+material)\b",
        r"\b(?:upload|download)\s+these\s+documents\b",
        r"\bextract\s+(?:the\s+)?important\s+information\b",
    ]

    DATA_ANALYSIS_PATTERNS = [
        r"\b(?:analyse|analyze)\s+(?:this\s+|the\s+)?(?:csv|spreadsheet|xlsx|dataset|dataframe|table)\b",
        r"\b(?:compute|calculate)\s+(?:statistics|metrics|correlation|trends?|mean|median)\b",
        r"\bclean\s+(?:the\s+)?data\b",
        r"\bdata\s+visualization\b",
        r"\bfind\s+trends?\b",
    ]

    CALENDAR_PATTERNS = [
        r"\b(?:schedule|remind\s+me|calendar|agenda|appointment|meeting)\b",
        r"\b(?:plan\s+my\s+week|plan\s+my\s+day)\b",
        r"\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|day|morning|week|month)\b",
        r"\bdeadline\s+reminder\b",
        r"\brecurring\s+task\b",
    ]

    @classmethod
    def classify(
        cls,
        prompt: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> IntentClassificationResult:
        """Determines the primary intent and operational entities from natural language."""
        text = prompt.strip()
        lower_text = text.lower()
        context = context or {}

        # 1. Extract URLs and file references
        urls = cls.URL_REGEX.findall(text)
        has_url = len(urls) > 0
        has_file_context = bool(context.get("file_ids") or context.get("selected_file_ids"))

        extracted: Dict[str, Any] = {
            "urls": urls,
            "raw_prompt": text,
            "has_file_context": has_file_context,
        }

        # Check for multi-agent workflow requirement (e.g., combines research + browser + report)
        multi_agent_indicators = (
            ("research" in lower_text and "prepare a presentation" in lower_text)
            or ("research" in lower_text and "compare" in lower_text and ("report" in lower_text or "deliverable" in lower_text))
            or ("build" in lower_text and "test" in lower_text and "deploy" in lower_text)
        )
        if multi_agent_indicators:
            return IntentClassificationResult(
                intent=AssistantIntent.MULTI_AGENT_WORKFLOW,
                confidence=0.92,
                complexity="complex",
                extracted_entities=extracted,
                reasoning="Goal involves multiple synchronized agent stages (research, comparison, synthesis, deliverable generation).",
                suggested_model_tier="reasoning",
            )

        # 2. Browser Agent / Computer Use
        if any(re.search(pat, lower_text) for pat in cls.BROWSER_PATTERNS) or (has_url and any(w in lower_text for w in ("open", "go to", "complete", "navigate", "fill", "click", "check"))):
            extracted["target_url"] = urls[0] if urls else None
            return IntentClassificationResult(
                intent=AssistantIntent.BROWSER_AGENT,
                confidence=0.95 if has_url else 0.88,
                complexity="moderate" if has_url else "complex",
                extracted_entities=extracted,
                reasoning=f"Request specifies browser navigation or web workflow execution{' targeting ' + urls[0] if urls else ''}.",
                suggested_model_tier="standard",
            )

        # 3. Autonomous Coding Agent
        if any(re.search(pat, lower_text) for pat in cls.CODING_PATTERNS):
            return IntentClassificationResult(
                intent=AssistantIntent.AUTONOMOUS_CODING,
                confidence=0.90,
                complexity="complex" if any(w in lower_text for w in ("build", "full-stack", "app")) else "moderate",
                extracted_entities=extracted,
                reasoning="Request involves software engineering, codebase modification, test execution, or error fixing.",
                suggested_model_tier="reasoning",
            )

        # 4. Data Analysis Engine
        if any(re.search(pat, lower_text) for pat in cls.DATA_ANALYSIS_PATTERNS) or (has_file_context and any(w in lower_text for w in ("csv", "stats", "correlation", "trend"))):
            return IntentClassificationResult(
                intent=AssistantIntent.DATA_ANALYSIS,
                confidence=0.88,
                complexity="moderate",
                extracted_entities=extracted,
                reasoning="Request involves quantitative computation, tabular datasets, or statistical analytics.",
                suggested_model_tier="standard",
            )

        # 5. Document Intelligence
        if any(re.search(pat, lower_text) for pat in cls.DOCUMENT_PATTERNS) or (has_file_context and any(w in lower_text for w in ("extract", "summarize", "study", "assignment", "material"))):
            return IntentClassificationResult(
                intent=AssistantIntent.DOCUMENT_INTELLIGENCE,
                confidence=0.90,
                complexity="moderate",
                extracted_entities=extracted,
                reasoning="Request targets document parsing, semantic text extraction, or uploaded knowledge analysis.",
                suggested_model_tier="standard",
            )

        # 6. Calendar & Scheduled Automation
        if any(re.search(pat, lower_text) for pat in cls.CALENDAR_PATTERNS):
            is_recurring = any(w in lower_text for w in ("every", "recurring", "daily", "weekly", "scheduled"))
            return IntentClassificationResult(
                intent=AssistantIntent.CALENDAR_AUTOMATION,
                confidence=0.92,
                complexity="moderate" if is_recurring else "simple",
                extracted_entities=extracted,
                reasoning=f"Request involves time scheduling, reminders, or {'recurring background automation' if is_recurring else 'agenda management'}.",
                suggested_model_tier="fast",
            )

        # 7. Advanced Research Engine
        if any(re.search(pat, lower_text) for pat in cls.RESEARCH_PATTERNS):
            return IntentClassificationResult(
                intent=AssistantIntent.RESEARCH,
                confidence=0.89,
                complexity="complex" if any(w in lower_text for w in ("compare", "universities", "market")) else "moderate",
                extracted_entities=extracted,
                reasoning="Request requires multi-source web discovery, evidence synthesis, or competitive research.",
                suggested_model_tier="standard",
            )

        # 8. Conversational Fallback (explanations, writing, general dialogue)
        return IntentClassificationResult(
            intent=AssistantIntent.CONVERSATIONAL,
            confidence=0.95,
            complexity="simple",
            extracted_entities=extracted,
            reasoning="Direct natural language conversational query, explanation, or concept discussion.",
            suggested_model_tier="standard",
        )
