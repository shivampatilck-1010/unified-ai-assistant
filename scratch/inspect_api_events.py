import json
import os

with open("scratch/verified_api_completion.json", "r", encoding="utf-8") as f:
    events = json.load(f)

print(f"Total API events: {len(events)}")
for e in events:
    url = e.get("url", "")
    status = e.get("status")
    if any(k in url for k in ["exam", "submit", "result", "metric", "lesson", "grade"]):
        print(f"[{status}] {url}")
        data = e.get("data")
        if isinstance(data, dict):
            print("  Keys:", list(data.keys()))
            if "score" in data or "marks" in data or "status" in data or "message" in data:
                print("  Sample data:", {k: data[k] for k in ["score", "marks", "status", "message", "percentage", "total_marks"] if k in data})
