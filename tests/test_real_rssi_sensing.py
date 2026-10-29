"""
Unit and Integration Tests for Real Wi-Fi RSSI Sensing Adapter.
Validates netsh parsing, timeout resilience, missing adapters, disconnected state,
BSSID anonymization, and genuine live hardware RSSI collection.
"""

import asyncio
import hashlib
import platform
import subprocess
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from database import async_session_factory
from main import app
from real_rssi_adapter import RealRssiSensorAdapter
from schemas.wifi_sensing import SensorConfigCreate
from services.wifi_sensing_service import WifiSensingService
from services.wifi_sensing_tool import WifiSensingTool

client = TestClient(app)

MOCK_NETSH_CONNECTED_OUTPUT = """
There is 1 interface on the system: 

    Name                   : Wi-Fi
    Description            : Realtek RTL8852BE WiFi 6 802.11ax PCIe Adapter
    GUID                   : 7511043e-d1b0-416c-bd61-c1799039c111
    Physical address       : 78:46:5c:69:56:f1
    Interface type         : Primary
    State                  : connected
    SSID                   : Corporate-Secure-5G
    AP BSSID               : 6c:aa:b3:73:24:7c
    Band                   : 5 GHz
    Channel                : 52
    Connected Akm-cipher   : [ akm = 00-0f-ac:02, cipher =  00-0f-ac:04 ]
    Network type           : Infrastructure
    Radio type             : 802.11ax
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Receive rate (Mbps)    : 450
    Transmit rate (Mbps)   : 450
    Signal                 : 95% 
    Rssi                   : -54
    Profile                : Corporate-Secure-5G 
"""

MOCK_NETSH_DISCONNECTED_OUTPUT = """
There is 1 interface on the system: 

    Name                   : Wi-Fi
    Description            : Realtek RTL8852BE WiFi 6 802.11ax PCIe Adapter
    GUID                   : 7511043e-d1b0-416c-bd61-c1799039c111
    Physical address       : 78:46:5c:69:56:f1
    State                  : disconnected
    Radio status           : Hardware On, Software On
"""

MOCK_NETSH_NO_INTERFACE_OUTPUT = """
There is no wireless interface on the system.
"""

MOCK_NETSH_NO_RSSI_FIELD_OUTPUT = """
There is 1 interface on the system: 

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX200 160MHz
    State                  : connected
    SSID                   : HomeNetwork
    AP BSSID               : aa:bb:cc:dd:ee:ff
    Signal                 : 80% 
    Band                   : 5 GHz
    Channel                : 36
"""


# -----------------------------------------------------------------------------
# 1. Parsing & Unit Tests
# -----------------------------------------------------------------------------


def test_parse_connected_interface():
    res = RealRssiSensorAdapter.parse_netsh_interfaces(MOCK_NETSH_CONNECTED_OUTPUT)
    assert res["is_available"] is True
    assert res["connected"] is True
    assert res["state"] == "connected"
    assert "Realtek RTL8852BE" in res["description"]
    assert res["rssi_dbm"] == -54.0
    assert res["signal_pct"] == 95
    assert res["channel"] == 52
    assert res["band"] == "5 GHz"
    assert res["radio_type"] == "802.11ax"
    assert res["rx_rate_mbps"] == 450.0
    assert res["tx_rate_mbps"] == 450.0

    # Privacy verification: Raw BSSID '6c:aa:b3:73:24:7c' must NOT be in output
    assert "6c:aa:b3:73:24:7c" not in str(res)
    expected_hash = hashlib.sha256("6c:aa:b3:73:24:7c".encode("utf-8")).hexdigest()[:12]
    assert res["anonymized_network_hash"] == expected_hash


def test_parse_disconnected_interface():
    res = RealRssiSensorAdapter.parse_netsh_interfaces(MOCK_NETSH_DISCONNECTED_OUTPUT)
    assert res["is_available"] is True
    assert res["connected"] is False
    assert res["state"] == "disconnected"
    assert res["rssi_dbm"] is None
    assert res["signal_pct"] == 0


def test_parse_no_interface():
    res = RealRssiSensorAdapter.parse_netsh_interfaces(MOCK_NETSH_NO_INTERFACE_OUTPUT)
    assert res["is_available"] is False
    assert res["connected"] is False
    assert res["state"] == "no_interface"


def test_parse_fallback_when_rssi_field_missing():
    res = RealRssiSensorAdapter.parse_netsh_interfaces(MOCK_NETSH_NO_RSSI_FIELD_OUTPUT)
    assert res["is_available"] is True
    assert res["connected"] is True
    assert res["signal_pct"] == 80
    # Formula: (80 / 2) - 100 = -60 dBm
    assert res["rssi_dbm"] == -60.0
    assert res["channel"] == 36


def test_parse_malformed_and_empty_output():
    res_empty = RealRssiSensorAdapter.parse_netsh_interfaces("")
    assert res_empty["is_available"] is False

    res_garbage = RealRssiSensorAdapter.parse_netsh_interfaces("Random error: Access is denied.")
    assert res_garbage["is_available"] is True
    assert res_garbage["connected"] is False


# -----------------------------------------------------------------------------
# 2. Timeout and Failure Resilience
# -----------------------------------------------------------------------------


def test_query_timeout_handling():
    adapter = RealRssiSensorAdapter()
    with patch("platform.system", return_value="Windows"):
        with patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="netsh", timeout=2.0)):
            res = adapter._query_os_wifi_sync()
            assert res["is_available"] is False
            assert res["state"] == "timeout"
            assert "timed out" in res["error"]


def test_non_windows_handling():
    adapter = RealRssiSensorAdapter()
    with patch("platform.system", return_value="Linux"):
        res = adapter._query_os_wifi_sync()
        assert res["is_available"] is False
        assert res["state"] == "unsupported_os"
        assert "not supported on Linux" in res["error"]


# -----------------------------------------------------------------------------
# 3. Live Hardware Execution (Windows Host with Realtek RTL8852BE)
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_live_hardware_capture():
    if platform.system() != "Windows":
        pytest.skip("Physical Wi-Fi hardware tests run only on Windows hosts.")

    adapter = RealRssiSensorAdapter()
    caps = adapter.discover_capabilities()

    if not caps.is_available:
        pytest.skip(f"Wi-Fi interface not connected or absent: {caps.unavailability_reason}")

    # Verify declared hardware properties
    assert caps.is_hardware is True
    assert caps.is_simulated is False
    assert "Real RSSI" in caps.name

    await adapter.start(room_id="real_test_room")
    assert adapter.get_health().status == "healthy"

    sample = await adapter.capture_sample()
    assert sample is not None
    assert sample.is_simulated is False
    assert sample.sensor_type == "real_wifi_rssi"
    assert -100.0 <= sample.rssi_dbm <= -10.0
    assert 0.0 <= sample.quality_score <= 1.0
    assert sample.metadata["measurement_type"] == "real_rssi"
    assert sample.metadata["csi_supported"] is False

    # Privacy verification: Raw SSID must not be present in metadata
    assert "Corporate-Secure-5G" not in str(sample.metadata)
    assert sample.metadata["anonymized_network_hash"] is not None

    await adapter.stop()
    assert adapter.get_health().status == "stopped"


# -----------------------------------------------------------------------------
# 4. End-to-End Service Integration
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_service_integration_with_real_rssi():
    if platform.system() != "Windows":
        pytest.skip("Physical Wi-Fi hardware integration runs on Windows hosts.")

    adapter = RealRssiSensorAdapter()
    if not adapter.discover_capabilities().is_available:
        pytest.skip("Physical Wi-Fi interface not available for service integration test.")

    uid = uuid.uuid4().hex[:6]
    owner_id = f"test_owner_{uid}"
    room_id = f"lab_hardware_{uid}"

    async with async_session_factory() as db:
        # 1. Create and authorize room configuration
        cfg_create = SensorConfigCreate(
            room_id=room_id,
            room_name="Hardware Test Lab",
            is_authorized=True,
            retention_days=7,
        )
        cfg = await WifiSensingService.create_config(db, owner_id=owner_id, payload=cfg_create)

        # 2. Start monitoring using real physical hardware adapter
        started_cfg = await WifiSensingService.start_simulation(
            db, owner_id=owner_id, room_id=room_id, provider_id="real_wifi_rssi_hardware"
        )
        assert started_cfg.is_active is True

        # 3. Capture an event tick
        event = await WifiSensingService.step_simulation(db, owner_id=owner_id, room_id=room_id)
        assert event is not None
        assert event.is_simulated is False
        assert event.sensor_type == "real_wifi_rssi"
        assert -100.0 <= event.signal_strength_dbm <= -10.0

        # 4. Check occupancy summary
        summary = await WifiSensingService.get_occupancy_summary(db, owner_id=owner_id, room_id=room_id)
        assert summary.is_simulated is False
        assert summary.total_events >= 1
        assert summary.current_state in ("vacant", "presence", "motion", "unknown")

        # 5. Clean up by stopping session
        stopped_cfg = await WifiSensingService.stop_simulation(db, owner_id=owner_id, room_id=room_id)
        assert stopped_cfg.is_active is False
