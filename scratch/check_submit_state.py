import asyncio
import os
import sys
import json
from playwright.async_api import async_playwright

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

async def main():
    with open("scratch/bet_active_token.txt", "r", encoding="utf-8") as f:
        jwt_token = f.read().strip()
        
    url = "https://corporate.bharatenglish.org/#/practice/exam/8149617?title=Practice&adaptiveFlow=1&returnUrl=/adaptive-learning/skill/Writing"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--window-size=1280,800",
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )
        await context.add_init_script(f"""
            localStorage.setItem('BET_AUTH_DATA', {repr(jwt_token)});
        """)
        
        page = await context.new_page()
        page.on("response", lambda r: print(f"API: {r.status} {r.url[:100]}") if "api" in r.url else None)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(4000)
        
        # Check current screen
        text = await page.evaluate("() => document.body.innerText")
        print("Page current status:\n", text[:1000])
        
        await page.screenshot(path="scratch/check_submit_state.png")
        print("Saved scratch/check_submit_state.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
