from fastapi.testclient import TestClient
import sys
import os

# Add services/api to sys.path so tests can import main
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api")))

from main import app  # noqa: E402

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "unified-ai-assistant-api"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "unified-ai-assistant-api"
    assert data["health_url"] == "/health"
