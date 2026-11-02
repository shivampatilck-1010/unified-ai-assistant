import asyncio
import os
from playwright.async_api import async_playwright

async def inspect():
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print(f"Testing navigation with wait_until='commit' to: {url}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process"
            ]
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 UnifiedAIAssistant/1.0"
        )
        page = await context.new_page()
        try:
            resp = await page.goto(url, wait_until="commit", timeout=20000)
            print(f"Goto with commit finished. Status: {resp.status if resp else 'N/A'}")
            print(f"Current URL: {page.url}")
            
            # Now wait for the SPA to hydrate or load elements
            print("Waiting 5s for SPA scripts to run...")
            await page.wait_for_timeout(5000)
            
            print(f"Current URL after wait: {page.url}")
            title = await page.title()
            print(f"Title: {title}")
            
            os.makedirs("scratch", exist_ok=True)
            await page.screenshot(path="scratch/bet_loaded.png", full_page=False)
            print("Saved scratch/bet_loaded.png")
            
            body_text = await page.text_content("body")
            print(f"Body text:\n{body_text[:1000] if body_text else 'EMPTY'}")
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect())
