import urllib.request
import re

req = urllib.request.Request(
    'https://corporate.bharatenglish.org/',
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
)
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

print('Title:', re.findall(r'<title>(.*?)</title>', html))
scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
print('Script src tags:', scripts)
base = re.findall(r'<base[^>]+href=["\']([^"\']+)["\']', html)
print('Base href:', base)
