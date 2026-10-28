import ipaddress
import re
import socket
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple


class PolicyViolationError(Exception):
    """Raised when an action violates browser safety or security constraints."""
    pass


class ConsequentialActionError(Exception):
    """Raised when an action requires explicit user confirmation before execution."""
    def __init__(self, action: Any, reason: str):
        super().__init__(reason)
        self.action = action
        self.reason = reason


# Permitted action types allowlist
ALLOWED_ACTION_TYPES = {
    "navigate",
    "inspect",
    "read_text",
    "click",
    "type_text",
    "scroll",
    "wait_for",
    "screenshot",
}

# Blocked schemes
ALLOWED_SCHEMES = {"http", "https"}

# Consequential action heuristics (case-insensitive regex patterns)
CONSEQUENTIAL_PATTERNS = [
    (r"\b(buy|purchase|checkout|pay|payment|credit[_\s-]?card|order|billing|subscribe)\b", "Financial transaction or purchase operation"),
    (r"\b(delete|destroy|purge|remove[_\s-]?account|drop|truncate)\b", "Destructive deletion operation"),
    (r"\b(send[_\s-]?(email|message|chat)|publish|tweet|post)\b", "Public communications or message transmission"),
    (r"\b(password|security[_\s-]?settings|api[_\s-]?key|auth[_\s-]?token|secret)\b", "Security or authentication credential alteration"),
]


def validate_url(url: Optional[str], allowed_domains: Optional[List[str]] = None, allow_local: bool = False) -> None:
    """Validates that a URL is safe for navigation and does not target internal or prohibited endpoints."""
    if not url or not isinstance(url, str):
        raise PolicyViolationError("URL must be a non-empty string.")

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as e:
        raise PolicyViolationError(f"Malformed URL: {e}")

    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise PolicyViolationError(
            f"Prohibited URL scheme '{scheme}'. Only HTTP and HTTPS are permitted."
        )

    hostname = parsed.hostname
    if not hostname:
        raise PolicyViolationError("URL must specify a valid hostname.")

    hostname_lower = hostname.lower()

    # Blocked hostname patterns (SSRF prevention)
    if not allow_local:
        if hostname_lower in ("localhost", "0.0.0.0", "127.0.0.1", "::1", "metadata.google.internal") or \
           hostname_lower.endswith(".local") or hostname_lower.endswith(".internal"):
            raise PolicyViolationError(
                f"Navigation to local/internal network target '{hostname}' is prohibited."
            )

        # IP check (both direct IP in hostname and DNS resolution)
        try:
            ip = ipaddress.ip_address(hostname_lower)
            if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                raise PolicyViolationError(
                    f"Navigation to private/loopback IP address '{ip}' is prohibited."
                )
        except ValueError:
            # It's a hostname, perform DNS lookup to detect DNS-rebinding / internal resolution
            try:
                addr_info = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
                for entry in addr_info:
                    resolved_ip_str = entry[4][0]
                    resolved_ip = ipaddress.ip_address(resolved_ip_str)
                    if resolved_ip.is_loopback or resolved_ip.is_private or resolved_ip.is_link_local or resolved_ip.is_reserved:
                        raise PolicyViolationError(
                            f"Hostname '{hostname}' resolves to private/loopback IP '{resolved_ip}', which is prohibited."
                        )
            except socket.gaierror:
                # If DNS fails, we allow it to fail during browser navigation rather than blocking here
                pass

    # Domain scope check
    if allowed_domains and len(allowed_domains) > 0:
        normalized_allowed = [d.lower().strip() for d in allowed_domains if d.strip()]
        domain_matched = False
        for allowed in normalized_allowed:
            if hostname_lower == allowed or hostname_lower.endswith("." + allowed):
                domain_matched = True
                break
        if not domain_matched:
            raise PolicyViolationError(
                f"Navigation to '{hostname}' is not permitted by the approved domain scope: {allowed_domains}"
            )


def validate_action(action: Any, approved_scope: Optional[Dict[str, Any]] = None, allow_local: bool = False) -> None:
    """Deterministically validates an action before execution against policies and allowlists."""
    action_type = getattr(action, "action_type", None) or action.get("action_type")
    if hasattr(action_type, "value"):
        action_type = action_type.value

    if action_type not in ALLOWED_ACTION_TYPES:
        raise PolicyViolationError(
            f"Action type '{action_type}' is not supported or prohibited. Allowed: {sorted(list(ALLOWED_ACTION_TYPES))}"
        )

    scope = approved_scope or {}
    allowed_actions = scope.get("allowed_actions")
    if allowed_actions and action_type not in allowed_actions:
        raise PolicyViolationError(
            f"Action '{action_type}' is not permitted in the approved task scope."
        )

    # Validate action parameters
    if action_type == "navigate":
        url = getattr(action, "url", None) or (action.get("url") if isinstance(action, dict) else None)
        validate_url(url, allowed_domains=scope.get("allowed_domains"), allow_local=allow_local)

    elif action_type in ("click", "type_text", "read_text"):
        selector = getattr(action, "selector", None) or (action.get("selector") if isinstance(action, dict) else None)
        if not selector or not isinstance(selector, str):
            raise PolicyViolationError(f"Action '{action_type}' requires a non-empty CSS or text selector.")
        # Reject raw JavaScript execution attempts inside selectors
        if re.search(r"(javascript:|eval\(|<script|Function\()", selector, re.IGNORECASE):
            raise PolicyViolationError("Potentially dangerous script pattern detected in element locator.")

    elif action_type == "type_text":
        text = getattr(action, "text", None) or (action.get("text") if isinstance(action, dict) else None)
        if text is None:
            raise PolicyViolationError("Action 'type_text' requires a 'text' parameter.")


def is_consequential_action(action: Any, task_goal: str = "") -> Tuple[bool, Optional[str]]:
    """Analyzes an action to determine whether it is consequential and requires explicit user confirmation."""
    is_consequential_flag = getattr(action, "is_consequential", False) or (
        action.get("is_consequential", False) if isinstance(action, dict) else False
    )
    consequential_reason = getattr(action, "consequential_reason", None) or (
        action.get("consequential_reason") if isinstance(action, dict) else None
    )

    if is_consequential_flag:
        return True, consequential_reason or "Action was pre-flagged as consequential."

    action_type = getattr(action, "action_type", None) or (
        action.get("action_type") if isinstance(action, dict) else None
    )
    if hasattr(action_type, "value"):
        action_type = action_type.value

    # Routine read-only or navigation actions are non-consequential unless pre-flagged
    if action_type in ("navigate", "inspect", "read_text", "scroll", "wait_for"):
        return False, None

    # For mutating actions (click, type_text), analyze selector and input text
    target_text = ""
    for field in ("selector", "text"):
        val = getattr(action, field, None) or (action.get(field) if isinstance(action, dict) else None)
        if val and isinstance(val, str):
            target_text += " " + val

    # Password input detection
    if 'type="password"' in target_text.lower() or 'password' in target_text.lower():
        return True, "Interaction targets sensitive credential or password field."

    # Heuristic pattern checks
    for pattern, reason in CONSEQUENTIAL_PATTERNS:
        if re.search(pattern, target_text, re.IGNORECASE):
            return True, f"{reason} detected in action ({pattern})"

    return False, None
