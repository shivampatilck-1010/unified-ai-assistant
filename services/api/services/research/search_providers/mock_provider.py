import urllib.parse
from typing import List, Optional

from services.research.search_providers.base import (
    BaseSearchProvider,
    DiscoveredSourceItem,
)
from services.research.url_utils import canonicalize_url, extract_publisher


class MockSearchProvider(BaseSearchProvider):
    """Deterministic in-memory search provider for automated tests and isolated runs."""

    def __init__(self, predefined_items: Optional[List[DiscoveredSourceItem]] = None):
        self._predefined = predefined_items or []

    @property
    def provider_id(self) -> str:
        return "mock"

    def set_predefined(self, items: List[DiscoveredSourceItem]) -> None:
        self._predefined = items

    async def search(
        self,
        query: str,
        num_results: int = 5,
        allowed_domains: Optional[List[str]] = None,
    ) -> List[DiscoveredSourceItem]:
        if self._predefined:
            filtered = []
            for item in self._predefined:
                item_pub = extract_publisher(item.url)
                if allowed_domains and not any(
                    item_pub == d.lower() or item_pub.endswith("." + d.lower())
                    for d in allowed_domains
                ):
                    continue
                filtered.append(item)
            return filtered[:num_results]

        # Generate realistic deterministic results based on query keywords
        q_clean = query.strip()
        slug = urllib.parse.quote_plus(q_clean.lower()[:30])

        default_sources = [
            DiscoveredSourceItem(
                title=f"Comprehensive Overview: {q_clean}",
                url=canonicalize_url(f"https://research-archive.org/reports/{slug}-overview"),
                snippet=f"Detailed analysis regarding {q_clean} showing key trends, benchmarks, and historical context.",
                publisher="research-archive.org",
            ),
            DiscoveredSourceItem(
                title=f"Technical Benchmark and Specifications: {q_clean}",
                url=canonicalize_url(f"https://tech-benchmarks.net/analysis/{slug}-specs"),
                snippet=f"Quantitative performance metrics and empirical evaluations for {q_clean}.",
                publisher="tech-benchmarks.net",
            ),
            DiscoveredSourceItem(
                title=f"Industry Case Study & Findings: {q_clean}",
                url=canonicalize_url(f"https://industry-insights.com/papers/{slug}-case-study"),
                snippet=f"Real-world case studies exploring the practical outcomes and limitations of {q_clean}.",
                publisher="industry-insights.com",
            ),
            DiscoveredSourceItem(
                title=f"Critical Perspectives on {q_clean}",
                url=canonicalize_url(f"https://academic-review.edu/perspectives/{slug}"),
                snippet=f"Contrasting arguments, potential tradeoffs, and unresolved inquiries regarding {q_clean}.",
                publisher="academic-review.edu",
            ),
            DiscoveredSourceItem(
                title=f"Standard Documentation: {q_clean}",
                url=canonicalize_url(f"https://standards-org.org/guidelines/{slug}"),
                snippet=f"Official standards, reference architecture, and compliance protocols for {q_clean}.",
                publisher="standards-org.org",
            ),
        ]

        if allowed_domains:
            # Re-target mock URLs to allowed domain
            target_domain = allowed_domains[0].lower().strip()
            default_sources = [
                DiscoveredSourceItem(
                    title=f"Official {target_domain.capitalize()} Documentation: {q_clean}",
                    url=canonicalize_url(f"https://{target_domain}/docs/{slug}"),
                    snippet=f"Official reference data from {target_domain} about {q_clean}.",
                    publisher=target_domain,
                )
            ]

        return default_sources[:num_results]
