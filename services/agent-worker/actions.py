import asyncio
import base64
import logging
from typing import Any, Dict, List, Optional
from policy import PolicyViolationError, validate_url

logger = logging.getLogger(__name__)


class UniversalActionExecutor:
    """Executes general-purpose Playwright browser actions across single or multi-tab contexts."""

    def __init__(self, allow_local: bool = False):
        self.allow_local = allow_local

    async def execute(
        self,
        action: Any,
        page: Any,
        context: Any,
        approved_scope: Optional[Dict[str, Any]] = None,
        perception_elements: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        action_type = getattr(action, "action_type", None) or (
            action.get("action_type") if isinstance(action, dict) else ""
        )
        if hasattr(action_type, "value"):
            action_type = action_type.value

        timeout_ms = getattr(action, "timeout_ms", None) or (
            action.get("timeout_ms") if isinstance(action, dict) else None
        ) or 15000

        scope = approved_scope or {}
        allowed_domains = scope.get("allowed_domains")
        outcome: Dict[str, Any] = {"action": action_type}

        # Resolve selector from element_index if element_index is provided and selector is omitted
        selector = getattr(action, "selector", None) or (action.get("selector") if isinstance(action, dict) else None)
        elem_idx = getattr(action, "element_index", None) or (action.get("element_index") if isinstance(action, dict) else None)
        if not selector and elem_idx is not None and perception_elements:
            for el in perception_elements:
                idx = getattr(el, "index", None) or el.get("index")
                if idx == elem_idx:
                    selector = getattr(el, "selector", None) or el.get("selector")
                    outcome["resolved_element_index"] = elem_idx
                    break

        # 1. Navigation
        if action_type == "navigate":
            url = getattr(action, "url", None) or action.get("url")
            nav_timeout = max(timeout_ms, 30000)
            try:
                response = await page.goto(url, timeout=nav_timeout, wait_until="commit")
            except Exception:
                try:
                    response = await page.goto(url, timeout=nav_timeout, wait_until="domcontentloaded")
                except Exception as goto_err:
                    if page.url and "about:blank" not in page.url:
                        response = None
                    else:
                        raise goto_err

            try:
                await page.wait_for_timeout(1500)
            except Exception:
                pass

            cur_url = page.url
            validate_url(cur_url, allowed_domains=allowed_domains, allow_local=self.allow_local)
            outcome["url"] = cur_url
            try:
                outcome["title"] = await page.title()
            except Exception:
                outcome["title"] = ""
            outcome["status_code"] = response.status if response else 200

        elif action_type == "go_back":
            await page.go_back(timeout=timeout_ms)
            validate_url(page.url, allowed_domains=allowed_domains, allow_local=self.allow_local)
            outcome["url"] = page.url

        elif action_type == "go_forward":
            await page.go_forward(timeout=timeout_ms)
            validate_url(page.url, allowed_domains=allowed_domains, allow_local=self.allow_local)
            outcome["url"] = page.url

        elif action_type == "reload":
            await page.reload(timeout=timeout_ms)
            outcome["url"] = page.url

        # 2. Multi-Tab Operations
        elif action_type == "new_tab":
            new_page = await context.new_page()
            url = getattr(action, "url", None) or (action.get("url") if isinstance(action, dict) else None)
            if url:
                validate_url(url, allowed_domains=allowed_domains, allow_local=self.allow_local)
                await new_page.goto(url, timeout=timeout_ms, wait_until="commit")
            outcome["total_tabs"] = len(context.pages)
            outcome["active_tab_index"] = context.pages.index(new_page)
            outcome["url"] = new_page.url

        elif action_type == "switch_tab":
            tab_idx = getattr(action, "tab_index", None) or (action.get("tab_index") if isinstance(action, dict) else 0)
            if 0 <= tab_idx < len(context.pages):
                target_page = context.pages[tab_idx]
                await target_page.bring_to_front()
                outcome["switched_to_tab"] = tab_idx
                outcome["url"] = target_page.url
            else:
                raise PolicyViolationError(f"Tab index {tab_idx} is out of range (0-{len(context.pages) - 1}).")

        elif action_type == "close_tab":
            tab_idx = getattr(action, "tab_index", None) or (action.get("tab_index") if isinstance(action, dict) else None)
            if tab_idx is not None and 0 <= tab_idx < len(context.pages):
                close_target = context.pages[tab_idx]
                await close_target.close()
                outcome["closed_tab"] = tab_idx
            else:
                await page.close()
                outcome["closed_tab"] = "active"
            outcome["remaining_tabs"] = len(context.pages)

        # 3. Direct Element Interactions
        elif action_type == "click":
            await page.click(selector, timeout=timeout_ms)
            validate_url(page.url, allowed_domains=allowed_domains, allow_local=self.allow_local)
            outcome["selector"] = selector
            outcome["current_url"] = page.url

        elif action_type == "double_click":
            await page.dblclick(selector, timeout=timeout_ms)
            validate_url(page.url, allowed_domains=allowed_domains, allow_local=self.allow_local)
            outcome["selector"] = selector

        elif action_type == "right_click":
            await page.click(selector, button="right", timeout=timeout_ms)
            outcome["selector"] = selector

        elif action_type == "hover":
            await page.hover(selector, timeout=timeout_ms)
            outcome["selector"] = selector

        elif action_type == "type_text":
            text_to_type = getattr(action, "text", "") or (action.get("text", "") if isinstance(action, dict) else "")
            await page.fill(selector, text_to_type, timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["typed_characters"] = len(text_to_type)

        elif action_type == "clear_input":
            await page.fill(selector, "", timeout=timeout_ms)
            outcome["selector"] = selector

        elif action_type == "select_option":
            val = getattr(action, "value", None) or getattr(action, "text", "") or (
                action.get("value") or action.get("text") if isinstance(action, dict) else ""
            )
            await page.select_option(selector, val, timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["value"] = val

        elif action_type == "check_box":
            await page.check(selector, timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["checked"] = True

        elif action_type == "uncheck_box":
            await page.uncheck(selector, timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["checked"] = False

        elif action_type == "press_key":
            key_name = getattr(action, "key", None) or getattr(action, "text", "Enter") or (
                action.get("key") or action.get("text") if isinstance(action, dict) else "Enter"
            )
            if selector:
                await page.press(selector, key_name, timeout=timeout_ms)
            else:
                await page.keyboard.press(key_name)
            outcome["key"] = key_name

        elif action_type == "drag_and_drop":
            target_sel = getattr(action, "target_selector", None) or (
                action.get("target_selector") if isinstance(action, dict) else None
            )
            await page.drag_and_drop(selector, target_sel, timeout=timeout_ms)
            outcome["source_selector"] = selector
            outcome["target_selector"] = target_sel

        elif action_type == "scroll":
            direction = (getattr(action, "direction", None) or (
                action.get("direction") if isinstance(action, dict) else None
            ) or "down").lower()
            amount = getattr(action, "amount", None) or (
                action.get("amount") if isinstance(action, dict) else None
            ) or 500

            if direction == "top":
                await page.evaluate("window.scrollTo(0, 0)")
            elif direction == "bottom":
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            else:
                dy = amount if direction == "down" else -amount
                await page.evaluate(f"window.scrollBy(0, {dy})")

            outcome["direction"] = direction
            outcome["amount"] = amount

        # 4. Visual Coordinates Fallback
        elif action_type == "visual_click":
            cx = float(getattr(action, "coordinate_x", 0) or action.get("coordinate_x", 0))
            cy = float(getattr(action, "coordinate_y", 0) or action.get("coordinate_y", 0))
            # Support normalized coordinates (0.0 to 1.0)
            viewport = page.viewport_size or {"width": 1280, "height": 800}
            actual_x = cx * viewport["width"] if 0.0 <= cx <= 1.0 else cx
            actual_y = cy * viewport["height"] if 0.0 <= cy <= 1.0 else cy
            await page.mouse.click(actual_x, actual_y)
            outcome["coordinate_x"] = actual_x
            outcome["coordinate_y"] = actual_y
            outcome["current_url"] = page.url

        # 5. File Upload / Download
        elif action_type == "upload_file":
            file_path = getattr(action, "file_path", None) or (
                action.get("file_path") if isinstance(action, dict) else None
            )
            await page.set_input_files(selector, file_path, timeout=timeout_ms)
            outcome["selector"] = selector
            outcome["file_path"] = file_path

        # 6. Waiting & Settle
        elif action_type == "wait_for":
            condition = getattr(action, "condition", None) or (
                action.get("condition") if isinstance(action, dict) else None
            ) or "domcontentloaded"
            try:
                if condition in ("load", "domcontentloaded", "networkidle"):
                    await page.wait_for_load_state(condition, timeout=timeout_ms)
                elif selector:
                    await page.wait_for_selector(selector, timeout=timeout_ms)
                elif isinstance(condition, (int, float)):
                    await page.wait_for_timeout(float(condition))
            except Exception as wait_err:
                if page.url and "about:blank" not in page.url:
                    outcome["settled_note"] = f"Wait condition '{condition}' settled with active document."
                else:
                    raise wait_err
            outcome["condition"] = condition

        # 7. Information Extraction & Verification
        elif action_type == "inspect":
            outcome["url"] = page.url
            outcome["title"] = await page.title()

        elif action_type == "read_text":
            target_sel = selector or "body"
            text_content = await page.text_content(target_sel, timeout=timeout_ms)
            outcome["selector"] = target_sel
            outcome["text_preview"] = (text_content or "")[:400]

        elif action_type == "extract_table":
            target_sel = selector or "table"
            table_data = await page.evaluate(f"""(sel) => {{
                const tbl = document.querySelector(sel);
                if (!tbl) return null;
                const headers = Array.from(tbl.querySelectorAll('th')).map(th => th.innerText.trim()).filter(Boolean);
                const rows = Array.from(tbl.querySelectorAll('tbody tr, tr')).map(tr => 
                    Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
                ).filter(r => r.length > 0);
                return {{ headers: headers, rows: rows }};
            }}""", target_sel)
            outcome["table_data"] = table_data

        elif action_type == "screenshot":
            screenshot_bytes = await page.screenshot(type="png", full_page=False)
            b64_str = base64.b64encode(screenshot_bytes).decode("ascii")
            outcome["screenshot_base64"] = b64_str[:100] + "...[truncated]"

        return outcome
