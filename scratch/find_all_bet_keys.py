import os
import glob
import re

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))

entries = {}
for fpath in files:
    try:
        with open(fpath, "rb") as f:
            data = f.read()
            # Look for any keys containing BET_ or bharatenglish
            matches = re.findall(rb"BET_[A-Za-z0-9_]+", data)
            for m in set(matches):
                key = m.decode('ascii', errors='ignore')
                entries[key] = True
    except Exception:
        pass

print("Distinct BET keys found in LevelDB:", list(entries.keys()))
