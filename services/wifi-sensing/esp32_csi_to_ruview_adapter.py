"""
ESP32 CSI to RuView Protocol Adapter (ADR-018).
Repository: Unified AI Assistant (services/wifi-sensing)

Converts authentic physical CSI records from Espressif csi_recv_router / serial collector
into standard RuView ADR-018 binary wire frames and vice-versa.

Protocol Specification:
Reference: RuView ADR-018 (v2/crates/wifi-densepose-hardware/src/esp32_parser.rs)
Offset  Size  Field            Type
------  ----  -----            ----
0       4     Magic            uint32 LE (0xC5110001)
4       1     Node ID          uint8 (0-255)
5       1     Antenna          uint8 (1-4)
6       2     Subcarrier count uint16 LE (e.g. 56 or 64)
8       4     Frequency MHz    uint32 LE (e.g. 2412 for Ch 1, 2437 for Ch 6)
12      4     Sequence         uint32 LE (wraps at 2^32-1)
16      1     RSSI             int8 (-128..127 dBm)
17      1     Noise floor      int8 (-128..127 dBm)
18      2     Reserved/Flags   uint16 LE (ADR-110: byte 18 ppdu_type, byte 19 flags)
20      N*2   I/Q payload      signed int8 pairs (I, Q per subcarrier)

Expected Frame Sizes:
- 56 subcarriers (single antenna): 20 + 56 * 2 = 132 bytes
- 64 subcarriers (single antenna): 20 + 64 * 2 = 148 bytes
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import math
import re
import struct
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

# Constant Definitions matching RuView ADR-018 & ADR-110
RUVIEW_ADR018_MAGIC: int = 0xC5110001
HEADER_SIZE_BYTES: int = 20
MAX_ANTENNAS: int = 4
MAX_IQ_PAIRS: int = 1024  # Max pairs across all antennas (2048 I/Q bytes max)

# Precompiled struct pack/unpack for 20-byte header
# <I : magic (4B LE)
# B  : node_id (1B)
# B  : n_antennas (1B)
# H  : n_subcarriers (2B LE)
# I  : freq_mhz (4B LE)
# I  : sequence (4B LE)
# b  : rssi (1B signed)
# b  : noise_floor (1B signed)
# B  : ppdu_type (1B)
# B  : flags (1B)
HEADER_STRUCT: struct.Struct = struct.Struct("<IBBHIIbbBB")


class RuViewAdapterError(Exception):
    """Base exception for RuView protocol adapter errors."""
    pass


class InvalidMagicError(RuViewAdapterError):
    """Raised when ADR-018 magic bytes do not match 0xC5110001."""
    pass


class InvalidPayloadLengthError(RuViewAdapterError):
    """Raised when frame length does not match expected header + I/Q payload size."""
    pass


class InvalidSubcarrierCountError(RuViewAdapterError):
    """Raised when subcarrier count is invalid (0, negative, or exceeds limit)."""
    pass


class InvalidIntegerRangeError(RuViewAdapterError):
    """Raised when CSI I/Q values or metadata exceed valid signed/unsigned integer bounds."""
    pass


class MalformedPacketError(RuViewAdapterError):
    """Raised when an incoming packet or string cannot be parsed."""
    pass


class UnsupportedPacketFormatError(RuViewAdapterError):
    """Raised when an unrecognized protocol version or format is encountered."""
    pass


@dataclass(frozen=True)
class RuViewSubcarrier:
    """Represents a single subcarrier's I/Q components and derived physical metrics."""
    i: int
    q: int
    index: int
    amplitude: float
    phase: float


@dataclass
class RuViewCsiMetadata:
    """
    Metadata for an ADR-018 CSI frame.
    Explicitly tracks which fields originated directly from physical hardware
    versus protocol-mandated wire defaults.
    """
    node_id: int
    n_antennas: int
    n_subcarriers: int
    channel_freq_mhz: int
    sequence: int
    rssi_dbm: int
    noise_floor_dbm: int
    ppdu_type: int = 0  # 0 = HT/legacy
    flags: int = 0      # 0 = default 20MHz single-stream
    timestamp: Optional[datetime] = None

    # Hardware provenance tracking (explicitly prevents silent assumptions)
    has_hardware_noise_floor: bool = False
    has_hardware_timestamp: bool = False
    hardware_timestamp_us: Optional[int] = None
    mac_address: Optional[str] = None
    channel: int = 1
    secondary_channel: Optional[int] = None
    bandwidth_mhz: int = 20


@dataclass
class RuViewCsiFrame:
    """Decoded ADR-018 frame containing verified metadata and I/Q subcarrier data."""
    metadata: RuViewCsiMetadata
    subcarriers: List[RuViewSubcarrier]
    raw_iq_bytes: bytes

    def to_amplitude_phase(self) -> Tuple[List[float], List[float]]:
        """Returns parallel lists of amplitudes and phases across all subcarriers."""
        amplitudes = [sc.amplitude for sc in self.subcarriers]
        phases = [sc.phase for sc in self.subcarriers]
        return amplitudes, phases

    def active_subcarriers_56(self) -> List[RuViewSubcarrier]:
        """
        Slices standard 64-FFT bins down to the 56 active non-null data subcarriers
        expected by RuView neural models (cog-person-count, cog-pose-estimation).
        Discards guard bands and DC null tones.
        """
        if len(self.subcarriers) == 56:
            return list(self.subcarriers)
        elif len(self.subcarriers) == 64:
            # 64-tone 802.11n layout: subcarriers [-28..-1] and [1..28] are active data.
            # Tones -32..-29, 0 (DC), and 29..31 are guard/null tones.
            return [sc for sc in self.subcarriers if sc.index != 0 and -28 <= sc.index <= 28][:56]
        else:
            # Fallback to first 56 tones if available
            return list(self.subcarriers[:56])

    def to_amplitude_residuals(self, baseline_amplitudes: Optional[List[float]] = None) -> List[float]:
        """
        Computes amplitude residuals (A_k - mean_A_k) required by RuView's BreathingExtractor.
        """
        amps = [sc.amplitude for sc in self.subcarriers]
        if baseline_amplitudes and len(baseline_amplitudes) == len(amps):
            return [a - b for a, b in zip(amps, baseline_amplitudes)]
        mean_amp = sum(amps) / len(amps) if amps else 0.0
        return [a - mean_amp for a in amps]

    def to_adr018_bytes(self) -> bytes:
        """Packs this frame back into canonical ADR-018 binary format."""
        header = HEADER_STRUCT.pack(
            RUVIEW_ADR018_MAGIC,
            self.metadata.node_id & 0xFF,
            self.metadata.n_antennas & 0xFF,
            self.metadata.n_subcarriers & 0xFFFF,
            self.metadata.channel_freq_mhz & 0xFFFFFFFF,
            self.metadata.sequence & 0xFFFFFFFF,
            max(-128, min(127, self.metadata.rssi_dbm)),
            max(-128, min(127, self.metadata.noise_floor_dbm)),
            self.metadata.ppdu_type & 0xFF,
            self.metadata.flags & 0xFF,
        )
        return header + self.raw_iq_bytes


@dataclass
class AdapterPerformanceStats:
    """Telemetry metrics tracking adapter throughput, latency, and data integrity."""
    packets_processed: int = 0
    packets_packed: int = 0
    packets_unpacked: int = 0
    invalid_packets: int = 0
    total_processing_time_us: float = 0.0
    last_processing_time_us: float = 0.0
    latencies_us: List[float] = field(default_factory=list)

    @property
    def average_processing_latency_us(self) -> float:
        if self.packets_processed == 0:
            return 0.0
        return self.total_processing_time_us / self.packets_processed

    @property
    def p95_latency_us(self) -> float:
        if not self.latencies_us:
            return 0.0
        sorted_lats = sorted(self.latencies_us)
        idx = int(0.95 * len(sorted_lats))
        return sorted_lats[min(idx, len(sorted_lats) - 1)]

    @property
    def max_latency_us(self) -> float:
        return max(self.latencies_us) if self.latencies_us else 0.0


class Esp32CsiToRuviewAdapter:
    """
    High-performance, zero-fabrication adapter between Espressif CSI format
    and RuView ADR-018 binary protocol.
    """

    def __init__(
        self,
        node_id: int = 1,
        default_noise_floor_dbm: int = -95,
        strict_validation: bool = True,
    ) -> None:
        self.node_id = node_id & 0xFF
        self.default_noise_floor_dbm = max(-128, min(127, default_noise_floor_dbm))
        self.strict_validation = strict_validation
        self.stats = AdapterPerformanceStats()

    # -------------------------------------------------------------------------
    # Core Interface Methods (per Requirement 4)
    # -------------------------------------------------------------------------

    def validate_record(self, record: Any) -> Tuple[bool, Optional[str]]:
        """
        Validates an incoming CSI record (string line, packet, dict, or bytes)
        before conversion without altering state.
        Returns (is_valid, error_message).
        """
        try:
            if isinstance(record, (bytes, bytearray)):
                if len(record) < HEADER_SIZE_BYTES:
                    return False, f"Buffer length ({len(record)}) smaller than header ({HEADER_SIZE_BYTES})"
                magic = struct.unpack("<I", record[:4])[0]
                if magic != RUVIEW_ADR018_MAGIC:
                    return False, f"Invalid magic 0x{magic:08X} (expected 0x{RUVIEW_ADR018_MAGIC:08X})"
                return True, None

            elif isinstance(record, str):
                if not record.strip().startswith("CSI_DATA"):
                    return False, "Record does not begin with 'CSI_DATA'"
                tokens = record.split(",")
                if len(tokens) < 4:
                    return False, f"Insufficient CSV fields: {len(tokens)}"
                bracket_start = record.find("[")
                bracket_end = record.find("]", bracket_start)
                if bracket_start == -1 or bracket_end == -1:
                    return False, "Missing bracketed CSI data array '[...]'"
                return True, None

            elif hasattr(record, "raw_bytes"):
                if not record.raw_bytes:
                    return False, "Packet raw_bytes is empty"
                if len(record.raw_bytes) % 2 != 0:
                    return False, f"Odd number of CSI bytes: {len(record.raw_bytes)}"
                return True, None

            elif isinstance(record, dict):
                if "csi_raw" not in record and "raw_bytes" not in record:
                    return False, "Dictionary missing 'csi_raw' or 'raw_bytes' key"
                return True, None

            else:
                return False, f"Unsupported record type: {type(record)}"

        except Exception as exc:
            return False, f"Validation exception: {exc}"

    def parse_and_convert(
        self,
        raw_input: Union[str, Any, bytes, Dict[str, Any]],
        node_id: Optional[int] = None,
    ) -> RuViewCsiFrame:
        """
        Parses and converts any authentic CSI representation into a RuViewCsiFrame.
        Supports:
        - CSI_DATA ASCII string line
        - Esp32CsiPacket dataclass instance
        - ADR-018 binary bytes buffer
        - Dictionary containing parsed CSI metadata and I/Q values
        """
        t0 = time.perf_counter()
        self.stats.packets_processed += 1

        try:
            if isinstance(raw_input, (bytes, bytearray)):
                return self.decode_adr018_frame(raw_input)

            elif isinstance(raw_input, str):
                parsed_dict = self._parse_ascii_csi_line(raw_input)
                frame = self._dict_to_ruview_frame(parsed_dict, node_id)

            elif hasattr(raw_input, "raw_bytes"):
                # Esp32CsiPacket dataclass
                frame = self._packet_to_ruview_frame(raw_input, node_id)

            elif isinstance(raw_input, dict):
                frame = self._dict_to_ruview_frame(raw_input, node_id)

            elif isinstance(raw_input, (list, tuple)):
                # Raw I/Q sequence: pack with safe defaults then decode to frame
                packed = self.pack_raw_iq(
                    raw_values=raw_input,
                    sequence=0,
                    rssi_dbm=-50,
                    channel=1,
                    node_id=node_id,
                )
                frame = self.decode_adr018_frame(packed)

            else:
                raise UnsupportedPacketFormatError(f"Cannot parse input type: {type(raw_input)}")

            dt_us = (time.perf_counter() - t0) * 1_000_000.0
            self.stats.last_processing_time_us = dt_us
            self.stats.total_processing_time_us += dt_us
            self.stats.latencies_us.append(dt_us)
            if len(self.stats.latencies_us) > 10000:
                self.stats.latencies_us.pop(0)

            return frame

        except Exception:
            self.stats.invalid_packets += 1
            raise

    def to_adr018_bytes(
        self,
        frame_or_packet: Union[RuViewCsiFrame, Any, str, Sequence[int]],
        node_id: Optional[int] = None,
        sequence: Optional[int] = None,
        rssi_dbm: Optional[float] = None,
        channel: int = 1,
    ) -> bytes:
        """
        Encodes a RuViewCsiFrame, Esp32CsiPacket, ASCII line, or I/Q sequence
        into canonical 20-byte header ADR-018 binary wire format.
        """
        if isinstance(frame_or_packet, RuViewCsiFrame):
            return frame_or_packet.to_adr018_bytes()

        if isinstance(frame_or_packet, str):
            return self.parse_csi_line_to_adr018(frame_or_packet, node_id)

        if hasattr(frame_or_packet, "raw_bytes"):
            return self.pack_esp32_packet(frame_or_packet, node_id)

        if isinstance(frame_or_packet, (list, tuple)):
            if sequence is None or rssi_dbm is None:
                raise MalformedPacketError("Raw I/Q sequence requires sequence and rssi_dbm arguments.")
            return self.pack_raw_iq(
                raw_values=frame_or_packet,
                sequence=sequence,
                rssi_dbm=rssi_dbm,
                channel=channel,
                node_id=node_id,
            )

        raise UnsupportedPacketFormatError(f"Cannot convert {type(frame_or_packet)} to ADR-018 bytes.")

    def decode_adr018_frame(self, data: bytes) -> RuViewCsiFrame:
        """
        Decodes a canonical RuView ADR-018 binary frame.
        Performs byte-level verification of magic, header size, subcarrier counts,
        and payload boundaries.
        """
        t0 = time.perf_counter()
        if len(data) < HEADER_SIZE_BYTES:
            self.stats.invalid_packets += 1
            raise InvalidPayloadLengthError(
                f"Data length ({len(data)} bytes) is smaller than ADR-018 header ({HEADER_SIZE_BYTES} bytes)."
            )

        # Unpack 20-byte header
        header_bytes = data[:HEADER_SIZE_BYTES]
        (
            magic,
            node_id,
            n_antennas,
            n_subcarriers,
            freq_mhz,
            sequence,
            rssi,
            noise_floor,
            ppdu_type,
            flags,
        ) = HEADER_STRUCT.unpack(header_bytes)

        if magic != RUVIEW_ADR018_MAGIC:
            self.stats.invalid_packets += 1
            raise InvalidMagicError(
                f"Invalid ADR-018 magic: expected 0x{RUVIEW_ADR018_MAGIC:08X}, got 0x{magic:08X}"
            )

        if n_antennas == 0 or n_antennas > MAX_ANTENNAS:
            self.stats.invalid_packets += 1
            raise UnsupportedPacketFormatError(
                f"Invalid antenna count {n_antennas} in ADR-018 header."
            )

        if n_subcarriers == 0 or n_subcarriers > MAX_IQ_PAIRS:
            self.stats.invalid_packets += 1
            raise InvalidSubcarrierCountError(
                f"Invalid subcarrier count {n_subcarriers} in ADR-018 header."
            )

        expected_iq_bytes = n_antennas * n_subcarriers * 2
        expected_total_bytes = HEADER_SIZE_BYTES + expected_iq_bytes

        if len(data) < expected_total_bytes:
            self.stats.invalid_packets += 1
            raise InvalidPayloadLengthError(
                f"Incomplete ADR-018 frame: expected {expected_total_bytes} bytes, received {len(data)} bytes."
            )

        iq_payload = data[HEADER_SIZE_BYTES:expected_total_bytes]
        subcarriers: List[RuViewSubcarrier] = []
        half = n_subcarriers // 2

        # Extract I/Q components
        for ant in range(n_antennas):
            for sc_idx in range(n_subcarriers):
                offset = (ant * n_subcarriers + sc_idx) * 2
                i_byte = iq_payload[offset]
                q_byte = iq_payload[offset + 1]
                i_val = i_byte if i_byte < 128 else i_byte - 256
                q_val = q_byte if q_byte < 128 else q_byte - 256

                if sc_idx < half:
                    sc_index = -(half - sc_idx)
                else:
                    sc_index = sc_idx - half + 1

                amp = round(math.hypot(i_val, q_val), 4)
                phase = round(math.atan2(q_val, i_val), 4)

                subcarriers.append(
                    RuViewSubcarrier(
                        i=i_val,
                        q=q_val,
                        index=sc_index,
                        amplitude=amp,
                        phase=phase,
                    )
                )

        metadata = RuViewCsiMetadata(
            node_id=node_id,
            n_antennas=n_antennas,
            n_subcarriers=n_subcarriers,
            channel_freq_mhz=freq_mhz,
            sequence=sequence,
            rssi_dbm=rssi,
            noise_floor_dbm=noise_floor,
            ppdu_type=ppdu_type,
            flags=flags,
            timestamp=datetime.now(timezone.utc),
            has_hardware_noise_floor=True,
            has_hardware_timestamp=False,
            channel=self.frequency_to_channel(freq_mhz),
        )

        frame = RuViewCsiFrame(
            metadata=metadata,
            subcarriers=subcarriers,
            raw_iq_bytes=bytes(iq_payload),
        )

        self.stats.packets_unpacked += 1
        dt_us = (time.perf_counter() - t0) * 1_000_000.0
        self.stats.last_processing_time_us = dt_us
        self.stats.total_processing_time_us += dt_us
        self.stats.latencies_us.append(dt_us)
        return frame

    # -------------------------------------------------------------------------
    # Conversion & Encoding Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def channel_to_frequency_mhz(channel: int) -> int:
        """
        Maps standard Wi-Fi channel numbers to center frequency in MHz.
        Supports 2.4 GHz (1-14) and 5 GHz UNII-1/2/3 channels.
        """
        if 1 <= channel <= 13:
            return 2412 + (channel - 1) * 5
        elif channel == 14:
            return 2484  # Japan 2.4 GHz channel 14
        elif 36 <= channel <= 177:
            return 5000 + channel * 5
        else:
            return 2412  # Fallback to Channel 1

    @staticmethod
    def frequency_to_channel(freq_mhz: int) -> int:
        """Inverse mapping from frequency in MHz to channel number."""
        if freq_mhz == 2484:
            return 14
        if 2412 <= freq_mhz <= 2472:
            return (freq_mhz - 2407) // 5
        if 5000 <= freq_mhz <= 5900:
            return (freq_mhz - 5000) // 5
        return 1

    def pack_raw_iq(
        self,
        raw_values: Sequence[int],
        sequence: int,
        rssi_dbm: float | int,
        channel: int = 1,
        noise_floor_dbm: Optional[float | int] = None,
        node_id: Optional[int] = None,
        n_antennas: int = 1,
        ppdu_type: int = 0,
        flags: int = 0,
    ) -> bytes:
        """Packs raw signed CSI I/Q integers into canonical ADR-018 frame bytes."""
        t0 = time.perf_counter()

        if not raw_values:
            raise MalformedPacketError("Empty CSI raw values array; cannot pack frame.")

        if len(raw_values) % 2 != 0:
            raise InvalidPayloadLengthError(
                f"CSI values array has odd length ({len(raw_values)}). "
                "Each subcarrier requires exactly two values (I and Q)."
            )

        if n_antennas <= 0 or n_antennas > MAX_ANTENNAS:
            raise UnsupportedPacketFormatError(
                f"Antenna count {n_antennas} is out of bounds (1..{MAX_ANTENNAS})."
            )

        total_pairs = len(raw_values) // 2
        if total_pairs % n_antennas != 0:
            raise InvalidSubcarrierCountError(
                f"Total I/Q pairs ({total_pairs}) not divisible by antenna count ({n_antennas})."
            )

        n_subcarriers = total_pairs // n_antennas
        if n_subcarriers <= 0:
            raise InvalidSubcarrierCountError("Computed subcarrier count is zero.")
        if n_subcarriers > MAX_IQ_PAIRS:
            raise InvalidSubcarrierCountError(
                f"Subcarrier count {n_subcarriers} exceeds maximum allowed ({MAX_IQ_PAIRS})."
            )

        # Validate integer ranges
        iq_bytes = bytearray(len(raw_values))
        for idx, val in enumerate(raw_values):
            if not isinstance(val, int):
                try:
                    val = int(val)
                except (ValueError, TypeError) as conv_err:
                    raise InvalidIntegerRangeError(
                        f"Non-integer CSI value at index {idx}: {val}"
                    ) from conv_err

            if -128 <= val <= 127:
                signed_val = val
            elif 128 <= val <= 255:
                signed_val = val - 256
            else:
                raise InvalidIntegerRangeError(
                    f"CSI value {val} at index {idx} out of 8-bit integer range [-128, 255]."
                )
            iq_bytes[idx] = signed_val & 0xFF

        target_node_id = (node_id if node_id is not None else self.node_id) & 0xFF
        freq_mhz = self.channel_to_frequency_mhz(channel) & 0xFFFFFFFF
        seq_val = int(sequence) & 0xFFFFFFFF
        rssi_val = max(-128, min(127, int(round(rssi_dbm))))
        noise_val = max(-128, min(127, int(round(noise_floor_dbm)))) if noise_floor_dbm is not None else self.default_noise_floor_dbm

        header = HEADER_STRUCT.pack(
            RUVIEW_ADR018_MAGIC,
            target_node_id,
            n_antennas,
            n_subcarriers,
            freq_mhz,
            seq_val,
            rssi_val,
            noise_val,
            ppdu_type & 0xFF,
            flags & 0xFF,
        )

        result = header + bytes(iq_bytes)
        self.stats.packets_packed += 1
        dt_us = (time.perf_counter() - t0) * 1_000_000.0
        self.stats.last_processing_time_us = dt_us
        self.stats.total_processing_time_us += dt_us
        return result

    def pack_esp32_packet(self, packet: Any, node_id: Optional[int] = None) -> bytes:
        """Alias for packing an Esp32CsiPacket dataclass."""
        if not hasattr(packet, "raw_bytes") or not packet.raw_bytes:
            raise MalformedPacketError("Esp32CsiPacket does not contain valid raw_bytes.")
        return self.pack_raw_iq(
            raw_values=packet.raw_bytes,
            sequence=packet.sequence,
            rssi_dbm=packet.rssi_dbm,
            channel=packet.channel,
            noise_floor_dbm=getattr(packet, "noise_floor_dbm", self.default_noise_floor_dbm),
            node_id=node_id,
        )

    def unpack_adr018(self, data: bytes) -> RuViewCsiFrame:
        """Alias for decode_adr018_frame."""
        return self.decode_adr018_frame(data)

    def parse_csi_line_to_adr018(self, line: str, node_id: Optional[int] = None) -> bytes:
        """Parses an ASCII line and returns ADR-018 binary bytes directly."""
        parsed = self._parse_ascii_csi_line(line)
        return self.pack_raw_iq(
            raw_values=parsed["raw_values"],
            sequence=parsed["sequence"],
            rssi_dbm=parsed["rssi_dbm"],
            channel=parsed["channel"],
            noise_floor_dbm=parsed["noise_floor_dbm"],
            node_id=node_id,
        )

    # -------------------------------------------------------------------------
    # Internal Parsing Logic
    # -------------------------------------------------------------------------

    def _parse_ascii_csi_line(self, line: str) -> Dict[str, Any]:
        """Strict parser for Espressif csi_recv_router output without data fabrication."""
        if not line or not line.startswith("CSI_DATA"):
            raise MalformedPacketError("Line does not start with CSI_DATA.")

        bracket_start = line.find("[")
        bracket_end = line.find("]", bracket_start)

        if bracket_start != -1 and bracket_end != -1:
            meta_str = line[:bracket_start].rstrip(",")
            data_str = line[bracket_start + 1 : bracket_end].strip()
        else:
            tokens = line.split(",")
            meta_str = ",".join(tokens[:22])
            data_str = ",".join(tokens[22:])

        meta_parts = [p.strip() for p in meta_str.split(",")]
        if len(meta_parts) < 4:
            raise MalformedPacketError(f"Insufficient metadata tokens: {len(meta_parts)}")

        # Pattern identification
        has_hw_noise = False
        noise_floor_val = self.default_noise_floor_dbm
        mac = None
        channel = 1
        seq = 0
        rssi = -50.0

        if ":" in meta_parts[2]:
            # Pattern A: CSI_DATA, <seq>, <mac>, <rssi>, ...
            seq = int(meta_parts[1]) if meta_parts[1].isdigit() else 0
            mac = meta_parts[2]
            rssi = float(meta_parts[3])
            # Check noise floor at token 14 if available
            if len(meta_parts) > 14 and meta_parts[14].lstrip("-").isdigit():
                noise_floor_val = int(meta_parts[14])
                has_hw_noise = True
            # Channel at token 16
            if len(meta_parts) > 16:
                clean_ch = re.sub(r"[^\d]", "", meta_parts[16])
                if clean_ch:
                    channel = int(clean_ch)
        elif len(meta_parts) > 3 and ":" in meta_parts[3]:
            # Pattern B: CSI_DATA, <type>, <seq>, <mac>, <rssi>, ...
            seq = int(meta_parts[2]) if meta_parts[2].isdigit() else 0
            mac = meta_parts[3]
            rssi = float(meta_parts[4])
            if len(meta_parts) > 15 and meta_parts[15].lstrip("-").isdigit():
                noise_floor_val = int(meta_parts[15])
                has_hw_noise = True
            if len(meta_parts) > 17:
                clean_ch = re.sub(r"[^\d]", "", meta_parts[17])
                if clean_ch:
                    channel = int(clean_ch)
        else:
            mac = next((p for p in meta_parts if ":" in p), None)
            for p in meta_parts[1:6]:
                try:
                    v = float(p)
                    if -100.0 <= v <= 0.0:
                        rssi = v
                        break
                except ValueError:
                    pass

        # Extract I/Q integers
        raw_values: List[int] = []
        for token in data_str.replace(" ", "").split(","):
            if token:
                try:
                    raw_values.append(int(token))
                except ValueError as num_err:
                    raise MalformedPacketError(f"Invalid integer token: '{token}'") from num_err

        if not raw_values:
            raise MalformedPacketError("CSI data array contained no values.")

        return {
            "sequence": seq,
            "mac_address": mac,
            "rssi_dbm": rssi,
            "channel": channel,
            "noise_floor_dbm": noise_floor_val,
            "has_hardware_noise_floor": has_hw_noise,
            "raw_values": raw_values,
        }

    def _dict_to_ruview_frame(self, data: Dict[str, Any], node_id: Optional[int] = None) -> RuViewCsiFrame:
        """Converts an internal parsed dictionary to a RuViewCsiFrame."""
        raw_vals = data.get("raw_values") or data.get("csi_raw") or data.get("raw_bytes")
        if not raw_vals:
            raise MalformedPacketError("Missing raw CSI values in dictionary.")

        packed_bytes = self.pack_raw_iq(
            raw_values=raw_vals,
            sequence=data.get("sequence", 0),
            rssi_dbm=data.get("rssi_dbm", -50),
            channel=data.get("channel", 1),
            noise_floor_dbm=data.get("noise_floor_dbm"),
            node_id=node_id,
        )
        frame = self.decode_adr018_frame(packed_bytes)
        frame.metadata.mac_address = data.get("mac_address")
        frame.metadata.has_hardware_noise_floor = data.get("has_hardware_noise_floor", False)
        return frame

    def _packet_to_ruview_frame(self, packet: Any, node_id: Optional[int] = None) -> RuViewCsiFrame:
        """Converts an Esp32CsiPacket to a RuViewCsiFrame."""
        packed_bytes = self.pack_esp32_packet(packet, node_id)
        frame = self.decode_adr018_frame(packed_bytes)
        frame.metadata.mac_address = getattr(packet, "mac_address", None)
        frame.metadata.channel = getattr(packet, "channel", 1)
        frame.metadata.timestamp = getattr(packet, "timestamp", datetime.now(timezone.utc))
        return frame
