import urllib.parse
from typing import List, Optional

TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "fbclid",
    "gclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
}


def canonicalize_url(url: str) -> str:
    """Canonicalizes a URL by normalizing case, path, stripping fragments and tracking parameters."""
    if not url or not isinstance(url, str):
        return ""

    try:
        parsed = urllib.parse.urlsplit(url.strip())
    except Exception:
        return url.strip()

    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()

    # Normalize port
    if ":" in netloc:
        host, port = netloc.split(":", 1)
        if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
            netloc = host

    # Normalize path
    path = parsed.path or "/"
    while "//" in path:
        path = path.replace("//", "/")
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")

    # Filter query parameters
    query_parts = []
    if parsed.query:
        query_dict = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        filtered = [
            (k, v)
            for k, v in query_dict
            if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
        ]
        if filtered:
            filtered.sort(key=lambda x: x[0])
            query_parts = [urllib.parse.urlencode(filtered)]

    query = query_parts[0] if query_parts else ""

    # Reassemble without fragment
    return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))


def extract_publisher(url: str) -> str:
    """Derives a clean publisher / website name from URL hostname."""
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        return host or "Web Source"
    except Exception:
        return "Web Source"
