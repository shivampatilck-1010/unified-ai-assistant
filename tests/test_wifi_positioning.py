import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from database import get_db, create_tables
from services.wifi_sensing_service import WifiSensingService
from synthetic_simulator import SyntheticSensorSimulator


@pytest.mark.asyncio
async def test_synthetic_2d_position_kinematics():
    """Verify that synthetic simulation produces 2D spatial coordinates according to state."""
    sim = SyntheticSensorSimulator(seed=123)
    await sim.start("room_test", speed=1.0)

    # 1. Force vacant state -> coordinates should be None
    sim.force_state("vacant")
    sample_vacant = await sim.capture_sample()
    assert sample_vacant is not None
    assert sample_vacant.estimated_x is None
    assert sample_vacant.estimated_y is None
    assert sample_vacant.velocity_mps == 0.0

    # 2. Force stationary state -> seated near workstation (x~4.5, y~2.8)
    sim.force_state("stationary")
    sample_stat = await sim.capture_sample()
    assert sample_stat is not None
    assert sample_stat.estimated_x is not None
    assert 4.0 <= sample_stat.estimated_x <= 5.0
    assert 2.0 <= sample_stat.estimated_y <= 3.5
    assert sample_stat.velocity_mps == 0.0
    assert sample_stat.uncertainty_radius_m == 0.30

    # 3. Force motion state -> walking path within room boundaries
    sim.force_state("motion")
    sample_motion = await sim.capture_sample()
    assert sample_motion is not None
    assert sample_motion.estimated_x is not None
    assert 0.0 <= sample_motion.estimated_x <= 6.0
    assert 0.0 <= sample_motion.estimated_y <= 4.0
    assert sample_motion.velocity_mps is not None and sample_motion.velocity_mps > 0.0
    assert sample_motion.uncertainty_radius_m is not None

    await sim.stop()


@pytest.mark.asyncio
async def test_api_sensing_events_expose_2d_position():
    """Verify that /api/wifi-sensing/events exposes estimated_x and estimated_y in JSON."""
    await create_tables()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a test room
        room_payload = {
            "room_id": "lab_2d_pos",
            "room_name": "2D Kinematics Test Lab",
            "is_authorized": True,
            "simulation_speed": 1.0,
            "retention_days": 1,
        }
        create_res = await client.post("/api/sensing/configs", json=room_payload)
        assert create_res.status_code in (200, 201)

        # Start simulation and step
        await client.post("/api/sensing/simulation/start", json={"room_id": "lab_2d_pos", "speed": 1.0})
        step_res = await client.post("/api/sensing/simulation/step", json={"room_id": "lab_2d_pos"})
        assert step_res.status_code == 200

        # Query events
        events_res = await client.get("/api/sensing/events?room_id=lab_2d_pos")
        assert events_res.status_code == 200
        data = events_res.json()
        assert "events" in data
        assert len(data["events"]) > 0

        first_event = data["events"][0]
        assert "estimated_x" in first_event
        assert "estimated_y" in first_event
        assert "velocity_mps" in first_event
        assert "uncertainty_radius_m" in first_event
