"""
Live Hardware Validation Test for Esp32CsiToRuviewAdapter on COM7.
Connects directly to COM7 (CH9102 USB-to-UART), reads genuine live serial lines,
and feeds them in real-time through the Esp32CsiToRuviewAdapter.
"""

import os
import sys
import time

try:
    import serial
except ImportError:
    serial = None

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing")))
from esp32_csi_to_ruview_adapter import Esp32CsiToRuviewAdapter

def test_live_hardware(port: str = "COM7", baud: int = 921600, duration_seconds: float = 3.0):
    if not serial:
        print("[SKIP] pyserial not available.")
        return

    print(f"--- Testing Live Hardware on {port} at {baud} baud ({duration_seconds}s) ---")
    adapter = Esp32CsiToRuviewAdapter(node_id=1)

    try:
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = baud
        ser.timeout = 1.0
        ser.dtr = False
        ser.rts = False
        ser.open()
        ser.reset_input_buffer()
        print(f"[OK] Successfully opened {port}.")

        t_end = time.time() + duration_seconds
        lines_read = 0
        csi_frames_packed = 0

        while time.time() < t_end:
            line_bytes = ser.readline()
            if not line_bytes:
                continue
            lines_read += 1
            line = line_bytes.decode("utf-8", errors="replace").strip()

            if line.startswith("CSI_DATA"):
                packed = adapter.parse_csi_line_to_adr018(line, node_id=1)
                unpacked = adapter.unpack_adr018(packed)
                csi_frames_packed += 1
                if csi_frames_packed == 1:
                    print(f"[LIVE FRAME #1] Subcarriers: {unpacked.metadata.n_subcarriers}, "
                          f"Freq: {unpacked.metadata.channel_freq_mhz} MHz, "
                          f"RSSI: {unpacked.metadata.rssi_dbm} dBm, "
                          f"First I/Q: ({unpacked.subcarriers[0].i}, {unpacked.subcarriers[0].q})")
            else:
                if lines_read <= 3:
                    print(f"[FW LOG] {line[:80]}")

        ser.close()
        print(f"[RESULT] Read {lines_read} serial lines, successfully converted {csi_frames_packed} genuine CSI frames to ADR-018.")
        print(f"[RESULT] Port {port} released.")

    except serial.SerialException as err:
        print(f"[NOTICE] Serial port {port} unavailable: {err}")
    except Exception as exc:
        print(f"[ERROR] Live test error: {exc}")

if __name__ == "__main__":
    test_live_hardware()
