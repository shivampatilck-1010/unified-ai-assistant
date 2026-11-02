import json
import re
import urllib.parse
from typing import Any, Dict, List, Optional

from schemas.browser_task import (
    BrowserAction,
    BrowserActionType,
    BrowserPlan,
    BrowserPlanStep,
)
from policy import is_consequential_action, validate_url


def extract_url_from_text(text: str) -> Optional[str]:
    """Finds the first HTTP/HTTPS URL in text."""
    match = re.search(r"https?://[^\s\"'>]+", text)
    return match.group(0) if match else None


def generate_deterministic_plan(task_description: str, initial_url: Optional[str] = None, allowed_domains: Optional[List[str]] = None) -> BrowserPlan:
    """Generates a safe, deterministic plan when no model provider is available or for offline tasks."""
    target_url = initial_url or extract_url_from_text(task_description)
    domains: List[str] = list(allowed_domains or [])

    if target_url:
        parsed = urllib.parse.urlparse(target_url)
        if parsed.hostname and parsed.hostname not in domains:
            domains.append(parsed.hostname)

    steps: List[BrowserPlanStep] = []

    if target_url:
        # Step 1: Navigate to target
        steps.append(
            BrowserPlanStep(
                step_index=1,
                description=f"Navigate to target URL: {target_url}",
                action=BrowserAction(
                    action_type=BrowserActionType.NAVIGATE,
                    url=target_url,
                    timeout_ms=30000,
                ),
            )
        )
        # Step 2: Wait for DOM readiness
        steps.append(
            BrowserPlanStep(
                step_index=2,
                description="Wait for page DOM content to load",
                action=BrowserAction(
                    action_type=BrowserActionType.WAIT_FOR,
                    condition="domcontentloaded",
                    timeout_ms=10000,
                ),
            )
        )
        # Step 3: Inspect page title and structure
        steps.append(
            BrowserPlanStep(
                step_index=3,
                description="Inspect page title and structure",
                action=BrowserAction(
                    action_type=BrowserActionType.INSPECT,
                ),
            )
        )
        # Step 4: Read visible text from main content or body
        steps.append(
            BrowserPlanStep(
                step_index=4,
                description="Read visible text from page body",
                action=BrowserAction(
                    action_type=BrowserActionType.READ_TEXT,
                    selector="body",
                ),
            )
        )
    else:
        # Generic inspection step
        steps.append(
            BrowserPlanStep(
                step_index=1,
                description="Inspect current browser state",
                action=BrowserAction(
                    action_type=BrowserActionType.INSPECT,
                ),
            )
        )

    # Check for consequential triggers in user's prompt
    for step in steps:
        consequential, reason = is_consequential_action(step.action, task_description)
        if consequential:
            step.action.is_consequential = True
            step.action.consequential_reason = reason

    return BrowserPlan(
        goal=task_description,
        steps=steps,
        estimated_steps=len(steps),
        allowed_domains=domains,
    )


async def generate_browser_plan(
    task_description: str,
    initial_url: Optional[str] = None,
    allowed_domains: Optional[List[str]] = None,
    model_gateway: Optional[Any] = None,
) -> BrowserPlan:
    """Creates a structured, validated browser plan using the Model Gateway if configured, or deterministic template."""
    # If gateway has active provider, attempt structured model planning
    if model_gateway and model_gateway.is_any_provider_configured():
        try:
            plan = await _generate_plan_via_model(task_description, initial_url, allowed_domains, model_gateway)
            if plan:
                return plan
        except Exception:
            # Fall back to deterministic planner on model generation failure
            pass

    return generate_deterministic_plan(task_description, initial_url, allowed_domains)


async def _generate_plan_via_model(
    task_description: str,
    initial_url: Optional[str],
    allowed_domains: Optional[List[str]],
    model_gateway: Any,
) -> Optional[BrowserPlan]:
    """Prompts the configured model to generate a strict JSON browser plan."""
    prompt = f"""You are an autonomous browser agent planner.
Generate a structured, safe browser execution plan for the following task:
"{task_description}"

Initial URL: {initial_url or "None specified"}
Allowed domains: {allowed_domains or "Derive from URL"}

Allowed action types ONLY: navigate, inspect, read_text, click, type_text, scroll, wait_for, screenshot.
Do NOT output code or markdown prose. Output ONLY valid JSON conforming to this schema:
{{
  "goal": "{task_description}",
  "allowed_domains": ["example.com"],
  "estimated_steps": 3,
  "steps": [
    {{
      "step_index": 1,
      "description": "Navigate to example.com",
      "action": {{
        "action_type": "navigate",
        "url": "https://example.com"
      }}
    }}
  ]
}}
"""
    # Use non-streaming generate if available, or collect stream
    collected_text = ""
    async for chunk in model_gateway.stream_chat(
        messages=[{"role": "user", "content": prompt}],
        system_instruction="You are a browser task planner. Return only valid JSON adhering to the specified schema.",
    ):
        collected_text += chunk

    # Parse JSON from model output
    clean_json = re.sub(r"^```(?:json)?\s*|\s*```$", "", collected_text.strip(), flags=re.MULTILINE)
    data = json.loads(clean_json)
    return BrowserPlan(**data)
