import logging
from typing import Any, Dict, List, Optional
from services.model_gateway import get_model_gateway

logger = logging.getLogger("intelligence.reasoning_engine")


class ReasoningEngine:
    """Provides model-driven reasoning, adaptive re-planning, and decision support for the intelligence core."""

    def __init__(self, model_gateway: Optional[Any] = None):
        self.gateway = model_gateway or get_model_gateway()

    def get_model_capabilities(self, provider_id: Optional[str] = None, model_id: Optional[str] = None) -> Dict[str, bool]:
        """Inspects model capabilities (vision, tools, structured output, reasoning)."""
        adapter, resolved_model = self.gateway.resolve_provider_and_model(
            requested_provider=provider_id,
            requested_model=model_id,
        )
        resolved_str = f"{adapter.provider_id} {resolved_model}".lower()
        has_vision = any(k in resolved_str for k in ("gemini", "gpt-4o", "claude-3-5", "vision", "omni"))
        has_tools = any(k in resolved_str for k in ("gemini", "gpt-4", "gpt-3.5", "claude"))
        has_reasoning = any(k in resolved_str for k in ("o1", "o3", "pro", "sonnet", "deepseek-r1"))

        return {
            "text": True,
            "vision": has_vision,
            "tool_calling": has_tools,
            "structured_output": True,
            "reasoning": has_reasoning,
            "streaming": True,
        }

    async def reason_step(
        self,
        goal: str,
        current_state: Dict[str, Any],
        history: List[Dict[str, str]],
        system_instruction: Optional[str] = None,
    ) -> str:
        """Executes a single reasoning inference turn to determine next action or conclude."""
        try:
            adapter, model_id = self.gateway.resolve_provider_and_model()
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            for h in history[-4:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            messages.append({
                "role": "user",
                "content": f"Objective: {goal}\nCurrent Observed State: {current_state}\nWhat is the optimal next decision?",
            })
            resp = await adapter.generate(messages=messages, model=model_id, temperature=0.2)
            return resp.content or "Proceed with planned sequence."
        except Exception as e:
            logger.debug("Reasoning turn fallback to heuristic: %s", e)
            return "Proceed with planned sequence."
