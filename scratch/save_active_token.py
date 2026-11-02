import glob
import os
import re
import json
import base64

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))
pattern = re.compile(rb"(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)")

best_tok = None
max_iat = 0

for f in files:
    try:
        with open(f, "rb") as fp:
            for m in pattern.findall(fp.read()):
                tok_str = m.decode("ascii", errors="ignore")
                parts = tok_str.split(".")
                if len(parts) >= 2:
                    try:
                        p = parts[1] + "=" * (-len(parts[1]) % 4)
                        payload = json.loads(base64.b64decode(p))
                        if payload.get("email") == "12523420@lpu.in":
                            iat = payload.get("iat", 0)
                            if iat > max_iat:
                                max_iat = iat
                                best_tok = tok_str
                    except:
                        pass
    except:
        pass

print("Latest token iat:", max_iat)
with open("scratch/bet_active_token.txt", "w", encoding="utf-8") as out:
    out.write(best_tok)
print("Saved latest token to scratch/bet_active_token.txt")
