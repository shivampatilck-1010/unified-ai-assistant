import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        requests = []
        page.on("request", lambda r: requests.append((r.method, r.url, r.resource_type)))
        page.on("response", lambda r: print(f"Response: {r.status} {r.url[:80]}"))
        page.on("console", lambda m: print(f"Console: [{m.type}] {m.text}"))

        print("Navigating...")
        await page.goto("https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103", wait_until="commit")
        
        # Wait up to 10 seconds for main bundle to execute
        await page.wait_for_timeout(10000)
        
        print(f"Total requests: {len(requests)}")
        for m, u, t in requests[:15]:
            print(f"  {m} {t}: {u[:90]}")
            
        print("Page URL:", page.url)
        content = await page.content()
        print("Page content length:", len(content))
        await page.screenshot(path="scratch/bet_debug.png")
        print("Saved scratch/bet_debug.png")
        await browser.close()

asyncio.run(run())
