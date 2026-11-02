import os
import glob
import re

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))

all_kv = {}
for fpath in files:
    try:
        with open(fpath, "rb") as f:
            data = f.read()
            # Search for occurrences of corporate.bharatenglish.org
            pattern = rb"_https://corporate\.bharatenglish\.org\x00\x01([^\x00\x01]+)\x01([^\x00]+)"
            matches = re.findall(pattern, data)
            for k, v in matches:
                try:
                    all_kv[k.decode('utf-8', errors='ignore')] = v.decode('utf-8', errors='ignore')
                except Exception:
                    pass
    except Exception as e:
        print(f"Error {fpath}: {e}")

print(f"Found {len(all_kv)} localStorage entries for corporate.bharatenglish.org:")
for k, v in all_kv.items():
    print(f"Key: {k}")
    print(f"Val: {v[:120]}...\n")
