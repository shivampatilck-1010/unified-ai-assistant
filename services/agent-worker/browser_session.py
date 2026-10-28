from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional, Tuple
from playwright.async_api import Browser, BrowserContext, Page, async_playwright


class BrowserSessionManager:
    """Manages isolated, ephemeral Playwright browser sessions."""

    def __init__(self, headless: bool = True):
        self.headless = headless

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
                ],
            )
            # Ephemeral context without saved passwords or cookies
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 UnifiedAIAssistant/1.0",
                ignore_https_errors=False,
                java_script_enabled=True,
            )
            page = await context.new_page()
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
