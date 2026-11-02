import asyncio
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = BASE_DIR / "services" / "api"
WORKER_DIR = BASE_DIR / "services" / "agent-worker"

for p in (str(API_DIR), str(WORKER_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from perception import InteractiveElement, PagePerception, detect_model_vision_capability
from actions import UniversalActionExecutor, AdaptiveInteractionExecutor
from workflow_discovery import WorkflowDiscoveryEngine
from self_correction import SelfCorrectionEngine, FailureDiagnosis
from schemas.browser_task import BrowserAction, BrowserActionType
from services.orchestration.multi_agent import MultiAgentOrchestrator, VerificationVerdict


# ============================================================================
# TEST A: UNIVERSAL PERCEPTION ENGINE
# ============================================================================

def test_page_perception_state_and_obstacle_classification():
    """Verifies PagePerception fields, obstacle detection, and page state determination."""
    perception = PagePerception(
        url="https://shop.example.com",
        title="Modern Commerce",
        headings=["Catalog", "Featured Products"],
        interactive_elements=[
            InteractiveElement(
                index=1,
                tag="input",
                role="searchbox",
                text="",
                selector="input[type='search']",
                input_type="search",
                placeholder="Search products...",
            ),
            InteractiveElement(
                index=2,
                tag="button",
                role="button",
                text="Accept All Cookies",
                selector="button.cookie-accept",
            ),
        ],
        tables=[],
        active_dialog=None,
        visible_text_snippet="Welcome to our secure shopping portal.",
        page_state="ready",
        detected_obstacles=[{"type": "cookie_banner", "selector": "#cookie-banner"}],
        recommended_actions=["type_search_query"],
        confidence_score=0.95,
    )

    assert perception.page_state == "ready"
    assert len(perception.detected_obstacles) == 1
    assert perception.detected_obstacles[0]["type"] == "cookie_banner"
    assert "type_search_query" in perception.recommended_actions
    assert perception.confidence_score >= 0.90
    assert perception.get_element_by_index(1) is not None
    assert perception.get_element_by_index(99) is None


def test_model_vision_capability_detection():
    """Verifies that multimodal models are identified as vision-capable."""
    gemini_gateway = MagicMock(active_model="gemini-2.5-pro", provider="google")
    assert detect_model_vision_capability(gemini_gateway) is True

    gpt4o_gateway = MagicMock(active_model="gpt-4o", provider="openai")
    assert detect_model_vision_capability(gpt4o_gateway) is True

    text_gateway = MagicMock(active_model="llama-3-8b", provider="ollama")
    assert detect_model_vision_capability(text_gateway) is False
    assert detect_model_vision_capability(None) is False


# ============================================================================
# TEST B: INTELLIGENT INTERACTION ENGINE (3-TIER FALLBACK STRATEGY)
# ============================================================================

@pytest.mark.asyncio
async def test_adaptive_interaction_tier1_dom_success():
    """Verifies Tier 1 DOM action succeeds when selector is available."""
    mock_page = AsyncMock()
    mock_page.url = "https://example.com"
    mock_page.click = AsyncMock()
    mock_context = MagicMock()

    adaptive = AdaptiveInteractionExecutor()
    action = BrowserAction(action_type=BrowserActionType.CLICK, selector="#submit-btn")
    
    res = await adaptive.execute_adaptive(
        action=action,
        page=mock_page,
        context=mock_context,
        approved_scope={"allowed_domains": ["example.com"]},
    )

    assert res["status"] != "error"
    assert res["execution_tier"] == "tier1_dom"
    assert res["verified"] is True
    mock_page.click.assert_awaited_once_with("#submit-btn", timeout=15000)


@pytest.mark.asyncio
async def test_adaptive_interaction_tier2_a11y_fallback():
    """Verifies fallback to Tier 2 (A11y focus + keyboard) when DOM click throws."""
    mock_page = AsyncMock()
    mock_page.url = "https://example.com"
    mock_page.click = AsyncMock(side_effect=Exception("Element is obscured by another layer"))
    mock_page.focus = AsyncMock()
    mock_page.keyboard.press = AsyncMock()
    mock_context = MagicMock()

    adaptive = AdaptiveInteractionExecutor()
    element = InteractiveElement(
        index=3,
        tag="button",
        role="button",
        text="Submit",
        selector="button.custom-btn",
        bounding_box={"x": 100, "y": 200, "width": 80, "height": 30},
    )
    action = BrowserAction(action_type=BrowserActionType.CLICK, element_index=3)

    res = await adaptive.execute_adaptive(
        action=action,
        page=mock_page,
        context=mock_context,
        approved_scope={"allowed_domains": ["example.com"]},
        perception_elements=[element],
    )

    assert res["execution_tier"] == "tier2_a11y_keyboard"
    assert res["status"] == "success"
    mock_page.focus.assert_awaited_once()
    mock_page.keyboard.press.assert_awaited_once_with("Enter")


@pytest.mark.asyncio
async def test_adaptive_interaction_tier3_visual_centroid_fallback():
    """Verifies fallback to Tier 3 (Visual Centroid Click) when DOM & focus fail."""
    mock_page = AsyncMock()
    mock_page.url = "https://example.com"
    mock_page.click = AsyncMock(side_effect=Exception("DOM click failed"))
    mock_page.focus = AsyncMock(side_effect=Exception("Focus failed"))
    mock_page.mouse.click = AsyncMock()
    mock_context = MagicMock()

    adaptive = AdaptiveInteractionExecutor()
    element = InteractiveElement(
        index=7,
        tag="div",
        role="button",
        text="Custom Canvas Button",
        selector="div.canvas-btn",
        bounding_box={"x": 200, "y": 300, "width": 100, "height": 50},
    )
    action = BrowserAction(action_type=BrowserActionType.CLICK, element_index=7)

    res = await adaptive.execute_adaptive(
        action=action,
        page=mock_page,
        context=mock_context,
        approved_scope={"allowed_domains": ["example.com"]},
        perception_elements=[element],
    )

    assert res["execution_tier"] == "tier3_visual_centroid"
    assert res["coordinate_x"] == 250.0  # 200 + 100/2
    assert res["coordinate_y"] == 325.0  # 300 + 50/2
    mock_page.mouse.click.assert_awaited_once_with(250.0, 325.0)


# ============================================================================
# TEST C: ADAPTIVE WORKFLOW DISCOVERY ENGINE
# ============================================================================

def test_workflow_discovery_link_scoring():
    """Verifies that WorkflowDiscoveryEngine scores navigation links relative to task goal."""
    elements = [
        InteractiveElement(index=1, tag="a", role="link", text="Privacy Policy", selector="a.privacy"),
        InteractiveElement(index=2, tag="a", role="link", text="Product Pricing & Plans", selector="a.pricing"),
        InteractiveElement(index=3, tag="a", role="link", text="Contact Support", selector="a.support"),
    ]

    scored = WorkflowDiscoveryEngine.score_link_relevance(elements, "Find pricing plans for enterprise")
    assert len(scored) > 0
    top_el, top_score = scored[0]
    assert top_el.index == 2
    assert "pricing" in top_el.text.lower()
    assert top_score > 0.4


def test_workflow_discovery_search_and_filter_identification():
    """Verifies discovery of search boxes, sort selects, and filter controls."""
    elements = [
        InteractiveElement(index=1, tag="input", role="searchbox", text="", selector="input#q", placeholder="Search..."),
        InteractiveElement(index=2, tag="select", role="combobox", text="", selector="select#sort", name="sort_order"),
        InteractiveElement(index=3, tag="input", role="checkbox", text="In Stock", selector="input#stock", input_type="checkbox"),
    ]

    res = WorkflowDiscoveryEngine.find_search_or_filter(elements)
    assert res["search_input"] is not None
    assert res["search_input"].index == 1
    assert len(res["sort_controls"]) == 1
    assert len(res["filter_controls"]) == 1


def test_workflow_discovery_page_classification():
    """Verifies classification of page archetypes."""
    form_perception = PagePerception(
        url="https://example.com/register",
        title="Register",
        headings=["Sign Up"],
        interactive_elements=[
            InteractiveElement(index=1, tag="input", role="textbox", text="", selector="input#name"),
            InteractiveElement(index=2, tag="input", role="textbox", text="", selector="input#email"),
            InteractiveElement(index=3, tag="input", role="textbox", text="", selector="input#password"),
        ],
        tables=[],
        active_dialog=None,
        visible_text_snippet="Create your profile",
    )
    assert WorkflowDiscoveryEngine.classify_page(form_perception) == "form_submission"


# ============================================================================
# TEST D: ADVANCED SELF-RECOVERY & DESTRUCTIVE ACTION GUARD
# ============================================================================

@pytest.mark.asyncio
async def test_self_recovery_destructive_action_guard():
    """Verifies that destructive / consequential actions are never blindly retried."""
    engine = SelfCorrectionEngine()
    mock_page = AsyncMock()

    destructive_action = BrowserAction(
        action_type=BrowserActionType.CLICK,
        selector="button.delete-account",
        text="Delete Account",
        is_consequential=True,
    )

    diagnosis, recovery = await engine.diagnose_and_recover(
        page=mock_page,
        failed_action=destructive_action,
        error=Exception("Timeout clicking delete button"),
        task_id="task_guard_1",
        step_index=1,
    )

    assert diagnosis.category == "DESTRUCTIVE_ACTION_BLOCKED"
    assert diagnosis.is_destructive_blocked is True
    assert diagnosis.suggested_alternative is None
    assert recovery is None


@pytest.mark.asyncio
async def test_self_recovery_captcha_detection():
    """Verifies that CAPTCHA errors are classified with no blind retry."""
    engine = SelfCorrectionEngine()
    mock_page = AsyncMock()

    action = BrowserAction(action_type=BrowserActionType.CLICK, selector="button#login")
    diagnosis, recovery = await engine.diagnose_and_recover(
        page=mock_page,
        failed_action=action,
        error=Exception("Navigation blocked by Cloudflare turnstile challenge"),
        task_id="task_guard_2",
        step_index=1,
    )

    assert diagnosis.category == "CAPTCHA_OR_MFA_DETECTED"
    assert diagnosis.suggested_alternative is None


# ============================================================================
# TEST E: MULTI-AGENT VERIFICATION AUDIT
# ============================================================================

@pytest.mark.asyncio
async def test_verification_agent_comprehensive_verdicts():
    """Verifies VerificationAgent outcomes across COMPLETED, PARTIAL, and FAILED states."""
    orchestrator = MultiAgentOrchestrator()

    # 1. Successful verification
    evidence_good = [
        {"action_type": "navigate", "url": "https://example.com/data"},
        {"action_type": "inspect", "title": "Dashboard"},
        {"screenshot_data_url": "data:image/jpeg;base64,1234"},
    ]
    v_success = await orchestrator.verify_task_completion(
        task_description="Navigate to dashboard and observe data",
        evidence=evidence_good,
    )
    assert v_success.status == "COMPLETED"
    assert v_success.confidence_score >= 0.90

    # 2. Failed verification with unhandled error
    v_fail = await orchestrator.verify_task_completion(
        task_description="Download quarterly earnings report",
        evidence=[],
        has_error=True,
        error_message="Host unreachable",
    )
    assert v_fail.status == "FAILED"
    assert v_fail.confidence_score == 1.0

    # 3. Partial verification (missing required file)
    evidence_partial = [
        {"action_type": "navigate", "url": "https://example.com/reports"},
        {"screenshot_data_url": "data:image/jpeg;base64,1234"},
    ]
    v_partial = await orchestrator.verify_task_completion(
        task_description="Download PDF annual report from reports page",
        evidence=evidence_partial,
        downloaded_files=[],  # No files downloaded!
    )
    assert v_partial.status == "PARTIALLY_COMPLETED"
    assert "Download and inspect required file artifact" in v_partial.unverified_criteria
