import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional, Tuple
from playwright.async_api import Browser, BrowserContext, Page, Route, async_playwright

from policy import PolicyViolationError, validate_url

logger = logging.getLogger(__name__)


class BrowserSessionManager:
    """Manages isolated, ephemeral Playwright browser sessions with network egress filtering."""

    def __init__(self, headless: bool = True, allow_local: bool = False):
        self.headless = headless
        self.allow_local = allow_local

    @asynccontextmanager
    async def create_session(self) -> AsyncGenerator[Tuple[Browser, BrowserContext, Page], None]:
        """Creates an isolated ephemeral browser session that cleanly shuts down on exit."""
        playwright_cm = async_playwright()
        p = await playwright_cm.start()
        browser: Optional[Browser] = None
        context: Optional[BrowserContext] = None

        try:
            # Dedicated Chromium browser process isolated from everyday user profile
            browser = await p.chromium.launch(
                headless=self.headless,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-infobars",
                    "--disable-gpu",
                ],
            )
            # Ephemeral context without saved passwords or cookies
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 UnifiedAIAssistant/1.0",
                ignore_https_errors=False,
                java_script_enabled=True,
                accept_downloads=False,
                permissions=[],
            )

            # Route interceptor for strict network egress control (blocking subresource SSRF)
            async def egress_route_interceptor(route: Route) -> None:
                req = route.request
                req_url = req.url
                # Allow data: and blob: URLs for in-page images and scripts
                if req_url.startswith(("data:", "blob:", "about:")):
                    await route.continue_()
                    return

                try:
                    validate_url(req_url, allow_local=self.allow_local)
                    await route.continue_()
                except PolicyViolationError as pve:
                    logger.warning("Blocked outbound egress request in browser worker: %s (%s)", req_url, pve)
                    await route.abort("blockedbyclient")
                except Exception as ex:
                    logger.warning("Aborted egress request due to unexpected validation error: %s (%s)", req_url, ex)
                    await route.abort("blockedbyclient")

            await context.route("**/*", egress_route_interceptor)

            page = await context.new_page()
            # Set default navigation and interaction timeouts (30s)
            page.set_default_navigation_timeout(30000)
            page.set_default_timeout(30000)

            yield browser, context, page

        finally:
            if context:
                try:
                    await context.close()
                except Exception:
                    pass
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            try:
                await playwright_cm.__aexit__(None, None, None)
            except Exception:
                pass
