import os
from functools import lru_cache
from typing import List, Optional

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Settings:
    """Application configuration loaded from environment variables."""

    def __init__(self):
        # Server settings
        self.host: str = os.getenv("API_HOST", os.getenv("HOST", "127.0.0.1"))
        self.port: int = int(os.getenv("API_PORT", os.getenv("PORT", "8000")))
        self.environment: str = os.getenv("ENVIRONMENT", "development")

        # CORS origins (narrowly configured for development)
        cors_str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
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
        self.default_provider: Optional[str] = os.getenv("DEFAULT_PROVIDER")
        self.default_model: Optional[str] = os.getenv("DEFAULT_MODEL")

        # Development identity boundary (for local single-user or auth mock)
        self.dev_user_id: str = os.getenv("DEV_USER_ID", "dev-user-default")

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
