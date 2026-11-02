import os
import glob

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))

for fpath in files:
    with open(fpath, "rb") as f:
        data = f.read()
        pos = data.find(b"BET_AUTH_DATA")
        if pos != -1:
            print(f"Found in {os.path.basename(fpath)} at {pos}")
            snippet = data[pos:pos+700]
            print(repr(snippet[:300]))
            break
