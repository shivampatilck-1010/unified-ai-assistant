from typing import AsyncGenerator
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import get_settings
from models.base import Base

settings = get_settings()

# Engine arguments depending on dialect
connect_args = {}
if "sqlite" in settings.database_url:
    connect_args["check_same_thread"] = False
    connect_args["timeout"] = 30

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    connect_args=connect_args,
)

if "sqlite" in settings.database_url:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Alias for worker and background services
async_session_factory = AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency yielding an isolated async database session with automatic cleanup."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_readiness() -> bool:
    """Verifies active connectivity to the configured database."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            return True
    except Exception:
        return False


async def create_tables() -> None:
    """Creates database schema if not already managed by migrations and ensures 72h data retention columns exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Ensure 'expires_at' column exists for existing tables without breaking data
        retention_tables = [
            "conversations",
            "files",
            "wifi_sensing_events",
            "browser_tasks",
            "research_jobs",
            "workflows",
        ]

        for tbl in retention_tables:
            try:
                # Check for SQLite pragma or standard SQL
                if "sqlite" in settings.database_url:
                    cols_res = await conn.execute(text(f"PRAGMA table_info({tbl})"))
                    existing_cols = {row[1] for row in cols_res.fetchall()}
                else:
                    cols_res = await conn.execute(
                        text("SELECT column_name FROM information_schema.columns WHERE table_name = :t"),
                        {"t": tbl},
                    )
                    existing_cols = {row[0].lower() for row in cols_res.fetchall()}

                if existing_cols and "expires_at" not in existing_cols:
                    await conn.execute(
                        text(f"ALTER TABLE {tbl} ADD COLUMN expires_at TIMESTAMP")
                    )
                    # Backfill existing rows with 72h expiry from updated_at / created_at / now
                    if "sqlite" in settings.database_url:
                        await conn.execute(
                            text(f"UPDATE {tbl} SET expires_at = datetime('now', '+72 hours') WHERE expires_at IS NULL")
                        )
                    else:
                        await conn.execute(
                            text(f"UPDATE {tbl} SET expires_at = NOW() + INTERVAL '72 hours' WHERE expires_at IS NULL")
                        )
            except Exception:
                # Table might not exist yet or dialect-specific
                pass

        # Check for calibration_profile in wifi_sensor_configs
        try:
            if "sqlite" in settings.database_url:
                cols_res = await conn.execute(text("PRAGMA table_info(wifi_sensor_configs)"))
                cfg_cols = {row[1] for row in cols_res.fetchall()}
            else:
                cols_res = await conn.execute(
                    text("SELECT column_name FROM information_schema.columns WHERE table_name = 'wifi_sensor_configs'")
                )
                cfg_cols = {row[0].lower() for row in cols_res.fetchall()}
            if cfg_cols and "calibration_profile" not in cfg_cols:
                await conn.execute(
                    text("ALTER TABLE wifi_sensor_configs ADD COLUMN calibration_profile JSON DEFAULT '{}'")
                )
        except Exception:
            pass
