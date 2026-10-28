from typing import AsyncGenerator
from sqlalchemy import text
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
    """Creates database schema if not already managed by migrations (e.g. for sqlite test fallback)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
