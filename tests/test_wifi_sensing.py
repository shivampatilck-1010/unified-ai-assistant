import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional
import pytest
from fastapi.testclient import TestClient

from database import async_session_factory
from hardware_adapter import HardwareSensorAdapter
from main import app
from models.wifi_sensing import WifiSensingAudit, WifiSensingEvent, WifiSensorConfig
from presence_estimator import BaselinePresenceEstimator
from providers.base import BaseProviderAdapter
from schemas.provider import ModelInfo
from schemas.wifi_sensing import SensorConfigCreate, SensorConfigUpdate
from sensing_types import RawSensorSample, utc_now
from services.model_gateway import get_model_gateway
from services.wifi_sensing_service import WifiSensingService
from services.wifi_sensing_tool import WifiSensingTool
from synthetic_simulator import SyntheticSensorSimulator

client = TestClient(app)


class MockSensingChatAdapter(BaseProviderAdapter):
    def __init__(self, reply: str = "The room is currently showing motion in simulation mode."):
        self.reply = reply

    @property
    def provider_id(self) -> str:
        return "openai"

    def is_configured(self) -> bool:
        return True

    def list_models(self) -> List[ModelInfo]:
        return [
            ModelInfo(
                id="gpt-4o",
                name="GPT-4o",
                provider="openai",
                description="Mock model for sensing chat test",
            )
        ]

    async def generate_text(
        self, messages: List[Dict[str, Any]], model: Optional[str] = None
    ) -> str:
        return self.reply

    async def generate_stream(
        self, messages: List[Dict[str, Any]], model: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        # Yield the response in chunks
        for token in self.reply.split():
            yield token + " "


def test_sensing_service_status_and_capabilities():
    """Verifies sensing status, synthetic capability declaration, and honest hardware unavailability."""
    # 1. Status endpoint
    res = client.get("/api/sensing/status", headers={"X-User-Id": "test_user_status"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "operational"
    assert data["service"] == "wifi-sensing-subsystem"
    assert data["simulation_mode"] is True
    assert data["hardware_detected"] is False

    # 2. Capabilities endpoint
    res = client.get("/api/sensing/capabilities")
    assert res.status_code == 200
    caps = res.json()
    assert caps["simulation_mode"] is True
    assert caps["hardware_available"] is False
    assert len(caps["providers"]) >= 2

    # Synthetic provider check
    sim = next(p for p in caps["providers"] if p["provider_id"] == "synthetic_csi_simulator")
    assert sim["is_simulated"] is True
    assert sim["is_available"] is True
    assert sim["requires_authorization"] is True

    # Hardware adapter check
    hw = next(p for p in caps["providers"] if p["provider_id"] == "physical_csi_hardware")
    assert hw["is_hardware"] is True
    assert hw["is_available"] is False
    assert "No compatible physical CSI" in hw["unavailability_reason"]


def test_sensor_config_crud_and_validation():
    """Tests creating, validating, updating, and de-authorizing sensor room configurations."""
    uid = uuid.uuid4().hex[:6]
    headers = {"X-User-Id": f"test_user_cfg_{uid}"}
    room_id = f"conf_{uid}"

    # 1. Invalid room_id characters
    res = client.post(
        "/api/sensing/configs",
        headers=headers,
        json={
            "room_id": "Bad Room Name with Spaces!",
            "room_name": "Meeting Room",
            "is_authorized": True,
        },
    )
    assert res.status_code in (400, 422)

    # 2. Valid creation
    res = client.post(
        "/api/sensing/configs",
        headers=headers,
        json={
            "room_id": room_id,
            "room_name": "Conference Room Alpha",
            "is_authorized": True,
            "simulation_speed": 1.5,
            "retention_days": 14,
        },
    )
    assert res.status_code == 201
    cfg = res.json()
    assert cfg["room_id"] == room_id
    assert cfg["room_name"] == "Conference Room Alpha"
    assert cfg["is_authorized"] is True
    assert cfg["is_active"] is False
    assert cfg["simulation_speed"] == 1.5
    assert cfg["retention_days"] == 14
    config_id = cfg["id"]

    # 3. Duplicate room_id rejection
    res = client.post(
        "/api/sensing/configs",
        headers=headers,
        json={
            "room_id": room_id,
            "room_name": "Duplicate Room",
            "is_authorized": True,
        },
    )
    assert res.status_code == 400
    assert "already exists" in res.json()["detail"]

    # 4. List configs
    res = client.get("/api/sensing/configs", headers=headers)
    assert res.status_code == 200
    configs = res.json()
    assert any(c["id"] == config_id for c in configs)

    # 5. Patch config
    res = client.patch(
        f"/api/sensing/configs/{config_id}",
        headers=headers,
        json={"room_name": "Conference Alpha Exec", "retention_days": 30},
    )
    assert res.status_code == 200
    patched = res.json()
    assert patched["room_name"] == "Conference Alpha Exec"
    assert patched["retention_days"] == 30


def test_simulation_lifecycle_start_stop_reset():
    """Tests starting, ticking, stopping, and resetting synthetic simulation."""
    uid = uuid.uuid4().hex[:6]
    headers = {"X-User-Id": f"test_user_sim_{uid}"}
    room_id = f"lab_{uid}"

    # 1. Create an unauthorized room
    res = client.post(
        "/api/sensing/configs",
        headers=headers,
        json={
            "room_id": room_id,
            "room_name": "Lab Room Unauthorized",
            "is_authorized": False,
        },
    )
    assert res.status_code == 201
    cfg_id = res.json()["id"]

    # Attempting to start without authorization must fail
    res = client.post(
        "/api/sensing/simulation/start",
        headers=headers,
        json={"room_id": room_id},
    )
    assert res.status_code == 400
    assert "Consent required" in res.json()["detail"]

    # Grant authorization
    res = client.patch(
        f"/api/sensing/configs/{cfg_id}",
        headers=headers,
        json={"is_authorized": True},
    )
    assert res.status_code == 200
    assert res.json()["is_authorized"] is True

    # 2. Start simulation
    res = client.post(
        "/api/sensing/simulation/start",
        headers=headers,
        json={"room_id": room_id, "speed": 2.0},
    )
    assert res.status_code == 200
    start_data = res.json()
    assert start_data["is_active"] is True
    assert start_data["simulation_mode"] is True
    assert start_data["action"] == "started"

    # Verify event was emitted immediately
    res = client.get(f"/api/sensing/events?room_id={room_id}", headers=headers)
    assert res.status_code == 200
    events = res.json()["events"]
    assert len(events) >= 1
    assert events[0]["is_simulated"] is True
    assert events[0]["room_id"] == room_id

    # 3. Trigger manual step tick
    res = client.post(
        "/api/sensing/simulation/step",
        headers=headers,
        json={"room_id": room_id},
    )
    assert res.status_code == 200
    step_event = res.json()
    assert step_event is not None
    assert step_event["is_simulated"] is True
    assert step_event["presence_state"] in ("vacant", "presence", "motion")

    # 4. Stop simulation
    res = client.post(
        "/api/sensing/simulation/stop",
        headers=headers,
        json={"room_id": room_id},
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # 5. Reset simulation
    res = client.post(
        "/api/sensing/simulation/reset",
        headers=headers,
        json={"room_id": room_id},
    )
    assert res.status_code == 200
    assert res.json()["action"] == "reset"


def test_presence_estimator_baseline_and_missing_data():
    """Unit tests the presence estimation baseline for missing, vacant, stationary, and motion regimes."""
    estimator = BaselinePresenceEstimator()
    now = utc_now()

    # 1. Corrupted or missing data -> unknown state
    invalid_sample = RawSensorSample(
        timestamp=now,
        room_id="room_1",
        sensor_type="synthetic_csi",
        is_simulated=True,
        rssi_dbm=-999.0,
        sample_count=0,
        subcarrier_variance=0.0,
        doppler_energy=0.0,
        noise_floor_dbm=-95.0,
        quality_score=0.2,
    )
    est = estimator.estimate(invalid_sample)
    assert est.presence_state == "unknown"
    assert est.presence_probability is None
    assert est.quality_score == 0.0

    # 2. Ambient vacant noise floor
    vacant_sample = RawSensorSample(
        timestamp=now,
        room_id="room_1",
        sensor_type="synthetic_csi",
        is_simulated=True,
        rssi_dbm=-65.0,
        sample_count=100,
        subcarrier_variance=0.015,
        doppler_energy=0.008,
        noise_floor_dbm=-92.0,
        quality_score=0.98,
    )
    est = estimator.estimate(vacant_sample)
    assert est.presence_state == "vacant"
    assert est.motion_level == "none"
    assert est.presence_probability is not None
    assert est.presence_probability < 0.20

    # 3. Stationary breathing perturbation
    breathing_sample = RawSensorSample(
        timestamp=now,
        room_id="room_1",
        sensor_type="synthetic_csi",
        is_simulated=True,
        rssi_dbm=-58.0,
        sample_count=100,
        subcarrier_variance=0.15,
        doppler_energy=0.12,
        noise_floor_dbm=-91.0,
        quality_score=0.99,
    )
    est = estimator.estimate(breathing_sample)
    assert est.presence_state == "presence"
    assert est.motion_level == "low"
    assert est.presence_probability is not None
    assert 0.40 <= est.presence_probability <= 0.85

    # 4. Dynamic walking/movement
    motion_sample = RawSensorSample(
        timestamp=now,
        room_id="room_1",
        sensor_type="synthetic_csi",
        is_simulated=True,
        rssi_dbm=-50.0,
        sample_count=100,
        subcarrier_variance=0.75,
        doppler_energy=0.85,
        noise_floor_dbm=-90.0,
        quality_score=0.95,
    )
    est = estimator.estimate(motion_sample)
    assert est.presence_state == "motion"
    assert est.motion_level in ("medium", "high")
    assert est.presence_probability is not None
    assert est.presence_probability > 0.75


def test_strict_tenant_isolation():
    """Verifies that User B cannot access, modify, start, or delete User A's configs or events."""
    uid = uuid.uuid4().hex[:6]
    user_a = {"X-User-Id": f"tenant_alice_{uid}"}
    user_b = {"X-User-Id": f"tenant_bob_{uid}"}
    room_id = f"alice_{uid}"

    # Alice creates a room
    res = client.post(
        "/api/sensing/configs",
        headers=user_a,
        json={"room_id": room_id, "room_name": "Alice Private Room", "is_authorized": True},
    )
    assert res.status_code == 201
    alice_cfg_id = res.json()["id"]

    # Alice starts simulation and generates events
    client.post("/api/sensing/simulation/start", headers=user_a, json={"room_id": room_id})

    # Bob attempts to get Alice's config by ID
    res = client.patch(
        f"/api/sensing/configs/{alice_cfg_id}",
        headers=user_b,
        json={"room_name": "Hacked Room"},
    )
    assert res.status_code == 404

    # Bob attempts to start or stop Alice's room
    res = client.post("/api/sensing/simulation/stop", headers=user_b, json={"room_id": room_id})
    assert res.status_code == 404

    # Bob queries events
    res = client.get(f"/api/sensing/events?room_id={room_id}", headers=user_b)
    assert res.status_code == 200
    assert res.json()["total"] == 0
    assert len(res.json()["events"]) == 0

    # Bob queries summary
    res = client.get(f"/api/sensing/summary?room_id={room_id}", headers=user_b)
    assert res.status_code == 404

    # Bob purges events
    res = client.delete(f"/api/sensing/events?room_id={room_id}", headers=user_b)
    assert res.status_code == 200
    assert res.json()["purged_count"] == 0

    # Verify Alice's events are untouched
    res = client.get(f"/api/sensing/events?room_id={room_id}", headers=user_a)
    assert res.status_code == 200
    assert res.json()["total"] >= 1


def test_occupancy_summary_aggregation():
    """Verifies aggregated occupancy calculations, distribution counts, and signal averages."""
    uid = uuid.uuid4().hex[:6]
    headers = {"X-User-Id": f"test_user_summary_{uid}"}
    room_id = f"sum_{uid}"

    # Setup room
    client.post(
        "/api/sensing/configs",
        headers=headers,
        json={"room_id": room_id, "room_name": "Summary Hub", "is_authorized": True},
    )
    client.post("/api/sensing/simulation/start", headers=headers, json={"room_id": room_id})
    # Generate 3 steps
    for _ in range(3):
        client.post("/api/sensing/simulation/step", headers=headers, json={"room_id": room_id})

    res = client.get(f"/api/sensing/summary?room_id={room_id}", headers=headers)
    assert res.status_code == 200
    summary = res.json()
    assert summary["room_id"] == room_id
    assert summary["is_simulated"] is True
    assert summary["total_events"] >= 4
    assert summary["average_signal_dbm"] < 0
    assert "vacant" in summary["state_breakdown"]
    assert "presence" in summary["state_breakdown"]
    assert "motion" in summary["state_breakdown"]


def test_retention_policy_and_purge():
    """Verifies deleting sensor event history and audit logging."""
    uid = uuid.uuid4().hex[:6]
    headers = {"X-User-Id": f"test_user_purge_{uid}"}
    room_id = f"purge_{uid}"

    # Create room & events
    client.post(
        "/api/sensing/configs",
        headers=headers,
        json={"room_id": room_id, "room_name": "Purge Test Room", "is_authorized": True},
    )
    client.post("/api/sensing/simulation/start", headers=headers, json={"room_id": room_id})

    # Check events exist
    res = client.get(f"/api/sensing/events?room_id={room_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] >= 1

    # Purge events
    res = client.delete(f"/api/sensing/events?room_id={room_id}", headers=headers)
    assert res.status_code == 200
    purged_count = res.json()["purged_count"]
    assert purged_count >= 1

    # Verify events are now 0
    res = client.get(f"/api/sensing/events?room_id={room_id}", headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] == 0

    # Verify audit log recorded the purge
    res = client.get("/api/sensing/audit", headers=headers)
    assert res.status_code == 200
    audits = res.json()
    purge_audit = next((a for a in audits if a["action"] == "history_purged"), None)
    assert purge_audit is not None
    assert purge_audit["details"]["purged_count"] == purged_count


def test_hardware_adapter_honest_reporting():
    """Verifies that HardwareSensorAdapter refuses to start and honestly reports unavailable."""
    hw = HardwareSensorAdapter()
    caps = hw.discover_capabilities()
    assert caps.is_available is False
    assert caps.is_hardware is True
    assert caps.is_simulated is False
    assert "No compatible physical CSI" in caps.unavailability_reason

    health = hw.get_health()
    assert health.status == "unavailable"
    assert health.is_running is False

    with pytest.raises(RuntimeError, match="compatible capture hardware is not installed"):
        asyncio.run(hw.start(room_id="real_room"))


def test_assistant_sensing_tool_and_safety():
    """Verifies that assistant tool bridge reports availability, disclaims simulation, and summarizes rooms."""
    uid = uuid.uuid4().hex[:6]
    headers = {"X-User-Id": f"test_tool_user_{uid}"}
    room_id = f"tool_{uid}"

    # Create authorized room and start simulation
    client.post(
        "/api/sensing/configs",
        headers=headers,
        json={"room_id": room_id, "room_name": "Executive Office", "is_authorized": True},
    )
    client.post("/api/sensing/simulation/start", headers=headers, json={"room_id": room_id})

    async def run_tool_checks():
        async with async_session_factory() as session:
            # 1. check_availability
            avail = await WifiSensingTool.execute(session, owner_id=f"test_tool_user_{uid}", action="check_availability")
            assert avail["simulation_available"] is True
            assert avail["hardware_available"] is False
            assert "NOTICE: Physical Wi-Fi sensing hardware is not detected" in avail["disclaimer"]

            # 2. summarize_room
            summary = await WifiSensingTool.execute(
                session, owner_id=f"test_tool_user_{uid}", action="summarize_room", room_id=room_id
            )
            assert summary["room_id"] == room_id
            assert summary["is_simulated"] is True
            assert "ALL MEASUREMENTS ARE SYNTHETIC CSI SIMULATIONS" in summary["simulation_notice"]
            assert "No individual person identity is captured" in summary["privacy_notice"]

            # 3. explain_simulation
            exp = await WifiSensingTool.execute(session, owner_id=f"test_tool_user_{uid}", action="explain_simulation")
            assert exp["simulation_mode"] is True
            assert "Channel State Information" in exp["explanation"]

    asyncio.run(run_tool_checks())


def test_chat_streaming_with_sensing_grounding():
    """Verifies that SSE chat stream can incorporate sensing telemetry without crashing."""
    mock_adapter = MockSensingChatAdapter("According to synthetic sensing, the office is currently active.")
    gateway = get_model_gateway()
    original_adapter = gateway._providers.get("openai")
    gateway.register_provider(mock_adapter)

    uid = uuid.uuid4().hex[:6]
    room_id = f"chat_{uid}"

    try:
        # Create room
        client.post(
            "/api/sensing/configs",
            headers={"X-User-Id": "dev_user"},
            json={"room_id": room_id, "room_name": "Chat Room", "is_authorized": True},
        )
        client.post(
            "/api/sensing/simulation/start",
            headers={"X-User-Id": "dev_user"},
            json={"room_id": room_id},
        )

        res = client.post(
            "/api/chat/stream",
            json={
                "message": f"What is the occupancy state in {room_id}?",
                "provider": "openai",
                "model": "gpt-4o",
                "use_sensing": True,
                "sensing_room_id": room_id,
            },
        )
        assert res.status_code == 200
        content = res.text
        assert "message_start" in content
        assert "text_delta" in content
        assert "message_complete" in content
    finally:
        if original_adapter:
            gateway.register_provider(original_adapter)
        else:
            gateway._providers.pop("openai", None)

