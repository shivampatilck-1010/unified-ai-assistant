import os
import re
import subprocess
import sys
import threading
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_DIR = os.path.join(BASE_DIR, "services", "api")
CLOUDFLARED_BIN = r"C:\Program Files (x86)\cloudflared\cloudflared.exe"
PYTHON_BIN = os.path.join(API_DIR, ".venv", "Scripts", "python.exe")
TUNNEL_URL_FILE = os.path.join(BASE_DIR, "current_tunnel_url.txt")

current_tunnel_url = None


def run_api_server():
    print(f"[SUPERVISOR] Starting FastAPI backend in {API_DIR}...")
    while True:
        try:
            proc = subprocess.run(
                [PYTHON_BIN, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                cwd=API_DIR,
            )
            print(f"[SUPERVISOR] FastAPI exited with code {proc.returncode}. Restarting in 1s...")
        except Exception as e:
            print(f"[SUPERVISOR] FastAPI error: {e}. Retrying in 2s...")
        time.sleep(1)


def run_cloudflared_tunnel():
    global current_tunnel_url
    print(f"[SUPERVISOR] Starting Cloudflare Tunnel via {CLOUDFLARED_BIN}...")
    while True:
        try:
            proc = subprocess.Popen(
                [CLOUDFLARED_BIN, "tunnel", "--url", "http://127.0.0.1:8000"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            for line in proc.stdout:
                line_str = line.strip()
                if line_str:
                    print(f"[CLOUDFLARED] {line_str}")
                match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line_str)
                if match:
                    current_tunnel_url = match.group(0)
                    print(f"\n=======================================================")
                    print(f"[TUNNEL_ACTIVE] Live Public URL: {current_tunnel_url}")
                    print(f"=======================================================\n")
                    with open(TUNNEL_URL_FILE, "w", encoding="utf-8") as f:
                        f.write(current_tunnel_url)

            proc.wait()
            print(f"[SUPERVISOR] Cloudflared exited with code {proc.returncode}. Restarting in 2s...")
        except Exception as e:
            print(f"[SUPERVISOR] Cloudflared error: {e}. Retrying in 2s...")
        time.sleep(2)


if __name__ == "__main__":
    t_api = threading.Thread(target=run_api_server, daemon=True)
    t_api.start()

    time.sleep(1)

    t_tunnel = threading.Thread(target=run_cloudflared_tunnel, daemon=True)
    t_tunnel.start()

    print("[SUPERVISOR] Both daemons launched. Running main monitor loop...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("[SUPERVISOR] Shutting down.")
