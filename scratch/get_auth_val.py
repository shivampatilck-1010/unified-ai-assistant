import os
import glob
import re

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))

best_val = None
for fpath in files:
    try:
        with open(fpath, "rb") as f:
            data = f.read()
            pattern = rb"BET_AUTH_DATA\x01([^\x00]+)"
            m = re.search(pattern, data)
            if m:
                val = m.group(1).decode('utf-8', errors='ignore')
                if not best_val or len(val) > len(best_val):
                    best_val = val
    except Exception:
        pass

print("Length of BET_AUTH_DATA:", len(best_val) if best_val else 0)
if best_val:
    with open("scratch/bet_auth_data.txt", "w", encoding="utf-8") as f:
        f.write(best_val)
    print("Saved to scratch/bet_auth_data.txt")
