import os
import subprocess
import sys
import time

base_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(base_dir)

print(f"[SUPERVISOR] Starting Unified AI Assistant API server in {base_dir}")
while True:
    try:
        print("[SUPERVISOR] Launching uvicorn main:app on http://127.0.0.1:8000...")
        proc = subprocess.run(
            [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=base_dir,
        )
        print(f"[SUPERVISOR] Uvicorn exited with code {proc.returncode}. Restarting in 1s...")
    except KeyboardInterrupt:
        print("[SUPERVISOR] Shutting down.")
        break
    except Exception as e:
        print(f"[SUPERVISOR] Unexpected error: {e}. Restarting in 2s...")
    time.sleep(1)
