from datetime import datetime, timezone
import os
import sys
import pytest

# Ensure paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing")))

from esp32_serial_collector import Esp32SerialCollector, Esp32CsiPacket
from esp32_csi_engine import Esp32CsiEngine
from esp32_csi_adapter import Esp32CsiHardwareAdapter


def test_esp32_csi_parser_valid_line():
    """Verifies that the raw CSI_DATA format from ESP32 is parsed accurately."""
    collector = Esp32SerialCollector(port="COM7", baud_rate=921600)
    line = 'CSI_DATA,101,AA:BB:CC:DD:EE:FF,-45,1,1,64,0,0,0,0,0,0,128,128,0,0,0,"[-10,15,-8,12,-5,10,0,0,5,-10,8,-12]"'
    frame = collector.parse_csi_line(line)
    assert frame is not None
    assert frame.sequence == 101
    assert frame.mac_address == "AA:BB:CC:DD:EE:FF"
    assert frame.rssi_dbm == -45
    assert frame.subcarrier_count == 6  # 12 signed values = 6 (I, Q) pairs
    assert len(frame.amplitudes) == 6
    assert len(frame.phases) == 6
    assert frame.amplitudes[0] > 0


def test_esp32_csi_engine_variance_and_motion():
    """Verifies engine outlier removal, variance calculation, and motion classification."""
    engine = Esp32CsiEngine(window_size=30)
    now = datetime.now(timezone.utc)

    # Feed quiet baseline frames
    state = None
    for seq in range(30):
        frame = Esp32CsiPacket(
            timestamp=now,
            sequence=seq,
            mac_address="11:22:33:44:55:66",
            rssi_dbm=-40,
            channel=1,
            noise_floor_dbm=-95.0,
            subcarrier_count=8,
            amplitudes=[10.0 + (seq % 2) * 0.1] * 8,
            phases=[0.1] * 8,
        )
        state = engine.process_packet(frame)

    assert state is not None
    assert state.presence_state in ("no_movement", "insufficient_signal_quality", "possible_presence")

    # Feed perturbed motion frames (human walking across line of sight)
    for seq in range(30, 60):
        perturbed_amps = [10.0 + (seq % 5) * 8.0] * 8
        perturbed_phases = [float(seq % 6) * 1.5] * 8
        frame = Esp32CsiPacket(
            timestamp=now,
            sequence=seq,
            mac_address="11:22:33:44:55:66",
            rssi_dbm=-42,
            channel=1,
            noise_floor_dbm=-95.0,
            subcarrier_count=8,
            amplitudes=perturbed_amps,
            phases=perturbed_phases,
        )
        state = engine.process_packet(frame)

    assert state is not None
    assert state.motion_intensity > 0.1
    assert state.presence_state in ("movement_detected", "possible_presence")


def test_esp32_adapter_truthful_disclosure():
    """Verifies that the hardware adapter provides honest RF physics metadata."""
    adapter = Esp32CsiHardwareAdapter()
    caps = adapter.discover_capabilities()
    assert caps.is_hardware is True
    assert caps.is_simulated is False
    assert caps.provider_id == "esp32_csi_hardware"
