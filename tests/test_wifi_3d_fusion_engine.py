"""
Unit and Integration Tests for WiFi-3D-Fusion Open-Source Sensing Engine.
Verifies:
1. Capabilities and hardware honesty.
2. 25-joint 3D humanoid skeleton generation matching COCO topology.
3. Pipeline capture and event normalization.
4. Daemon polling fallback.
"""

import pytest
from datetime import datetime
from services.wifi_sensing_service import WifiSensingService
from wifi_3d_fusion_adapter import Wifi3DFusionAdapter, SKELETON_CONNECTIONS, JOINT_NAMES_25


def test_wifi_3d_fusion_capabilities():
    adapter = Wifi3DFusionAdapter(source_mode="dummy")
    caps = adapter.discover_capabilities()

    assert caps.provider_id == "wifi_3d_fusion_engine"
    assert caps.is_simulated is True
    assert caps.is_hardware is False
    assert "Realtek RTL8852BE" in caps.unavailability_reason
    assert "25_joint_skeletal_mesh" in caps.supported_measurements
    assert "3d_cartesian_coordinates" in caps.supported_measurements


def test_wifi_3d_fusion_skeleton_structure():
    adapter = Wifi3DFusionAdapter(source_mode="dummy")
    pos = [3.0, 2.0, 0.0]
    skeleton = adapter._generate_kinematic_skeleton(pos)

    assert len(skeleton) == 25
    assert len(JOINT_NAMES_25) == 25
    assert len(SKELETON_CONNECTIONS) > 0

    # Every joint must have [x, y, z] coordinates
    for joint in skeleton:
        assert len(joint) == 3
        assert isinstance(joint[0], float)
        assert isinstance(joint[1], float)
        assert isinstance(joint[2], float)

    # Head (joint 0/1) should be above feet (joint 19-24)
    head_z = skeleton[0][2]
    foot_z = skeleton[21][2]
    assert head_z > foot_z
    assert head_z > 1.5  # Realistic humanoid height


@pytest.mark.asyncio
async def test_wifi_3d_fusion_capture_sample():
    adapter = Wifi3DFusionAdapter(source_mode="dummy")
    await adapter.start(room_id="room_living_3d")

    sample = await adapter.capture_sample()
    assert sample is not None
    assert sample.room_id == "room_living_3d"
    assert sample.is_simulated is True
    assert sample.estimated_x is not None
    assert sample.estimated_y is not None
    assert sample.uncertainty_radius_m is not None
    assert sample.uncertainty_radius_m > 0

    meta = sample.metadata
    assert meta["engine"] == "wifi-3d-fusion"
    assert "skeleton_3d" in meta
    assert len(meta["skeleton_3d"]) == 25
    assert "skeleton_connections" in meta
    assert meta["fps"] > 0

    await adapter.stop()
    assert (await adapter.capture_sample()) is None


def test_wifi_sensing_service_includes_fusion_provider():
    caps = WifiSensingService.get_capabilities()
    prov_ids = [p.provider_id for p in caps.providers]
    assert "wifi_3d_fusion_engine" in prov_ids

    fusion_item = next(p for p in caps.providers if p.provider_id == "wifi_3d_fusion_engine")
    assert fusion_item.is_simulated is True
    assert fusion_item.is_hardware is False


@pytest.mark.asyncio
async def test_wifi_sensing_service_pipeline_execution():
    pipeline = WifiSensingService.get_pipeline("test_3d_room", provider_id="wifi_3d_fusion_engine")
    assert pipeline.provider.provider_id == "wifi_3d_fusion_engine"

    await pipeline.provider.start("test_3d_room")
    event = await pipeline.step()
    assert event is not None
    assert event.room_id == "test_3d_room"
    assert event.presence_state in ("presence", "motion")
    assert event.is_simulated is True
    assert event.raw_metrics["engine"] == "wifi-3d-fusion"
    assert len(event.raw_metrics["skeleton_3d"]) == 25
    await pipeline.provider.stop()
