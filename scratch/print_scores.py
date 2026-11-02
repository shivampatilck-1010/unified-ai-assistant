import json

with open("scratch/verified_api_completion.json", "r", encoding="utf-8") as f:
    events = json.load(f)

for idx, e in enumerate([x for x in events if "answers" in x.get("url", "")]):
    print(f"=== ANSWER {idx + 1} RESULT ===")
    data = e.get("data", {})
    print("is_correct:", data.get("is_correct"))
    print("marks:", data.get("marks"))
    print("marks_scored:", data.get("marks_scored"))
    print("rich_analysis:", json.dumps(data.get("rich_analysis"), indent=2))
