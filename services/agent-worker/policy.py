import ipaddress
import re
import socket
import urllib.parse
from typing import Any, Dict, List, Optional, Set, Tuple


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
    "select_option",
    "press_key",
    "scroll",
    "wait_for",
    "screenshot",
}

# Permitted URL schemes
ALLOWED_SCHEMES = {"http", "https"}

# Allowed ports in non-local production mode
ALLOWED_WEB_PORTS: Set[int] = {80, 443, 8080}

# Strictly prohibited system, database, and control plane ports
PROHIBITED_PORTS: Set[int] = {
    21, 22, 23, 25, 53, 67, 68, 69, 110, 111, 123, 135, 137, 138, 139,
    143, 161, 389, 445, 514, 636, 1433, 1521, 2049, 2375, 2376, 2379,
    3306, 5432, 5900, 6379, 7001, 8000, 8500, 9000, 9092, 9200, 9300,
    11211, 27017, 28017
}

# Explicit cloud metadata hostnames and IP strings
CLOUD_METADATA_TARGETS = {
    "169.254.169.254",
    "169.254.170.2",
    "100.100.100.200",
    "fd00:ec2::254",
    "metadata.google.internal",
    "metadata",
    "instance-data",
}

CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")
LINK_LOCAL_NETWORK = ipaddress.ip_network("169.254.0.0/16")
NAT64_PREFIX = ipaddress.ip_network("64:ff9b::/96")

# Consequential action heuristics (case-insensitive regex patterns)
CONSEQUENTIAL_PATTERNS = [
    (r"\b(buy|purchase|checkout|pay|payment|credit[_\s-]?card|order|billing|subscribe)\b", "Financial transaction or purchase operation"),
    (r"\b(delete|destroy|purge|remove[_\s-]?account|drop|truncate)\b", "Destructive deletion operation"),
    (r"\b(send[_\s-]?(email|message|chat)|publish|tweet|post)\b", "Public communications or message transmission"),
    (r"\b(password|security[_\s-]?settings|api[_\s-]?key|auth[_\s-]?token|secret)\b", "Security or authentication credential alteration"),
]


def _check_ip_address_safety(ip: ipaddress._BaseAddress) -> None:
    """Verifies that an IP address is not private, loopback, link-local, or cloud metadata."""
    if hasattr(ip, "ipv4_mapped") and ip.ipv4_mapped:
        _check_ip_address_safety(ip.ipv4_mapped)
        return

    # Handle RFC 6052 Well-Known Prefix (64:ff9b::/96) used in DNS64/NAT64 translation
    if isinstance(ip, ipaddress.IPv6Address) and ip in NAT64_PREFIX:
        embedded_ipv4 = ipaddress.IPv4Address(ip.packed[-4:])
        _check_ip_address_safety(embedded_ipv4)
        return

    ip_str = str(ip)
    if ip_str in CLOUD_METADATA_TARGETS:
        raise PolicyViolationError(f"Targeting cloud metadata endpoint '{ip_str}' is strictly prohibited.")

    if ip.is_loopback:
        raise PolicyViolationError(f"Targeting loopback IP '{ip_str}' is prohibited.")
    if ip.is_private:
        raise PolicyViolationError(f"Targeting private network IP '{ip_str}' is prohibited.")
    if ip.is_link_local:
        raise PolicyViolationError(f"Targeting link-local IP '{ip_str}' is prohibited.")
    if ip.is_reserved:
        raise PolicyViolationError(f"Targeting reserved IP '{ip_str}' is prohibited.")
    if ip.is_multicast:
        raise PolicyViolationError(f"Targeting multicast IP '{ip_str}' is prohibited.")
    if ip.is_unspecified:
        raise PolicyViolationError(f"Targeting unspecified IP '{ip_str}' is prohibited.")

    # Additional subnet checks for IPv4
    if isinstance(ip, ipaddress.IPv4Address):
        if ip in LINK_LOCAL_NETWORK:
            raise PolicyViolationError(f"Targeting link-local subnet '{ip_str}' is prohibited.")
        if ip in CGNAT_NETWORK:
            raise PolicyViolationError(f"Targeting carrier-grade NAT address '{ip_str}' is prohibited.")


def _try_parse_ip_representation(hostname: str) -> Optional[ipaddress._BaseAddress]:
    """Attempts to parse standard, decimal integer, hex, or octal IP address evasions."""
    clean_host = hostname.strip().strip("[]").lower()

    # 1. Standard IP format
    try:
        return ipaddress.ip_address(clean_host)
    except ValueError:
        pass

    def _parse_segment(p: str) -> Optional[int]:
        try:
            if p.startswith(("0x", "0X")):
                return int(p, 16)
            elif p.startswith(("0o", "0O")):
                return int(p, 8)
            elif p.startswith("0") and len(p) > 1 and p.isdigit():
                return int(p, 8)
            elif p.isdigit():
                return int(p, 10)
        except Exception:
            return None
        return None

    # 2. Pure decimal/hex/octal integer (e.g., 2130706433 -> 127.0.0.1 or 2852039166 -> 169.254.169.254)
    val = _parse_segment(clean_host)
    if val is not None and 0 <= val <= 0xFFFFFFFF:
        return ipaddress.IPv4Address(val)

    # 3. Dotted quads with octal, hex, or decimal segments (e.g., 0177.0.0.1 or 0x7f.0.0.1)
    parts = clean_host.split(".")
    if len(parts) == 4:
        quads = [_parse_segment(p) for p in parts]
        if all(q is not None and 0 <= q <= 255 for q in quads):
            val = (quads[0] << 24) + (quads[1] << 16) + (quads[2] << 8) + quads[3]
            return ipaddress.IPv4Address(val)

    return None


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

    # Reject embedded userinfo (e.g., http://user:pass@host)
    if parsed.username or parsed.password:
        raise PolicyViolationError("Embedded credentials in URLs are strictly prohibited.")

    hostname = parsed.hostname
    if not hostname:
        raise PolicyViolationError("URL must specify a valid hostname.")

    hostname_lower = hostname.lower().strip()

    # Port validation
    port = parsed.port
    if port is not None:
        if port in PROHIBITED_PORTS:
            raise PolicyViolationError(f"Access to prohibited service port '{port}' is blocked.")
        if not allow_local and port not in ALLOWED_WEB_PORTS:
            raise PolicyViolationError(
                f"Port '{port}' is prohibited. Only standard web ports {sorted(list(ALLOWED_WEB_PORTS))} are permitted."
            )

    # Blocked hostname patterns (SSRF and cloud metadata prevention)
    if not allow_local:
        if hostname_lower in CLOUD_METADATA_TARGETS or \
           hostname_lower in ("localhost", "0.0.0.0", "127.0.0.1", "::1") or \
           hostname_lower.endswith(".local") or \
           hostname_lower.endswith(".internal") or \
           hostname_lower.endswith(".localhost"):
            raise PolicyViolationError(
                f"Navigation to local/internal network target '{hostname}' is prohibited."
            )

        # Check for numeric or evasion IP representations
        parsed_ip = _try_parse_ip_representation(hostname_lower)
        if parsed_ip is not None:
            _check_ip_address_safety(parsed_ip)
        else:
            # It's a hostname, perform DNS lookup to detect DNS-rebinding / internal resolution
            try:
                addr_info = socket.getaddrinfo(hostname_lower, None, proto=socket.IPPROTO_TCP)
                for entry in addr_info:
                    resolved_ip_str = entry[4][0]
                    try:
                        resolved_ip = ipaddress.ip_address(resolved_ip_str)
                        _check_ip_address_safety(resolved_ip)
                    except ValueError:
                        pass
            except socket.gaierror:
                # If DNS fails here, browser navigation will fail naturally
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

    elif action_type in ("click", "type_text", "read_text", "select_option"):
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

    elif action_type == "press_key":
        key = getattr(action, "key", None) or getattr(action, "text", None) or (
            action.get("key") or action.get("text") if isinstance(action, dict) else None
        )
        if not key:
            raise PolicyViolationError("Action 'press_key' requires a 'key' or 'text' parameter (e.g. 'Enter').")


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
