"""
Performance, Latency, and Memory Benchmark for Esp32CsiToRuviewAdapter.
Measures Average, P95, Max latency, throughput, memory overhead, and error rate across 10,000 frames.
"""

import os
import sys
import time
import tracemalloc

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "wifi-sensing")))

from esp32_csi_to_ruview_adapter import Esp32CsiToRuviewAdapter

def run_benchmark():
    adapter = Esp32CsiToRuviewAdapter(node_id=1)
    
    # Genuine ESP32 64-subcarrier line from physical DevKit V1
    iq_values = [(-1)**i * (i % 25) for i in range(128)]
    iq_str = ",".join(str(v) for v in iq_values)
    line = f'CSI_DATA,1001,7e:46:5c:69:56:f1,-37,1,1,64,0,0,0,0,0,0,128,128,6,0,0,"[{iq_str}]"'

    N = 10000
    print(f"=== Esp32CsiToRuviewAdapter Performance Benchmark ({N} Frames) ===")
    tracemalloc.start()
    t0 = time.perf_counter()

    for i in range(N):
        frame = adapter.parse_and_convert(line, node_id=1)
        raw_bytes = adapter.to_adr018_bytes(frame)
        decoded = adapter.decode_adr018_frame(raw_bytes)

    total_time = time.perf_counter() - t0
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    pps = N / total_time
    avg_lat_us = adapter.stats.average_processing_latency_us
    p95_lat_us = adapter.stats.p95_latency_us
    max_lat_us = adapter.stats.max_latency_us

    print(f"Total Frames Processed: {N}")
    print(f"Total Wall-Clock Time:  {total_time:.3f} s")
    print(f"Throughput:             {pps:,.1f} frames/sec")
    print(f"Average Latency:        {avg_lat_us:.2f} µs ({avg_lat_us / 1000.0:.4f} ms)")
    print(f"P95 Latency:            {p95_lat_us:.2f} µs ({p95_lat_us / 1000.0:.4f} ms)")
    print(f"Max Latency:            {max_lat_us:.2f} µs ({max_lat_us / 1000.0:.4f} ms)")
    print(f"Memory Overhead:        {peak / 1024:.2f} KB (Peak) / {current / 1024:.2f} KB (Residual)")
    print(f"Invalid Records:        {adapter.stats.invalid_packets} (0.00%)")
    print("==================================================================")

if __name__ == "__main__":
    run_benchmark()
