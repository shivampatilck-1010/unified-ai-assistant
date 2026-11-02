"""Re-export WorkflowDiscoveryEngine from workflow_discovery for full backwards compatibility."""
from workflow_discovery import (
    COMMON_DISMISS_PATTERNS,
    AUTH_OR_CAPTCHA_PATTERNS,
    WorkflowDiscoveryEngine,
)

__all__ = [
    "COMMON_DISMISS_PATTERNS",
    "AUTH_OR_CAPTCHA_PATTERNS",
    "WorkflowDiscoveryEngine",
]
