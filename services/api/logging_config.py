import logging
import re
from typing import Optional

# Regex patterns for sensitive tokens and credentials
SECRET_PATTERNS = [
    # Authorization header / Bearer tokens
    (re.compile(r"(Bearer\s+)[A-Za-z0-9_\-\.]{15,}", re.IGNORECASE), r"\1[REDACTED-TOKEN]"),
    # OpenAI API Keys
    (re.compile(r"sk-[A-Za-z0-9_\-]{20,}", re.IGNORECASE), "sk-[REDACTED-KEY]"),
    # Google API Keys (AIza and AQ patterns)
    (re.compile(r"AIza[0-9A-Za-z-_]{35}", re.IGNORECASE), "AIza[REDACTED-KEY]"),
    (re.compile(r"AQ\.[0-9A-Za-z-_]{25,}", re.IGNORECASE), "AQ.[REDACTED-KEY]"),
    # Anthropic API Keys
    (re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}", re.IGNORECASE), "sk-ant-[REDACTED-KEY]"),
    # Generic password / secret query params
    (re.compile(r"(password|secret|token|api_key)=([^&\s]+)", re.IGNORECASE), r"\1=[REDACTED]"),
]


class SecretRedactionFilter(logging.Filter):
    """Logging filter that scrubs authentication tokens, passwords, and API keys."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: (self.redact(str(v)) if isinstance(v, str) else v) for k, v in record.args.items()}
            elif isinstance(record.args, (list, tuple)):
                record.args = tuple(self.redact(str(arg)) if isinstance(arg, str) else arg for arg in record.args)
        return True

    @staticmethod
    def redact(text: str) -> str:
        for pattern, replacement in SECRET_PATTERNS:
            text = pattern.sub(replacement, text)
        return text


def configure_logging(level: int = logging.INFO) -> None:
    """Configures structured root logging with secret redaction filter."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Attach filter to existing handlers or configure StreamHandler
    redaction_filter = SecretRedactionFilter()
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        handler.addFilter(redaction_filter)
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.addFilter(redaction_filter)
