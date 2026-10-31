"""
Real-time ESP32 Wi-Fi CSI Serial Collector.
Connects directly to ESP32 DevKit V1 (e.g., CH9102 USB-to-UART on COM7) running Espressif esp-csi firmware.
Handles high-baud streaming (default 921600), reconnection, port contention (e.g., idf.py monitor),
and line parsing for variable-length CSI_DATA records.
"""

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging
import math
import re
import threading
import time
from typing import Callable, Deque, Dict, List, Optional, Tuple

try:
    import serial
    import serial.tools.list_ports as serial_tools
except ImportError:
    serial = None
    serial_tools = None

logger = logging.getLogger("esp32_serial_collector")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Esp32CsiPacket:
    """Parsed physical CSI frame received from ESP32 DevKit V1."""
    timestamp: datetime
    sequence: int
    mac_address: str
    rssi_dbm: float
    channel: int
    noise_floor_dbm: float
    subcarrier_count: int
    amplitudes: List[float] = field(default_factory=list)
    phases: List[float] = field(default_factory=list)
    raw_bytes: List[int] = field(default_factory=list)
    rate: Optional[str] = None
    sig_mode: Optional[int] = None
    mcs: Optional[int] = None
    bandwidth: Optional[int] = None


@dataclass
class CollectorHealth:
    """Runtime health and diagnostics for the serial collector."""
    is_connected: bool
    port: str
    baud_rate: int
    status: str  # "connected", "disconnected", "port_busy", "connecting", "error"
    status_message: str
    packets_captured: int
    packets_per_second: float
    malformed_packets: int
    last_packet_time: Optional[datetime]
    last_error: Optional[str]
    device_description: Optional[str] = None
    detected_ports: List[Dict[str, str]] = field(default_factory=list)


class Esp32SerialCollector:
    """Thread-safe, non-blocking serial collector for ESP32 CSI frames."""

    def __init__(
        self,
        port: str = "COM7",
        baud_rate: int = 921600,
        buffer_size: int = 150,
        auto_reconnect: bool = True,
    ) -> None:
        self.port = port
        self.baud_rate = baud_rate
        self.buffer_size = buffer_size
        self.auto_reconnect = auto_reconnect

        self._serial_handle: Optional[serial.Serial] = None
        self._thread: Optional[threading.Thread] = None
        self._is_running = False
        self._lock = threading.Lock()

        # Frame and metrics buffers
        self._packet_buffer: Deque[Esp32CsiPacket] = deque(maxlen=buffer_size)
        self._packets_captured = 0
        self._malformed_packets = 0
        self._last_packet_time: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._status = "disconnected"
        self._status_message = "Collector stopped."

        # Rate tracking
        self._recent_timestamps: Deque[float] = deque(maxlen=100)
        self._subscribers: List[Callable[[Esp32CsiPacket], None]] = []

    @classmethod
    def list_available_ports(cls) -> List[Dict[str, str]]:
        """Returns list of detected serial COM ports and hardware descriptions."""
        if not serial_tools:
            return []
        results = []
        try:
            for p in serial_tools.comports():
                is_esp = any(
                    k in (p.description or "").lower() or k in (p.hwid or "").lower()
                    for k in ["ch9102", "ch340", "cp210", "esp32", "usb-serial", "ftdi", "silicon labs", "1a86"]
                )
                results.append({
                    "port": p.device,
                    "description": p.description or "Unknown Serial Device",
                    "hwid": p.hwid or "",
                    "is_likely_esp32": is_esp,
                })
        except Exception as exc:
            logger.debug("Failed listing ports: %s", exc)
        return results

    def add_packet_listener(self, callback: Callable[[Esp32CsiPacket], None]) -> None:
        """Subscribes a listener to receive parsed packets in real-time."""
        with self._lock:
            if callback not in self._subscribers:
                self._subscribers.append(callback)

    def remove_packet_listener(self, callback: Callable[[Esp32CsiPacket], None]) -> None:
        with self._lock:
            if callback in self._subscribers:
                self._subscribers.remove(callback)

    def start(self, port: Optional[str] = None, baud_rate: Optional[int] = None) -> None:
        """Starts background serial reader thread."""
        with self._lock:
            if self._is_running:
                return
            if port:
                self.port = port
            if baud_rate:
                self.baud_rate = baud_rate
            self._is_running = True
            self._status = "connecting"
            self._status_message = f"Connecting to {self.port} at {self.baud_rate} baud..."

        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="Esp32SerialCollector")
        self._thread.start()

    def stop(self) -> None:
        """Stops background serial collector and releases COM port."""
        with self._lock:
            self._is_running = False

        if self._serial_handle:
            try:
                self._serial_handle.close()
            except Exception:
                pass
            self._serial_handle = None

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
            self._thread = None

        with self._lock:
            self._status = "disconnected"
            self._status_message = "Collector disconnected. COM port released."

    def get_health(self) -> CollectorHealth:
        """Returns comprehensive health snapshot."""
        with self._lock:
            # Calculate instant packets per second
            now_ts = time.time()
            valid_ts = [t for t in self._recent_timestamps if now_ts - t <= 2.0]
            pps = len(valid_ts) / 2.0 if valid_ts else 0.0

            ports = self.list_available_ports()
            dev_desc = next((p["description"] for p in ports if p["port"].upper() == self.port.upper()), None)

            return CollectorHealth(
                is_connected=(self._status == "connected"),
                port=self.port,
                baud_rate=self.baud_rate,
                status=self._status,
                status_message=self._status_message,
                packets_captured=self._packets_captured,
                packets_per_second=round(pps, 1),
                malformed_packets=self._malformed_packets,
                last_packet_time=self._last_packet_time,
                last_error=self._last_error,
                device_description=dev_desc,
                detected_ports=ports,
            )

    def get_latest_packet(self) -> Optional[Esp32CsiPacket]:
        with self._lock:
            return self._packet_buffer[-1] if self._packet_buffer else None

    def get_recent_packets(self, count: int = 50) -> List[Esp32CsiPacket]:
        with self._lock:
            return list(self._packet_buffer)[-count:]

    def _run_loop(self) -> None:
        """Main serial acquisition loop with auto-reconnect and error handling."""
        while self._is_running:
            try:
                if not serial:
                    raise RuntimeError("pyserial is not installed in the Python environment.")

                logger.info("Opening serial port %s at %d baud...", self.port, self.baud_rate)
                with self._lock:
                    self._status = "connecting"
                    self._status_message = f"Opening {self.port} at {self.baud_rate} baud..."

                self._serial_handle = serial.Serial(
                    port=self.port,
                    baudrate=self.baud_rate,
                    timeout=1.0,
                    write_timeout=1.0,
                )

                # Reset hardware input buffer
                self._serial_handle.reset_input_buffer()

                with self._lock:
                    self._status = "connected"
                    self._status_message = f"Connected to {self.port} at {self.baud_rate} baud."
                    self._last_error = None
                logger.info("Serial port %s opened successfully.", self.port)

                # Read line loop
                while self._is_running and self._serial_handle and self._serial_handle.is_open:
                    line_bytes = self._serial_handle.readline()
                    if not line_bytes:
                        continue

                    try:
                        line = line_bytes.decode("utf-8", errors="replace").strip()
                    except Exception:
                        continue

                    if not line.startswith("CSI_DATA"):
                        continue

                    packet = self.parse_csi_line(line)
                    if packet:
                        now_ts = time.time()
                        with self._lock:
                            self._packet_buffer.append(packet)
                            self._packets_captured += 1
                            self._last_packet_time = packet.timestamp
                            self._recent_timestamps.append(now_ts)

                        # Notify subscribers outside lock
                        for sub in list(self._subscribers):
                            try:
                                sub(packet)
                            except Exception as sub_err:
                                logger.debug("Subscriber error: %s", sub_err)
                    else:
                        with self._lock:
                            self._malformed_packets += 1

            except serial.SerialException as s_err:
                err_str = str(s_err)
                logger.warning("Serial error on %s: %s", self.port, err_str)
                with self._lock:
                    self._last_error = err_str
                    if "PermissionError" in err_str or "Access is denied" in err_str:
                        self._status = "port_busy"
                        self._status_message = (
                            f"Port {self.port} is currently locked by another application "
                            f"(e.g., idf.py monitor or serial terminal). "
                            "Please close the external monitor to allow connection."
                        )
                    elif "FileNotFoundError" in err_str or "does not exist" in err_str:
                        self._status = "disconnected"
                        self._status_message = f"Port {self.port} not detected. Check USB connection."
                    else:
                        self._status = "error"
                        self._status_message = f"Serial error: {err_str}"

                if self._serial_handle:
                    try:
                        self._serial_handle.close()
                    except Exception:
                        pass
                    self._serial_handle = None

            except Exception as exc:
                err_str = str(exc)
                logger.exception("Unexpected collector loop exception: %s", err_str)
                with self._lock:
                    self._last_error = err_str
                    self._status = "error"
                    self._status_message = f"Collector error: {err_str}"

                if self._serial_handle:
                    try:
                        self._serial_handle.close()
                    except Exception:
                        pass
                    self._serial_handle = None

            # Sleep before reconnect attempt if auto_reconnect is enabled
            if self._is_running and self.auto_reconnect:
                time.sleep(2.0)
            else:
                break

    @classmethod
    def parse_csi_line(cls, line: str) -> Optional[Esp32CsiPacket]:
        """
        Parses Espressif esp-csi CSV output.
        Supported formats:
        1. CSI_DATA,<seq>,<mac>,<rssi>,...,len,[d0, d1, d2, ...]
        2. CSI_DATA,type,seq,mac,rssi,...,len,[data]
        """
        if not line or not line.startswith("CSI_DATA"):
            return None

        try:
            # 1. Locate bracketed data array '[ ... ]'
            bracket_start = line.find("[")
            bracket_end = line.find("]", bracket_start)

            if bracket_start != -1 and bracket_end != -1:
                meta_str = line[:bracket_start].rstrip(",")
                data_str = line[bracket_start + 1 : bracket_end].strip()
            else:
                # No brackets, split directly
                tokens = line.split(",")
                meta_str = ",".join(tokens[:22])
                data_str = ",".join(tokens[22:])

            meta_parts = [p.strip() for p in meta_str.split(",")]
            if len(meta_parts) < 4:
                return None

            # Detect index offsets based on meta_parts
            # Common patterns:
            # Pattern A: CSI_DATA, <seq>, <mac>, <rssi>, ...
            # Pattern B: CSI_DATA, <type>, <seq>, <mac>, <rssi>, ...
            if ":" in meta_parts[2]:
                # Pattern A
                seq = int(meta_parts[1]) if meta_parts[1].isdigit() else 0
                mac = meta_parts[2]
                rssi = float(meta_parts[3])
                channel_str = meta_parts[15] if len(meta_parts) > 15 else "0"
            elif len(meta_parts) > 3 and ":" in meta_parts[3]:
                # Pattern B
                seq = int(meta_parts[2]) if meta_parts[2].isdigit() else 0
                mac = meta_parts[3]
                rssi = float(meta_parts[4])
                channel_str = meta_parts[16] if len(meta_parts) > 16 else "0"
            else:
                # Fallback heuristic
                mac = next((p for p in meta_parts if ":" in p), "unknown")
                rssi = -50.0
                for p in meta_parts[1:6]:
                    try:
                        v = float(p)
                        if -100.0 <= v <= 0.0:
                            rssi = v
                            break
                    except ValueError:
                        pass
                seq = 0
                channel_str = "1"

            try:
                channel = int(re.sub(r"[^\d]", "", channel_str) or "1")
            except ValueError:
                channel = 1

            # Parse CSI bytes
            raw_bytes: List[int] = []
            for token in data_str.replace(" ", "").split(","):
                if token:
                    try:
                        raw_bytes.append(int(token))
                    except ValueError:
                        pass

            if not raw_bytes:
                return None

            # Extract complex IQ subcarrier pairs
            amplitudes: List[float] = []
            phases: List[float] = []
            for i in range(0, len(raw_bytes) - 1, 2):
                # Signed 8-bit integer (-128 to 127)
                i_val = raw_bytes[i] if raw_bytes[i] < 128 else raw_bytes[i] - 256
                q_val = raw_bytes[i + 1] if raw_bytes[i + 1] < 128 else raw_bytes[i + 1] - 256
                amp = math.hypot(i_val, q_val)
                phase = math.atan2(q_val, i_val)
                amplitudes.append(round(amp, 2))
                phases.append(round(phase, 4))

            return Esp32CsiPacket(
                timestamp=utc_now(),
                sequence=seq,
                mac_address=mac,
                rssi_dbm=rssi,
                channel=channel,
                noise_floor_dbm=-95.0,
                subcarrier_count=len(amplitudes),
                amplitudes=amplitudes,
                phases=phases,
                raw_bytes=raw_bytes,
            )
        except Exception as exc:
            logger.debug("Malformed CSI line '%s...': %s", line[:40], exc)
            return None
