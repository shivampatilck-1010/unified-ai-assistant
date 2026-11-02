import glob
import os
import re
import json
import base64
import urllib.request
import urllib.error

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))
pattern = re.compile(rb"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)")

tokens = set()
for f in files:
    try:
        with open(f, "rb") as fp:
            for m in pattern.findall(fp.read()):
                tok_str = m.decode("ascii", errors="ignore")
                parts = tok_str.split(".")
                if len(parts) >= 2:
                    try:
                        p = parts[1] + "=" * (-len(parts[1]) % 4)
                        payload_str = base64.b64decode(p).decode("utf-8", errors="ignore")
                        if "12523420" in payload_str or "lpu724598" in payload_str:
                            tokens.add(tok_str)
                    except:
                        pass
    except:
        pass

print(f"Found {len(tokens)} distinct LPU tokens")
for idx, tok in enumerate(tokens):
    parts = tok.split(".")
    p = parts[1] + "=" * (-len(parts[1]) % 4)
    payload = json.loads(base64.b64decode(p))
    print(f"\n--- Token {idx} ---")
    print("iat:", payload.get("iat"), "exp:", payload.get("exp"), "name:", payload.get("firstName"))
    print("roles:", payload.get("roles"), "guid:", payload.get("guid"))
    
    # Test multiple endpoints
    endpoints = [
        "https://corporate.bharatenglish.org/api/client/config",
        "https://corporate.bharatenglish.org/api/bet-exams/users/me",
        "https://corporate.bharatenglish.org/api/orgs/lpu724598/bet-sections/4/lessons/1362806",
        "https://corporate.bharatenglish.org/api/orgs/lpu724598/settings",
    ]
    for ep in endpoints:
        req = urllib.request.Request(ep, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Authorization": f"Bearer {tok}",
            "Referer": "https://corporate.bharatenglish.org/",
            "Origin": "https://corporate.bharatenglish.org"
        })
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                print(f"  Endpoint {ep.split('/')[-1]}: {resp.status} OK")
                body = resp.read()
                print(f"    Body snippet: {body[:150]}")
        except urllib.error.HTTPError as e:
            print(f"  Endpoint {ep.split('/')[-1]}: {e.code} {e.reason}")
