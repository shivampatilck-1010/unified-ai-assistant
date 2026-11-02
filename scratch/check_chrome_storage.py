import os
import glob

leveldb_dir = r"C:\Users\shiva\AppData\Local\Google\Chrome\User Data\Default\Local Storage\leveldb"
print("Checking leveldb dir:", os.path.exists(leveldb_dir))
if os.path.exists(leveldb_dir):
    files = glob.glob(os.path.join(leveldb_dir, "*.ldb")) + glob.glob(os.path.join(leveldb_dir, "*.log"))
    print(f"Found {len(files)} leveldb files.")
    found_tokens = []
    for fpath in files:
        try:
            with open(fpath, "rb") as f:
                content = f.read()
                if b"bharatenglish" in content or b"fluentedge" in content:
                    print(f"Hit in {os.path.basename(fpath)}!")
                    # search for token or auth
                    idx = 0
                    while True:
                        pos = content.find(b"token", idx)
                        if pos == -1:
                            break
                        snippet = content[max(0, pos-20):min(len(content), pos+80)]
                        found_tokens.append(snippet)
                        idx = pos + 10
                        if len(found_tokens) > 10:
                            break
        except Exception as e:
            pass
    print("Found token snippets:", len(found_tokens))
    for s in found_tokens[:5]:
        print("  Snippet:", s)
