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
        
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print("Navigating to main lessons view to verify updated status...")
    
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
        
        lesson_api_data = []
        async def on_response(res):
            if "bet-section-unit-lesson-insts" in res.url:
                try:
                    data = await res.json()
                    lesson_api_data.append(data)
                except Exception:
                    pass
        page.on("response", on_response)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(4500)
        
        # Dismiss any popup
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Got it!' || txt === 'Skip for now') b.click();
            });
        }""")
        await page.wait_for_timeout(1000)
        
        await page.screenshot(path="scratch/final_lessons_portal_state.png", full_page=False)
        print("Saved scratch/final_lessons_portal_state.png")
        
        body_text = await page.evaluate("() => document.body.innerText")
        print("\n--- LESSON PORTAL CURRENT TEXT ---")
        print(body_text[:1200])
        print("----------------------------------\n")
        
        if lesson_api_data:
            print("API Lesson Instance 1 status:")
            print(json.dumps(lesson_api_data[0][0], indent=2))
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
