import html
import logging
import re
import urllib.parse
from typing import List, Optional

import httpx

from services.research.search_providers.base import (
    BaseSearchProvider,
    DiscoveredSourceItem,
)
from services.research.url_utils import canonicalize_url, extract_publisher

logger = logging.getLogger("duckduckgo_provider")


class DuckDuckGoSearchProvider(BaseSearchProvider):
    """Zero-credential privacy-respecting search provider querying DuckDuckGo HTML endpoint."""

    @property
    def provider_id(self) -> str:
        return "duckduckgo"

    async def search(
        self,
        query: str,
        num_results: int = 5,
        allowed_domains: Optional[List[str]] = None,
    ) -> List[DiscoveredSourceItem]:
        search_query = query.strip()
        if allowed_domains and len(allowed_domains) > 0:
            domain_filter = " OR ".join(f"site:{d.strip()}" for d in allowed_domains if d.strip())
            search_query = f"{search_query} ({domain_filter})"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        discovered: List[DiscoveredSourceItem] = []
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.post(
                    "https://html.duckduckgo.com/html/",
                    data={"q": search_query},
                    headers=headers,
                )
                if resp.status_code != 200:
                    logger.warning("DuckDuckGo HTML search responded with HTTP %d", resp.status_code)
                    return []

                content = resp.text
                # Parse result links and snippets
                # Links usually formatted as: <a class="result__url" href="...uddg=URL..."> or result__snippet
                # Match result__title anchors
                matches = re.findall(
                    r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                    content,
                    re.IGNORECASE | re.DOTALL,
                )
                if not matches:
                    # Alternative pattern: result__title anchor
                    title_matches = re.findall(
                        r'<a[^>]+class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                        content,
                        re.IGNORECASE | re.DOTALL,
                    )
                    matches = title_matches

                for raw_href, raw_text in matches:
                    clean_text = html.unescape(re.sub(r"<[^>]+>", "", raw_text)).strip()
                    # Handle DuckDuckGo redirect wrapper ?uddg=...
                    real_url = raw_href
                    if "uddg=" in raw_href:
                        parsed = urllib.parse.urlparse(raw_href)
                        qsl = urllib.parse.parse_qs(parsed.query)
                        if "uddg" in qsl and qsl["uddg"]:
                            real_url = qsl["uddg"][0]

                    real_url = urllib.parse.unquote(real_url)
                    if not real_url.startswith("http"):
                        continue

                    canon = canonicalize_url(real_url)
                    pub = extract_publisher(canon)

                    # Domain filtering
                    if allowed_domains:
                        if not any(pub == d.lower() or pub.endswith("." + d.lower()) for d in allowed_domains):
                            continue

                    discovered.append(
                        DiscoveredSourceItem(
                            title=clean_text[:120] if clean_text else pub,
                            url=canon,
                            snippet=clean_text or f"Discovered source from {pub}",
                            publisher=pub,
                        )
                    )
                    if len(discovered) >= num_results:
                        break

        except Exception as exc:
            logger.warning("DuckDuckGo search error: %s", exc)

        return discovered[:num_results]
