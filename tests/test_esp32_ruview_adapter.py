"""
Byte-level Unit and Integration Tests for ESP32 CSI to RuView Protocol Adapter.
Validates ADR-018 wire specification parity against RuView Rust & Python test vectors.
"""

import math
import os
import struct
import sys
import pytest

# Ensure import paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "api")))

from esp32_csi_to_ruview_adapter import (
    Esp32CsiToRuviewAdapter,
    RUVIEW_ADR018_MAGIC,
    HEADER_SIZE_BYTES,
    RuViewCsiFrame,
    InvalidMagicError,
    InvalidPayloadLengthError,
    InvalidSubcarrierCountError,
    InvalidIntegerRangeError,
    MalformedPacketError,
    UnsupportedPacketFormatError,
)
from esp32_serial_collector import Esp32CsiPacket


@pytest.fixture
def adapter():
    return Esp32CsiToRuviewAdapter(node_id=1, default_noise_floor_dbm=-95)


# -----------------------------------------------------------------------------
# 1. Protocol Tests
# -----------------------------------------------------------------------------

def test_protocol_magic_and_header_size(adapter):
    """Verifies that magic is 0xC5110001 and header is exactly 20 bytes."""
    frame_bytes = adapter.to_adr018_bytes([10, -10] * 56, sequence=1, rssi_dbm=-45, channel=1)
    magic = struct.unpack("<I", frame_bytes[:4])[0]
    assert magic == RUVIEW_ADR018_MAGIC
    assert HEADER_SIZE_BYTES == 20


def test_valid_56_subcarrier_frame_length(adapter):
    """56 subcarriers with single antenna must produce exactly 132 bytes."""
    raw_iq = [i % 50 for i in range(56 * 2)]
    frame_bytes = adapter.to_adr018_bytes(raw_iq, sequence=1001, rssi_dbm=-48, channel=6)
    assert len(frame_bytes) == 132


def test_valid_64_subcarrier_frame_length(adapter):
    """64 subcarriers (ESP32 HT20 full FFT) must produce exactly 148 bytes."""
    raw_iq = [(-1) ** i * (i % 20) for i in range(64 * 2)]
    frame_bytes = adapter.to_adr018_bytes(raw_iq, sequence=42, rssi_dbm=-40, channel=1)
    assert len(frame_bytes) == 148


def test_little_endian_encoding(adapter):
    """Verifies all multibyte fields are packed in Little-Endian byte order."""
    # Sequence: 0x01020304 -> [0x04, 0x03, 0x02, 0x01] in LE
    seq = 0x01020304
    # Subcarriers: 56 -> [0x38, 0x00] in LE
    # Frequency: 2437 -> [0x85, 0x09, 0x00, 0x00] in LE
    frame_bytes = adapter.to_adr018_bytes([0, 0] * 56, sequence=seq, rssi_dbm=-50, channel=6)
    assert frame_bytes[6:8] == struct.pack("<H", 56)
    assert frame_bytes[8:12] == struct.pack("<I", 2437)
    assert frame_bytes[12:16] == struct.pack("<I", seq)


def test_signed_iq_preservation(adapter):
    """Verifies signed negative and positive I/Q values are strictly preserved."""
    raw_iq = [-10, 15, -120, 120, -1, 1]
    frame = adapter.parse_and_convert(raw_iq)
    assert frame.subcarriers[0].i == -10
    assert frame.subcarriers[0].q == 15
    assert frame.subcarriers[1].i == -120
    assert frame.subcarriers[1].q == 120
    assert frame.subcarriers[2].i == -1
    assert frame.subcarriers[2].q == 1


# -----------------------------------------------------------------------------
# 2. Boundary Tests
# -----------------------------------------------------------------------------

def test_boundary_values_minus_128_and_plus_127(adapter):
    """Verifies boundary values -128 and +127 across I/Q and RSSI fields."""
    raw_iq = [-128, 127, 0, 0]
    frame_bytes = adapter.to_adr018_bytes(raw_iq, sequence=1, rssi_dbm=-128)
    frame = adapter.decode_adr018_frame(frame_bytes)
    assert frame.metadata.rssi_dbm == -128
    assert frame.subcarriers[0].i == -128
    assert frame.subcarriers[0].q == 127


def test_zero_iq_values(adapter):
    """Verifies all-zero I/Q subcarriers pack and calculate zero amplitude without division by zero."""
    raw_iq = [0, 0] * 56
    frame = adapter.parse_and_convert(raw_iq)
    amps, phases = frame.to_amplitude_phase()
    assert all(a == 0.0 for a in amps)
    assert all(p == 0.0 for p in phases)


def test_sequence_number_rollover(adapter):
    """Verifies sequence numbers wrap properly at 2^32 - 1 without crashing."""
    max_u32 = 0xFFFFFFFF
    frame_bytes = adapter.to_adr018_bytes([5, 5], sequence=max_u32 + 5, rssi_dbm=-50)
    frame = adapter.decode_adr018_frame(frame_bytes)
    assert frame.metadata.sequence == 4  # 2^32 + 4 wraps to 4


# -----------------------------------------------------------------------------
# 3. Invalid Input Tests
# -----------------------------------------------------------------------------

def test_empty_payload_rejection(adapter):
    """Rejects empty CSI payloads."""
    with pytest.raises(MalformedPacketError):
        adapter.to_adr018_bytes([], sequence=1, rssi_dbm=-50)


def test_odd_length_payload_rejection(adapter):
    """Rejects odd-length I/Q sequences."""
    with pytest.raises(InvalidPayloadLengthError):
        adapter.to_adr018_bytes([1, 2, 3], sequence=1, rssi_dbm=-50)


def test_out_of_range_iq_rejection(adapter):
    """Rejects integers exceeding 8-bit limits."""
    with pytest.raises(InvalidIntegerRangeError):
        adapter.to_adr018_bytes([-129, 0], sequence=1, rssi_dbm=-50)

    with pytest.raises(InvalidIntegerRangeError):
        adapter.to_adr018_bytes([256, 0], sequence=1, rssi_dbm=-50)


def test_oversized_subcarrier_count_rejection(adapter):
    """Rejects payloads exceeding maximum allowable subcarriers (1024)."""
    with pytest.raises(InvalidSubcarrierCountError):
        adapter.to_adr018_bytes([0, 0] * 1025, sequence=1, rssi_dbm=-50)


def test_invalid_magic_rejection(adapter):
    """Rejects frames with corrupted magic number."""
    valid_bytes = bytearray(adapter.to_adr018_bytes([1, 2], sequence=1, rssi_dbm=-50))
    valid_bytes[0] = 0xAA
    valid_bytes[1] = 0xBB
    with pytest.raises(InvalidMagicError):
        adapter.decode_adr018_frame(bytes(valid_bytes))


def test_truncated_buffer_rejection(adapter):
    """Rejects truncated binary buffers."""
    valid_bytes = adapter.to_adr018_bytes([1, 2] * 56, sequence=1, rssi_dbm=-50)
    with pytest.raises(InvalidPayloadLengthError):
        adapter.decode_adr018_frame(valid_bytes[:-4])


def test_malformed_serial_line_rejection(adapter):
    """Rejects malformed non-CSI serial lines."""
    with pytest.raises(MalformedPacketError):
        adapter.parse_and_convert("I (2861) wifi: disconnected")


def test_invalid_data_types_rejection(adapter):
    """Rejects non-numeric tokens inside bracketed data."""
    with pytest.raises(MalformedPacketError):
        adapter.parse_and_convert('CSI_DATA,1,AA:BB:CC:DD:EE:FF,-50,1,1,64,0,0,0,0,0,0,128,128,1,0,0,"[1,two,3,4]"')


# -----------------------------------------------------------------------------
# 4. Round-Trip Tests
# -----------------------------------------------------------------------------

def test_round_trip_encode_decode(adapter):
    """Encodes an ADR-018 frame and decodes it again, verifying exact parity."""
    original_iq = [(-1)**i * (i % 30) for i in range(128)]
    packed = adapter.to_adr018_bytes(original_iq, sequence=777, rssi_dbm=-44, channel=6)
    decoded = adapter.decode_adr018_frame(packed)

    assert decoded.metadata.sequence == 777
    assert decoded.metadata.rssi_dbm == -44
    assert decoded.metadata.n_subcarriers == 64
    assert decoded.metadata.channel_freq_mhz == 2437
    assert len(decoded.subcarriers) == 64

    # Verify every I/Q pair matches original
    for idx in range(64):
        assert decoded.subcarriers[idx].i == original_iq[idx * 2]
        assert decoded.subcarriers[idx].q == original_iq[idx * 2 + 1]


def test_round_trip_esp32_packet_object(adapter):
    """Verifies round-trip conversion from an Esp32CsiPacket dataclass."""
    packet = Esp32CsiPacket(
        timestamp=None,
        sequence=555,
        mac_address="7E:46:5C:69:56:F1",
        rssi_dbm=-37.0,
        channel=11,
        noise_floor_dbm=-94.0,
        subcarrier_count=64,
        raw_bytes=[10, -10] * 64,
    )
    frame = adapter.parse_and_convert(packet, node_id=3)
    assert frame.metadata.node_id == 3
    assert frame.metadata.sequence == 555
    assert frame.metadata.rssi_dbm == -37
    assert frame.metadata.channel_freq_mhz == 2462  # Ch 11
    assert frame.metadata.n_subcarriers == 64
    assert frame.metadata.mac_address == "7E:46:5C:69:56:F1"


# -----------------------------------------------------------------------------
# 5. Interface & Slicing Tests
# -----------------------------------------------------------------------------

def test_validate_record_interface(adapter):
    """Verifies validate_record returns boolean and descriptive errors."""
    valid_line = 'CSI_DATA,10,AA:BB:CC:DD:EE:FF,-50,1,1,64,0,0,0,0,0,0,128,128,1,0,0,"[1,2,3,4]"'
    is_valid, err = adapter.validate_record(valid_line)
    assert is_valid is True
    assert err is None

    is_valid_bad, err_bad = adapter.validate_record("NOT_CSI_LINE")
    assert is_valid_bad is False
    assert "CSI_DATA" in err_bad


def test_active_subcarriers_56_slicing(adapter):
    """Verifies slicing 64 FFT bins down to 56 active data subcarriers for RuView neural cogs."""
    raw_iq = [i for i in range(128)]
    frame = adapter.parse_and_convert(raw_iq)
    assert len(frame.subcarriers) == 64
    sliced_56 = frame.active_subcarriers_56()
    assert len(sliced_56) == 56
    # None of the 56 sliced subcarriers should be the DC null tone (index 0)
    assert all(sc.index != 0 for sc in sliced_56)


def test_amplitude_residuals_calculation(adapter):
    """Verifies amplitude residual calculation matches BreathingExtractor expectations."""
    raw_iq = [3, 4] * 56  # amp = 5.0 for each
    frame = adapter.parse_and_convert(raw_iq)
    residuals = frame.to_amplitude_residuals()
    assert len(residuals) == 56
    # When all amplitudes are 5.0, residual from mean is 0.0
    assert all(r == 0.0 for r in residuals)
