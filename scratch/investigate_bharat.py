import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    target_url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print(f"Target URL: {target_url}")
    
    async with async_playwright() as p:
        # Launch Chromium with anti-bot bypass arguments
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--window-size=1280,800",
            ]
        )
        
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )
        
        # Override navigator.webdriver
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {}
            };
        """)
        
        page = await context.new_page()
        
        page.on("console", lambda m: print(f"CONSOLE [{m.type}]: {m.text}"))
        page.on("pageerror", lambda e: print(f"PAGE ERROR: {e}"))
        page.on("requestfailed", lambda r: print(f"REQ FAILED: {r.method} {r.url} -> {r.failure}"))
        
        print("Navigating to URL...")
        resp = await page.goto(target_url, wait_until="commit", timeout=30000)
        print(f"Commit response status: {resp.status if resp else 'N/A'}")
        
        # Wait up to 15 seconds, polling DOM state
        for sec in range(15):
            await page.wait_for_timeout(1000)
            url = page.url
            title = await page.title()
            root_html = await page.evaluate("() => document.querySelector('bet-apps-root')?.outerHTML || 'NO_ROOT'")
            body_text = await page.evaluate("() => document.body.innerText")
            print(f"[{sec+1}s] URL: {url} | Title: {title} | Root len: {len(root_html)} | Body text len: {len(body_text)}")
            if len(body_text.strip()) > 0:
                print(f"Detected Body Text:\n{body_text[:500]}")
                break
                
        os.makedirs("scratch", exist_ok=True)
        await page.screenshot(path="scratch/investigate_bet.png", full_page=False)
        print("Saved scratch/investigate_bet.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
