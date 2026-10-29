"""
Secure Staging Environment Generator for Unified AI Assistant.
Generates cryptographically random credentials and outputs a staging .env file.
"""

import os
import re
import secrets
from pathlib import Path


def generate_secure_secret(nbytes: int = 32) -> str:
    return secrets.token_hex(nbytes)


def extract_existing_gemini_key(root_dir: Path) -> str:
    api_env = root_dir / "services" / "api" / ".env"
    if api_env.exists():
        content = api_env.read_text(encoding="utf-8")
        match = re.search(r"^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$", content, re.MULTILINE)
        if match:
            return match.group(1).strip()
    return ""


def main():
    root_dir = Path(__file__).resolve().parent.parent
    target_env = root_dir / ".env.staging"

    jwt_secret = generate_secure_secret(32)
    db_password = generate_secure_secret(24)
    worker_token = generate_secure_secret(24)
    gemini_key = extract_existing_gemini_key(root_dir)

    staging_content = f"""# Staging Environment Configuration - Auto-generated
# Generated with cryptographically strong secrets. DO NOT COMMIT TO VERSION CONTROL.

ENVIRONMENT=production
IS_PRODUCTION=true
PORT=8000
AUTH_MODE=jwt
ALLOW_DEV_AUTH=false

# Authentication Secrets
JWT_SECRET_KEY={jwt_secret}
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_ISSUER=unified-ai-assistant
JWT_AUDIENCE=unified-ai-assistant-api

# PostgreSQL Database
POSTGRES_DB=unified_ai_staging
POSTGRES_USER=unified_ai_staging
POSTGRES_PASSWORD={db_password}
DATABASE_URL=postgresql+asyncpg://unified_ai_staging:{db_password}@db:5432/unified_ai_staging

# Network & Security
CORS_ORIGINS=["https://staging.assistant.example.com", "http://localhost", "http://127.0.0.1:5173"]
RATE_LIMIT_PER_MINUTE=120
MAX_REQUEST_BODY_BYTES=15728640

# Autonomous Browser Worker Boundary
BROWSER_HEADLESS=true
ALLOW_LOCAL_BROWSER_TARGETS=false
BROWSER_WORKER_CONCURRENCY=3
WORKER_AUTH_TOKEN={worker_token}

# AI Model Provider Credentials (Server-Side Only)
GEMINI_API_KEY={gemini_key}
DEFAULT_PROVIDER=gemini
DEFAULT_MODEL=gemini-3.8-flash
FALLBACK_MODEL=gemini-3.5-flash-lite
ENABLE_SIMULATED_SENSING=true
STORAGE_DIR=/app/services/api/data/storage
"""

    target_env.write_text(staging_content, encoding="utf-8")
    if os.name == "posix":
        try:
            target_env.chmod(0o600)
        except OSError:
            pass
    print(f"Successfully generated secure staging configuration at {target_env.name}")
    print("All secrets were generated using secrets.token_hex and safely written without stdout disclosure.")


if __name__ == "__main__":
    main()
