import asyncio
import os
import sys
import pytest

# Add services/api and services/wifi-sensing to sys.path
api_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api"))
wifi_sensing_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing"))
if api_path not in sys.path:
    sys.path.insert(0, api_path)
if wifi_sensing_path not in sys.path:
    sys.path.insert(0, wifi_sensing_path)

from database import create_tables, engine


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Initializes tables for the test database session."""
    asyncio.run(create_tables())
    yield


@pytest.fixture(autouse=True)
def isolate_test_environment(monkeypatch):
    """Isolates unit tests from live external provider credentials and default overrides."""
    from config import get_settings
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEFAULT_PROVIDER", "DEFAULT_MODEL"):
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
