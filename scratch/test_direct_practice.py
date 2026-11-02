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
    print(f"Navigating directly to Practice URL:\n{url}")
    
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
        page.on("request", lambda r: print(f"REQ: {r.method} {r.url[:110]}") if "api" in r.url else None)
        page.on("response", lambda r: print(f"RES: {r.status} {r.url[:110]}") if "api" in r.url else None)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(4500)
        
        # Check title and current URL
        print(f"Loaded URL: {page.url}")
        print(f"Title: {await page.title()}")
        
        # Screenshot
        await page.screenshot(path="scratch/direct_practice_screen.png")
        print("Saved scratch/direct_practice_screen.png")
        
        # Check body text
        body_text = await page.evaluate("() => document.body.innerText")
        print(f"\n--- PAGE BODY TEXT ({len(body_text)} chars) ---")
        print(body_text[:2500])
        print("--- END BODY TEXT ---")
        
        # Extract inputs, questions, options, buttons
        form_elements = await page.evaluate("""() => {
            const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
            const textareas = Array.from(document.querySelectorAll('textarea')).map(t => ({
                placeholder: t.placeholder,
                value: t.value,
                id: t.id,
                className: t.className
            }));
            const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                type: i.type,
                value: i.value,
                placeholder: i.placeholder,
                id: i.id,
                name: i.name,
                checked: i.checked
            }));
            return {
                buttons: btns,
                textareas: textareas,
                inputs: inputs
            };
        }""")
        print("\nForm Elements:\n", json.dumps(form_elements, indent=2))
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
