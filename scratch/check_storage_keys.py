import urllib.request
import re

for script in ['main-ID7QZPU5.js', 'scripts-HS64E3W3.js']:
    try:
        url = 'https://corporate.bharatenglish.org/' + script
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode('utf-8', errors='ignore')
            get_keys = re.findall(r'localStorage\.getItem\(["\']([^"\']+)["\']\)', text)
            print(f"{script} get keys: {set(get_keys)}")
            set_keys = re.findall(r'localStorage\.setItem\(["\']([^"\']+)["\']', text)
            print(f"{script} set keys: {set(set_keys)}")
    except Exception as e:
        print(f"Error {script}: {e}")
