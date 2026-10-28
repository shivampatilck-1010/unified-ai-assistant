from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

from schemas.extraction import (
    ExtractRequest,
    ExtractResponse,
    ExtractedEventProposal,
    ExtractedReminderProposal,
    ExtractedTaskProposal,
)
from services.calendar_utils import ensure_utc, parse_rrule, validate_timezone
from services.model_gateway import ModelGateway, get_model_gateway

logger = logging.getLogger("nl_extractor")


def _clean_json_markdown(text: str) -> str:
    """Strip ```json ... ``` or ``` ... ``` wrappers from LLM output."""
    cleaned = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return cleaned


class NaturalLanguageExtractor:
    def __init__(self, gateway: Optional[ModelGateway] = None):
        self.gateway = gateway or get_model_gateway()

    async def extract(self, req: ExtractRequest) -> ExtractResponse:
        tz_name = validate_timezone(req.timezone)
        ref_time = req.reference_time or datetime.now(timezone.utc)
        if ref_time.tzinfo is None:
            ref_time = ref_time.replace(tzinfo=timezone.utc)

        # Compute reference time in user's local timezone for prompt context
        user_tz = ZoneInfo(tz_name)
        ref_local = ref_time.astimezone(user_tz)
        local_iso = ref_local.isoformat()
        weekday_name = ref_local.strftime("%A")

        if not self.gateway.is_any_provider_configured():
            raise ValueError(
                "No AI model provider is configured on the server. Add an API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) in the server environment to enable natural language extraction."
            )

        adapter, model_id = self.gateway.resolve_provider_and_model()

        system_prompt = f"""You are an intelligent calendar and task extraction engine.
Analyze the user's natural language input and extract any actionable tasks, calendar events, or reminders.

Current context:
- Current reference date and time (ISO): {local_iso}
- Day of the week: {weekday_name}
- User local timezone: {tz_name}

Rules for extraction:
1. Relative dates (e.g. "tomorrow", "this Friday", "next Monday at 3pm", "in 2 hours") MUST be calculated relative to {local_iso}.
2. For tasks:
   - title: concise action string
   - description: optional details
   - priority: 'low', 'medium', 'high', or 'urgent' (default 'medium')
   - due_date: ISO 8601 string with timezone offset (or null if unspecified)
   - timezone: '{tz_name}'
3. For calendar events:
   - title: event name
   - description: optional notes
   - start_time: ISO 8601 string with timezone offset
   - end_time: ISO 8601 string with timezone offset (default 1 hour after start if not specified)
   - all_day: true if a whole day is indicated, else false
   - location: optional meeting location/link
   - recurrence_rule: iCalendar RRULE format (e.g. FREQ=WEEKLY;INTERVAL=1;COUNT=10) if recurring, else null
   - timezone: '{tz_name}'
4. For reminders:
   - title: reminder prompt
   - scheduled_time: ISO 8601 string with timezone offset
   - timezone: '{tz_name}'
5. Output MUST be ONLY valid JSON matching this schema:
{{
  "tasks": [ ... ],
  "events": [ ... ],
  "reminders": [ ... ],
  "explanation": "Brief 1-sentence summary of what was extracted"
}}
Do NOT output any markdown backticks or text outside the JSON object.
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.text},
        ]

        raw_output_chunks = []
        try:
            async for chunk in adapter.generate_stream(messages, model=model_id):
                raw_output_chunks.append(chunk)
            raw_text = "".join(raw_output_chunks)
        except Exception as exc:
            logger.error("Failed model invocation during extraction: %s", exc)
            raise ValueError(f"AI extraction request failed: {str(exc)}") from exc

        cleaned = _clean_json_markdown(raw_text)

        try:
            parsed = json.loads(cleaned)
        except Exception as exc:
            logger.warning("Model produced invalid JSON for extraction: %s\nRaw output: %s", exc, raw_text)
            return ExtractResponse(
                tasks=[],
                events=[],
                reminders=[],
                reference_time=ref_time,
                timezone=tz_name,
                explanation=f"Could not parse model response into structured items: {raw_text[:200]}",
                requires_confirmation=True,
            )

        tasks: list[ExtractedTaskProposal] = []
        for t in parsed.get("tasks", []):
            try:
                due_val = None
                if t.get("due_date"):
                    due_val = datetime.fromisoformat(t["due_date"])
                tasks.append(
                    ExtractedTaskProposal(
                        title=t.get("title", "Untitled Task").strip(),
                        description=t.get("description"),
                        priority=t.get("priority", "medium") if t.get("priority") in {"low", "medium", "high", "urgent"} else "medium",
                        due_date=due_val,
                        timezone=tz_name,
                    )
                )
            except Exception as e:
                logger.warning("Skipping malformed task proposal: %s", e)

        events: list[ExtractedEventProposal] = []
        for ev in parsed.get("events", []):
            try:
                start_val = datetime.fromisoformat(ev["start_time"])
                end_val = datetime.fromisoformat(ev["end_time"]) if ev.get("end_time") else start_val
                rrule_val = ev.get("recurrence_rule")
                if rrule_val:
                    try:
                        parse_rrule(rrule_val)
                    except ValueError:
                        rrule_val = None
                events.append(
                    ExtractedEventProposal(
                        title=ev.get("title", "Untitled Event").strip(),
                        description=ev.get("description"),
                        start_time=start_val,
                        end_time=end_val,
                        timezone=tz_name,
                        all_day=bool(ev.get("all_day", False)),
                        location=ev.get("location"),
                        recurrence_rule=rrule_val,
                    )
                )
            except Exception as e:
                logger.warning("Skipping malformed event proposal: %s", e)

        reminders: list[ExtractedReminderProposal] = []
        for rem in parsed.get("reminders", []):
            try:
                sched_val = datetime.fromisoformat(rem["scheduled_time"])
                reminders.append(
                    ExtractedReminderProposal(
                        title=rem.get("title", "Reminder").strip(),
                        scheduled_time=sched_val,
                        timezone=tz_name,
                    )
                )
            except Exception as e:
                logger.warning("Skipping malformed reminder proposal: %s", e)

        return ExtractResponse(
            tasks=tasks,
            events=events,
            reminders=reminders,
            reference_time=ref_time,
            timezone=tz_name,
            explanation=parsed.get("explanation"),
            requires_confirmation=True,
        )


nl_extractor_instance = NaturalLanguageExtractor()
