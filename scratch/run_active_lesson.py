import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    with open("scratch/bet_active_token.txt", "r", encoding="utf-8") as f:
        jwt_token = f.read().strip()
        
    print(f"Loaded Active JWT token (iat 1793613267) length: {len(jwt_token)}")
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
        
        # Inject token into localStorage
        await context.add_init_script(f"""
            localStorage.setItem('BET_AUTH_DATA', {repr(jwt_token)});
        """)
        
        page = await context.new_page()
        page.on("console", lambda m: print(f"CONSOLE: [{m.type}] {m.text}"))
        page.on("pageerror", lambda e: print(f"PAGE ERROR: {e}"))
        page.on("response", lambda r: print(f"RESP: {r.status} {r.url[:80]}") if "api" in r.url else None)
        
        print(f"Navigating to: {url}")
        await page.goto(url, wait_until="commit", timeout=30000)
        
        for sec in range(15):
            await page.wait_for_timeout(1000)
            cur_url = page.url
            title = await page.title()
            text = await page.evaluate("() => document.body.innerText")
            print(f"[{sec+1}s] URL: {cur_url} | Title: {title} | Text len: {len(text)}")
            if "login" not in cur_url and len(text.strip()) > 30:
                print("\n===============================")
                print(">>> LESSON CONTENT ACTIVE! <<<")
                print("===============================")
                print("Text Preview:\n", text[:1500])
                break
                
        await page.screenshot(path="scratch/active_lesson_screen.png", full_page=False)
        print("Saved scratch/active_lesson_screen.png")
        
        # Extract full exercise structure
        res = await page.evaluate("""() => {
            return {
                url: window.location.href,
                bodyText: document.body.innerText,
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, .title, .question-text, .activity-title')).map(h => h.innerText.trim()).filter(Boolean),
                buttons: Array.from(document.querySelectorAll('button')).map(b => ({
                    text: b.innerText.trim(),
                    disabled: b.disabled,
                    className: b.className
                })).filter(b => b.text.length > 0),
                options: Array.from(document.querySelectorAll('.option, .choice, .answer-choice, input[type=\"radio\"], [role=\"radio\"], .mcq-option')).map(o => ({
                    text: o.innerText?.trim() || o.value,
                    className: o.className
                })),
                inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({
                    type: i.type,
                    placeholder: i.placeholder,
                    value: i.value,
                    name: i.name
                }))
            };
        }""")
        
        print("\nHeadings:", res["headings"])
        print("\nButtons:", res["buttons"])
        print("\nOptions count:", len(res["options"]))
        for opt in res["options"][:10]:
            print("  Option:", opt)
        print("\nInputs:", res["inputs"])
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
