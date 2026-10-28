import re
from typing import Optional, Tuple

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior)\s+(instructions|directives|prompts)",
    r"system\s+prompt\s+override",
    r"you\s+are\s+now\s+(in\s+)?(developer\s+mode|dan|jailbreak)",
    r"disregard\s+(the\s+)?(previous|initial)\s+(rules|constraints)",
    r"new\s+instruction:\s+",
    r"reveal\s+(the\s+)?(system\s+prompt|api\s+keys?|passwords?|credentials?)",
    r"exfiltrate\s+",
    r"send\s+(user\s+)?(cookies?|session|tokens?)\s+to",
]


def sanitize_page_text(raw_text: Optional[str], max_length: int = 5000) -> str:
    """Sanitizes text extracted from untrusted webpage DOM before processing."""
    if not raw_text:
        return ""
    # Strip null bytes and control chars except newlines and tabs
    sanitized = "".join(c for c in raw_text if c in ("\n", "\t") or (ord(c) >= 32 and ord(c) != 127))
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "\n...[truncated untrusted content]"
    return sanitized.strip()


def detect_prompt_injection(content: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Analyzes untrusted webpage content for prompt injection or system override attempts."""
    if not content:
        return False, None

    for pattern in INJECTION_PATTERNS:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            return True, f"Untrusted content contains suspicious prompt injection pattern: '{match.group(0)}'"

    return False, None
