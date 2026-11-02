import urllib.request
import re

chunks = [
    'chunk-PxnHqGLQ.js', 'chunk-DtFLLbxn.js', 'chunk-Dbn_-PXo.js', 'chunk-DLB2w0Vb.js',
    'chunk-B-cqBXY8.js', 'chunk-CLqJiSv6.js', 'chunk-BKTIdZ-c.js', 'chunk-Btt4OeJP.js',
    'chunk-CwvirUEE.js', 'chunk-Btv6vGQX.js', 'chunk-BPyeTj-d.js', 'chunk-z84aTsXd.js',
]

for ch in chunks:
    try:
        url = 'https://corporate.bharatenglish.org/' + ch
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            text = resp.read().decode('utf-8', errors='ignore')
            get_keys = re.findall(r'localStorage\.getItem\(["\']([^"\']+)["\']\)', text)
            if get_keys:
                print(f"{ch} get keys: {set(get_keys)}")
            set_keys = re.findall(r'localStorage\.setItem\(["\']([^"\']+)["\']', text)
            if set_keys:
                print(f"{ch} set keys: {set(set_keys)}")
    except Exception as e:
        pass
