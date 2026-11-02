import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel
from schemas.browser_task import BrowserAction, BrowserActionType

logger = logging.getLogger("browser_worker.self_correction")


class FailureDiagnosis(BaseModel):
    category: str  # "MODAL_BLOCKING", "ELEMENT_OFFSCREEN", "SELECTOR_NOT_FOUND", "PAGE_LOADING", "STALE_ELEMENT_REFERENCE", "CAPTCHA_OR_MFA_DETECTED", "UNEXPECTED_NAVIGATION", "COORDINATE_MISS", "UNKNOWN"
    reason: str
    suggested_alternative: Optional[BrowserAction] = None
    dismissal_selector: Optional[str] = None
    is_destructive_blocked: bool = False


class SelfCorrectionEngine:
    """Intelligent fault detection, DOM inspection, and adaptive recovery engine for browser automation."""

    def __init__(self, max_retries_per_step: int = 3):
        self.max_retries_per_step = max_retries_per_step
        self.failure_history: Dict[str, int] = {}  # key: f"{task_id}:{step_index}:{action_signature}" -> failure_count

    def _get_action_key(self, task_id: str, step_index: int, action: BrowserAction) -> str:
        sig = f"{action.action_type.value}:{action.selector or action.url or action.text or ''}"
        return f"{task_id}:{step_index}:{sig}"

    def record_failure(self, task_id: str, step_index: int, action: BrowserAction) -> int:
        key = self._get_action_key(task_id, step_index, action)
        count = self.failure_history.get(key, 0) + 1
        self.failure_history[key] = count
        return count

    def is_action_exhausted(self, task_id: str, step_index: int, action: BrowserAction) -> bool:
        key = self._get_action_key(task_id, step_index, action)
        return self.failure_history.get(key, 0) >= 2

    async def diagnose_and_recover(
        self,
        page: Any,
        failed_action: BrowserAction,
        error: Exception,
        task_id: str,
        step_index: int,
    ) -> Tuple[FailureDiagnosis, Optional[Dict[str, Any]]]:
        """Inspects current browser DOM/state, determines why action failed, and attempts intelligent self-correction."""
        err_msg = str(error)
        logger.warning(
            "[SELF_CORRECTION] Action '%s' failed at step %s: %s",
            failed_action.action_type.value,
            step_index,
            err_msg,
        )

        attempts = self.record_failure(task_id, step_index, failed_action)

        # 1. DIAGNOSIS PHASE: Inspect live browser state
        diagnosis = await self._analyze_browser_state(page, failed_action, err_msg)

        # 2. ALTERNATIVE ACTION GENERATION
        if diagnosis.suggested_alternative is None:
            diagnosis.suggested_alternative = await self._generate_alternative_action(page, failed_action, diagnosis)

        # 3. RECOVERY EXECUTION
        recovery_outcome: Optional[Dict[str, Any]] = None
        if diagnosis.category == "MODAL_BLOCKING" and diagnosis.dismissal_selector:
            try:
                logger.info("[SELF_CORRECTION] Attempting to dismiss blocking modal via %s", diagnosis.dismissal_selector)
                await page.locator(diagnosis.dismissal_selector).first.click(timeout=3000)
                await page.wait_for_timeout(500)
                recovery_outcome = {
                    "recovery_type": "dismiss_modal",
                    "dismissal_selector": diagnosis.dismissal_selector,
                    "status": "modal_dismissed",
                }
            except Exception as dismiss_ex:
                logger.debug("Failed modal dismissal click: %s. Trying Escape key.", dismiss_ex)
                try:
                    await page.keyboard.press("Escape")
                    await page.wait_for_timeout(400)
                    recovery_outcome = {
                        "recovery_type": "press_escape",
                        "status": "escape_pressed",
                    }
                except Exception:
                    pass

        elif diagnosis.category == "ELEMENT_OFFSCREEN" and failed_action.selector:
            try:
                logger.info("[SELF_CORRECTION] Scrolling element into viewport center: %s", failed_action.selector)
                loc = page.locator(failed_action.selector).first
                await loc.scroll_into_view_if_needed(timeout=3000)
                await page.wait_for_timeout(400)
                recovery_outcome = {
                    "recovery_type": "scroll_into_view",
                    "selector": failed_action.selector,
                    "status": "element_scrolled",
                }
            except Exception as scroll_ex:
                logger.debug("Scroll to element failed: %s", scroll_ex)

        return diagnosis, recovery_outcome

    async def _analyze_browser_state(
        self,
        page: Any,
        failed_action: BrowserAction,
        error_msg: str,
    ) -> FailureDiagnosis:
        """Determines the root cause of an action failure by inspecting the active page."""
        # 0. Safety Guard: Never blindly retry destructive / consequential actions
        selector_str = (failed_action.selector or "").lower()
        text_str = (failed_action.text or "").lower()
        if (
            failed_action.is_consequential
            or any(w in selector_str for w in ("delete", "remove", "destroy", "drop", "terminate"))
            or any(w in text_str for w in ("delete account", "destroy", "terminate", "remove database"))
        ):
            return FailureDiagnosis(
                category="DESTRUCTIVE_ACTION_BLOCKED",
                reason=f"Action '{failed_action.action_type.value}' is consequential/destructive; automatic retry is blocked for safety.",
                is_destructive_blocked=True,
            )

        # A. Check for CAPTCHA or MFA gate
        err_lower = error_msg.lower()
        if any(w in err_lower for w in ("captcha", "turnstile", "recaptcha", "cloudflare", "challenge", "verification")):
            return FailureDiagnosis(
                category="CAPTCHA_OR_MFA_DETECTED",
                reason="Anti-bot verification gate or CAPTCHA challenge detected on page.",
            )

        # B. Check for stale / detached element
        if any(w in err_lower for w in ("stale", "detached", "not connected to the dom")):
            return FailureDiagnosis(
                category="STALE_ELEMENT_REFERENCE",
                reason=f"Element '{failed_action.selector}' became stale or detached from DOM.",
            )

        # C. Check for coordinate miss in visual click
        if failed_action.action_type == BrowserActionType.VISUAL_CLICK:
            if "outside" in err_lower or "out of bounds" in err_lower or "cannot click" in err_lower:
                return FailureDiagnosis(
                    category="COORDINATE_MISS",
                    reason=f"Visual click at ({failed_action.coordinate_x}, {failed_action.coordinate_y}) missed or fell outside viewport.",
                )

        # D. Check for blocking modal or cookie dialog
        modal_selectors = [
            "dialog[open]",
            "[role='dialog']",
            "[role='alertdialog']",
            ".modal.show",
            ".modal.is-active",
            ".modal-backdrop",
            ".swal2-container",
            "#onetrust-banner-sdk",
            ".cookie-consent",
            ".cookie-banner",
            "[aria-modal='true']",
        ]

        for m_sel in modal_selectors:
            try:
                loc = page.locator(m_sel)
                if await loc.count() > 0 and await loc.first.is_visible():
                    # Look for close button inside or around modal
                    close_btn_selectors = [
                        f"{m_sel} button[aria-label*='close' i]",
                        f"{m_sel} button.close",
                        f"{m_sel} .close",
                        f"{m_sel} button:has-text('Accept')",
                        f"{m_sel} button:has-text('Got it')",
                        f"{m_sel} button:has-text('I understand')",
                        f"{m_sel} button:has-text('Close')",
                        "button[aria-label*='close' i]",
                        "button:has-text('Close')",
                    ]
                    for cb in close_btn_selectors:
                        if await page.locator(cb).count() > 0 and await page.locator(cb).first.is_visible():
                            return FailureDiagnosis(
                                category="MODAL_BLOCKING",
                                reason=f"An active modal dialog or overlay ({m_sel}) is blocking user interaction.",
                                dismissal_selector=cb,
                            )
                    return FailureDiagnosis(
                        category="MODAL_BLOCKING",
                        reason=f"An overlay ({m_sel}) is visible on page.",
                        dismissal_selector="button:has-text('Close')",
                    )
            except Exception:
                pass

        # E. Check for timeout waiting for element (selector issue vs loading issue)
        if "timeout" in err_lower or "waiting for" in err_lower:
            if failed_action.selector:
                try:
                    count = await page.locator(failed_action.selector).count()
                    if count == 0:
                        return FailureDiagnosis(
                            category="SELECTOR_NOT_FOUND",
                            reason=f"Selector '{failed_action.selector}' does not exist in DOM.",
                        )
                    else:
                        is_vis = await page.locator(failed_action.selector).first.is_visible()
                        if not is_vis:
                            return FailureDiagnosis(
                                category="ELEMENT_OFFSCREEN",
                                reason=f"Element '{failed_action.selector}' is in DOM but hidden or outside viewport.",
                            )
                except Exception:
                    pass

        # F. Check for navigation or client-side loading
        try:
            ready_state = await page.evaluate("() => document.readyState")
            if ready_state != "complete":
                return FailureDiagnosis(
                    category="PAGE_LOADING",
                    reason=f"Page document readyState is '{ready_state}', waiting for DOM settlement.",
                )
        except Exception:
            pass

        return FailureDiagnosis(
            category="UNKNOWN",
            reason=f"Standard execution error: {error_msg[:120]}",
        )

    async def _generate_alternative_action(
        self,
        page: Any,
        failed_action: BrowserAction,
        diagnosis: FailureDiagnosis,
    ) -> Optional[BrowserAction]:
        """Generates a resilient fallback or alternative action based on page perception."""
        # Safety guard: Never generate automated retry for blocked or security gates
        if diagnosis.is_destructive_blocked or diagnosis.category in ("DESTRUCTIVE_ACTION_BLOCKED", "CAPTCHA_OR_MFA_DETECTED"):
            return None

        # 1. If selector not found, attempt semantic fallback locators
        if diagnosis.category in ("SELECTOR_NOT_FOUND", "ELEMENT_OFFSCREEN", "UNKNOWN") and failed_action.selector:
            # Try finding by visible text if selector had text or class
            target_text = failed_action.text or failed_action.value
            if not target_text and ("text=" in failed_action.selector or "has-text" in failed_action.selector):
                # Extract text inside quotes
                import re
                m = re.search(r"['\"]([^'\"]+)['\"]", failed_action.selector)
                if m:
                    target_text = m.group(1)

            if target_text:
                fallback_selectors = [
                    f"button:has-text('{target_text}')",
                    f"a:has-text('{target_text}')",
                    f"text='{target_text}'",
                    f"[aria-label*='{target_text}' i]",
                    f"[title*='{target_text}' i]",
                    f"[placeholder*='{target_text}' i]",
                ]
                for fb in fallback_selectors:
                    try:
                        if await page.locator(fb).count() > 0:
                            alt = failed_action.model_copy()
                            alt.selector = fb
                            logger.info("[SELF_CORRECTION] Found semantic fallback selector: %s", fb)
                            return alt
                    except Exception:
                        pass

        # 2. If click failed, try visual click with bounding box coordinates
        if failed_action.action_type in (BrowserActionType.CLICK, BrowserActionType.HOVER) and failed_action.selector:
            try:
                loc = page.locator(failed_action.selector).first
                box = await loc.bounding_box()
                if box and box["width"] > 0 and box["height"] > 0:
                    cx = box["x"] + box["width"] / 2.0
                    cy = box["y"] + box["height"] / 2.0
                    alt = BrowserAction(
                        action_type=BrowserActionType.VISUAL_CLICK,
                        coordinate_x=cx,
                        coordinate_y=cy,
                        text=f"Visual centroid click at ({cx:.1f}, {cy:.1f})",
                    )
                    logger.info("[SELF_CORRECTION] Generated visual click fallback at (%s, %s)", cx, cy)
                    return alt
            except Exception:
                pass

        # 3. Fallback to wait for network idle and retry
        return BrowserAction(
            action_type=BrowserActionType.WAIT_FOR,
            condition="networkidle",
            timeout_ms=3000,
        )
