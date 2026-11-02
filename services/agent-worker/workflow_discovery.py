import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from perception import InteractiveElement, PagePerception

logger = logging.getLogger(__name__)

COMMON_DISMISS_PATTERNS = [
    r"^(accept|accept all|agree|got it!?|skip|skip for now|dismiss|close|no thanks|maybe later|continue)$",
    r"^(i understand|ok|okay)$",
]

AUTH_OR_CAPTCHA_PATTERNS = [
    r"(recaptcha|hcaptcha|turnstile|verify you are human|security check|challenge-form)",
    r"(enter otp|two-factor|verification code|authenticator app)",
]


class WorkflowDiscoveryEngine:
    """Discovers interactive patterns, form inputs, pagination, search, and gates on unfamiliar websites."""

    @staticmethod
    def score_link_relevance(
        elements: List[InteractiveElement],
        goal: str,
    ) -> List[Tuple[InteractiveElement, float]]:
        """Scores navigation links and interactive controls based on semantic overlap with the goal."""
        goal_words = set(re.findall(r"\w+", goal.lower()))
        scored: List[Tuple[InteractiveElement, float]] = []

        for el in elements:
            if el.tag not in ("a", "button", "summary") and el.role not in ("link", "button", "tab"):
                continue
            text = f"{el.text} {el.aria_label or ''} {el.selector or ''}".lower()
            element_words = set(re.findall(r"\w+", text))
            if not element_words:
                continue

            overlap = goal_words.intersection(element_words)
            score = len(overlap) / max(len(goal_words), 1)
            # Boost exact substring match
            for gw in goal_words:
                if len(gw) > 3 and gw in text:
                    score += 0.25

            if score > 0:
                scored.append((el, min(round(score, 2), 1.0)))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored

    @staticmethod
    def find_search_or_filter(elements: List[InteractiveElement]) -> Dict[str, Any]:
        """Discovers search inputs, filter controls, checkboxes, and sort dropdowns."""
        search_input: Optional[InteractiveElement] = None
        filters: List[InteractiveElement] = []
        sort_dropdowns: List[InteractiveElement] = []

        for el in elements:
            if el.is_disabled:
                continue

            # Search input detection
            if not search_input and el.tag in ("input", "textarea"):
                combined = f"{el.placeholder or ''} {el.name or ''} {el.element_id or ''} {el.aria_label or ''} {el.input_type or ''}".lower()
                if el.input_type == "search" or el.role == "searchbox" or any(k in combined for k in ("search", "find", "query", "lookup", "keyword")):
                    search_input = el
                    continue

            # Sort dropdown detection
            if el.tag == "select" or el.role == "combobox":
                combined = f"{el.name or ''} {el.aria_label or ''} {el.element_id or ''}".lower()
                if any(s in combined for s in ("sort", "order", "filter", "category")):
                    sort_dropdowns.append(el)
                    continue

            # Filter checkboxes and buttons
            if el.role in ("checkbox", "radio") or el.input_type in ("checkbox", "radio"):
                filters.append(el)

        return {
            "search_input": search_input,
            "filter_controls": filters,
            "sort_controls": sort_dropdowns,
            "total_interactive": len(elements),
        }

    @staticmethod
    def classify_page(perception: PagePerception) -> str:
        """Classifies the current page archetype to guide the high-level workflow strategy."""
        text_lower = (perception.visible_text_snippet + " " + perception.title).lower()

        if any(pat in text_lower for pat in ("verify you are human", "recaptcha", "two-factor", "enter otp")):
            return "auth_gate"

        if perception.active_dialog:
            return "modal_open"

        if perception.tables and len(perception.tables) > 0:
            return "data_table"

        input_count = sum(1 for el in perception.interactive_elements if el.tag in ("input", "textarea", "select"))
        if input_count >= 3:
            return "form_submission"

        link_count = sum(1 for el in perception.interactive_elements if el.tag == "a" or el.role == "link")
        if link_count > 15:
            return "navigation_hub"

        return "content_article"

    @staticmethod
    def detect_blocking_modal_or_overlay(perception: PagePerception) -> Optional[InteractiveElement]:
        """Finds any dismiss/close button on an active dialog or cookie banner."""
        if not perception.active_dialog and not any("cookie" in (el.aria_label or el.text).lower() for el in perception.interactive_elements):
            return None

        for el in perception.interactive_elements:
            if el.tag not in ("button", "a") or el.is_disabled:
                continue
            text = (el.text or el.aria_label or "").strip()
            for pat in COMMON_DISMISS_PATTERNS:
                if re.match(pat, text, re.IGNORECASE):
                    return el
        return None

    @staticmethod
    def detect_captcha_or_mfa_gate(perception: PagePerception) -> Tuple[bool, Optional[str]]:
        """Detects whether an active CAPTCHA or multi-factor authentication gate is present."""
        text_lower = (perception.visible_text_snippet + " " + perception.title).lower()
        for pat in AUTH_OR_CAPTCHA_PATTERNS:
            match = re.search(pat, text_lower)
            if match:
                return True, f"Security or authentication verification gate detected: '{match.group(0)}'"

        for el in perception.interactive_elements:
            el_text = (el.text + " " + (el.aria_label or "") + " " + (el.placeholder or "")).lower()
            for pat in AUTH_OR_CAPTCHA_PATTERNS:
                if re.search(pat, el_text):
                    return True, f"Security challenge detected in interactive element: '{el_text}'"

        return False, None

    @staticmethod
    def find_search_input(perception: PagePerception) -> Optional[InteractiveElement]:
        """Discovers the primary search input on a website."""
        for el in perception.interactive_elements:
            if el.tag in ("input", "textarea") and not el.is_disabled:
                if el.input_type == "search" or el.role == "searchbox":
                    return el

        for el in perception.interactive_elements:
            if el.tag in ("input", "textarea") and not el.is_disabled:
                combined = f"{el.placeholder or ''} {el.name or ''} {el.element_id or ''} {el.aria_label or ''}".lower()
                if any(k in combined for k in ("search", "find", "query", "keyword", "lookup")):
                    return el

        return None

    @staticmethod
    def find_progression_button(perception: PagePerception, prefer_submit: bool = False) -> Optional[InteractiveElement]:
        """Discovers next, continue, or submit controls."""
        target_words = ["submit", "continue", "next", "proceed", "finish", "done", "save", "search"]
        if prefer_submit:
            target_words = ["submit", "finish", "done", "save", "continue", "next"]

        for word in target_words:
            for el in perception.interactive_elements:
                if el.tag in ("button", "a") and not el.is_disabled:
                    combined = f"{el.text} {el.aria_label or ''}".strip().lower()
                    if word in combined:
                        return el
        return None

    @staticmethod
    def match_form_inputs(perception: PagePerception, data_dict: Dict[str, str]) -> List[Tuple[InteractiveElement, str]]:
        """Matches user data fields (e.g. name, email, query) to relevant page input elements."""
        matches: List[Tuple[InteractiveElement, str]] = []
        matched_el_indices = set()

        for field_key, field_val in data_dict.items():
            key_clean = field_key.lower().replace("_", " ")
            best_el = None

            for el in perception.interactive_elements:
                if el.index in matched_el_indices or el.tag not in ("input", "textarea", "select") or el.is_disabled:
                    continue
                combined = f"{el.placeholder or ''} {el.name or ''} {el.element_id or ''} {el.aria_label or ''} {el.text}".lower()
                if key_clean in combined or any(word in combined for word in key_clean.split()):
                    best_el = el
                    break

            if best_el:
                matched_el_indices.add(best_el.index)
                matches.append((best_el, field_val))

        return matches
