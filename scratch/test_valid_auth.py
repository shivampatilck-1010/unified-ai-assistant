import asyncio
import os
import re
from playwright.async_api import async_playwright

async def main():
    with open("scratch/bet_shivam_jwt.txt", "r", encoding="utf-8") as f:
        jwt_token = f.read().strip()
        
    print(f"Loaded JWT token length: {len(jwt_token)}")
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    
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
        
        # Inject cleanly via add_init_script using JSON string
        init_js = f"""
            try {{
                localStorage.setItem('BET_AUTH_DATA', {repr(jwt_token)});
                console.log('Successfully injected BET_AUTH_DATA token into localStorage');
            }} catch(e) {{
                console.error('Failed to set localStorage:', e);
            }}
        """
        await context.add_init_script(init_js)
        
        page = await context.new_page()
        page.on("console", lambda m: print(f"CONSOLE: [{m.type}] {m.text}"))
        page.on("pageerror", lambda e: print(f"PAGE ERROR: {e}"))
        page.on("response", lambda r: print(f"RESP: {r.status} {r.url[:70]}") if "api" in r.url or "lesson" in r.url else None)
        
        print("Navigating to lesson URL...")
        await page.goto(url, wait_until="commit", timeout=30000)
        
        for sec in range(12):
            await page.wait_for_timeout(1000)
            cur_url = page.url
            title = await page.title()
            text = await page.evaluate("() => document.body.innerText")
            print(f"[{sec+1}s] URL: {cur_url} | Title: {title} | Text len: {len(text)}")
            if len(text.strip()) > 30 and "login" not in cur_url:
                print("--- ACTIVE LESSON MOUNTED! ---")
                print("Text content preview:\n", text[:1200])
                break
                
        await page.screenshot(path="scratch/authenticated_lesson.png")
        print("Saved scratch/authenticated_lesson.png")
        
        # Inspect lesson exercise elements
        exercise_data = await page.evaluate("""() => {
            return {
                url: window.location.href,
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, .title, .question-text')).map(h => h.innerText.trim()).filter(Boolean),
                buttons: Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean),
                options: Array.from(document.querySelectorAll('.option, .choice, input[type="radio"], [role="radio"]')).map(o => o.innerText?.trim() || o.value).filter(Boolean),
                inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({ type: i.type, placeholder: i.placeholder, value: i.value }))
            };
        }""")
        print("\n--- EXERCISE DATA ---")
        print("Headings:", exercise_data["headings"])
        print("Buttons:", exercise_data["buttons"][:15])
        print("Options:", exercise_data["options"][:15])
        print("Inputs:", exercise_data["inputs"])
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
