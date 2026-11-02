import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    with open("scratch/bet_auth_data.txt", "r", encoding="utf-8") as f:
        auth_data = f.read().strip()
        
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print(f"Navigating to lesson with BET_AUTH_DATA ({len(auth_data)} chars)...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
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
        
        # Inject auth data into localStorage before any script runs
        await context.add_init_script(f"""
            localStorage.setItem('BET_AUTH_DATA', '{auth_data}');
        """)
        
        page = await context.new_page()
        page.on("console", lambda m: print(f"CONSOLE: [{m.type}] {m.text}"))
        page.on("pageerror", lambda e: print(f"PAGE ERROR: {e}"))
        
        resp = await page.goto(url, wait_until="commit", timeout=30000)
        print(f"Goto status: {resp.status if resp else 'N/A'}")
        
        # Poll for 10 seconds to see the lesson mount
        for s in range(12):
            await page.wait_for_timeout(1000)
            cur_url = page.url
            title = await page.title()
            body_text = await page.evaluate("() => document.body.innerText")
            print(f"[{s+1}s] URL: {cur_url} | Text length: {len(body_text)}")
            if "login" not in cur_url and len(body_text.strip()) > 50:
                print(f"Lesson content loaded at {s+1}s!")
                print("Body Text Preview:\n", body_text[:800])
                break
                
        await page.screenshot(path="scratch/lesson_loaded.png")
        print("Saved scratch/lesson_loaded.png")
        
        # Check interactive elements
        buttons = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('button, a, input, [role="button"]')).map(el => ({
                tag: el.tagName.toLowerCase(),
                text: el.innerText.trim(),
                type: el.getAttribute('type'),
                className: el.className
            })).filter(b => b.text.length > 0 || b.type);
        }""")
        print(f"Found {len(buttons)} interactive elements:")
        for b in buttons[:20]:
            print(" ", b)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
