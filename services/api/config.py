import os
from functools import lru_cache
from typing import List, Optional

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    from dotenv import load_dotenv

    _env_path = os.path.join(_BASE_DIR, ".env")
    if os.path.isfile(_env_path):
        load_dotenv(_env_path)
    else:
        load_dotenv()
except ImportError:
    pass


class Settings:
    """Application configuration loaded from environment variables."""

    def __init__(self):
        # Server settings
        self.host: str = os.getenv("API_HOST", os.getenv("HOST", "127.0.0.1"))
        self.port: int = int(os.getenv("API_PORT", os.getenv("PORT", "8000")))
        self.environment: str = os.getenv("ENVIRONMENT", "development")

        # CORS origins (configured for local dev and Cloudflare Pages production frontend)
        cors_str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,https://unified-ai-assistant.pages.dev").strip()
        if cors_str.startswith("[") and cors_str.endswith("]"):
            try:
                import json
                self.cors_origins: List[str] = json.loads(cors_str)
            except Exception:
                self.cors_origins: List[str] = [origin.strip().strip("'\"") for origin in cors_str.strip("[]").split(",") if origin.strip()]
        else:
            self.cors_origins: List[str] = [origin.strip() for origin in cors_str.split(",") if origin.strip()]

        # Database URL
        default_db_file = os.path.join(_BASE_DIR, "unified_ai.db").replace("\\", "/")
        raw_db_url = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{default_db_file}")

        if raw_db_url.startswith("postgres://"):
            raw_db_url = raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+"):
            raw_db_url = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        self.database_url: str = raw_db_url

        # AI Provider API Keys (server-side ONLY)
        self.openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
        self.gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY")

        # Default provider / model selection
        self.default_provider: Optional[str] = os.getenv("DEFAULT_PROVIDER", os.getenv("DEFAULT_MODEL_PROVIDER"))
        self.default_model: Optional[str] = os.getenv("DEFAULT_MODEL", os.getenv("DEFAULT_MODEL_NAME"))
        self.allow_provider_fallback: bool = os.getenv("ALLOW_PROVIDER_FALLBACK", "false").lower() in ("true", "1", "yes")

        # Development identity boundary (for local single-user or auth mock)
        self.dev_user_id: str = os.getenv("DEV_USER_ID", "dev-user-default")

        # Phase 8: Authentication & Security Hardening Settings
        self.is_production: bool = (
            self.environment.lower() == "production"
            or os.getenv("IS_PRODUCTION", "false").lower() in ("true", "1", "yes")
        )
        self.auth_mode: str = os.getenv("AUTH_MODE", "jwt" if self.is_production else "dev_fallback")
        self.jwt_secret_key: Optional[str] = os.getenv("JWT_SECRET_KEY", "unified-ai-assistant-super-secure-production-signing-key-32chars")
        self.jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.jwt_issuer: str = os.getenv("JWT_ISSUER", "unified-ai-assistant")
        self.jwt_audience: str = os.getenv("JWT_AUDIENCE", "unified-ai-assistant-api")
        self.allow_dev_auth: bool = os.getenv(
            "ALLOW_DEV_AUTH", "false" if self.is_production else "true"
        ).lower() in ("true", "1", "yes")

        # Rate limiting and concurrency
        self.browser_worker_concurrency: int = int(os.getenv("BROWSER_WORKER_CONCURRENCY", "3"))
        self.rate_limit_per_minute: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))
        self.max_request_body_bytes: int = int(os.getenv("MAX_REQUEST_BODY_BYTES", str(25 * 1024 * 1024)))

        # Production startup validations
        if self.is_production:
            if self.allow_dev_auth:
                raise ValueError("Production configuration error: ALLOW_DEV_AUTH must be false in production.")
            if not self.jwt_secret_key or len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "Production configuration error: JWT_SECRET_KEY must be provided and at least 32 characters in production."
                )

        # Browser Agent Worker settings
        self.browser_headless: bool = os.getenv("BROWSER_HEADLESS", "true").lower() in ("true", "1", "yes")
        self.browser_action_timeout_ms: int = int(os.getenv("BROWSER_ACTION_TIMEOUT_MS", "15000"))
        self.browser_task_deadline_seconds: int = int(os.getenv("BROWSER_TASK_DEADLINE_SECONDS", "180"))
        self.browser_max_steps: int = int(os.getenv("BROWSER_MAX_STEPS", "15"))
        self.allow_local_browser_targets: bool = os.getenv("ALLOW_LOCAL_BROWSER_TARGETS", "false").lower() in ("true", "1", "yes")

        # Phase 5: Files & Knowledge Storage & Quota Settings
        self.storage_dir: str = os.getenv("STORAGE_DIR", os.path.join(_BASE_DIR, "data", "storage"))
        self.max_upload_size_bytes: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(20 * 1024 * 1024)))  # 20 MB
        self.max_user_storage_bytes: int = int(os.getenv("MAX_USER_STORAGE_BYTES", str(100 * 1024 * 1024)))  # 100 MB
        self.max_user_file_count: int = int(os.getenv("MAX_USER_FILE_COUNT", "50"))
        self.max_extraction_chars: int = int(os.getenv("MAX_EXTRACTION_CHARS", "2000000"))


@lru_cache()
def get_settings() -> Settings:
    return Settings()
