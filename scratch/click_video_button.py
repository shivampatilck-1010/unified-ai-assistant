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
        page.on("request", lambda r: print(f"REQ: {r.method} {r.url[:100]}") if "api" in r.url or "vimeo" in r.url else None)
        page.on("response", lambda r: print(f"RES: {r.status} {r.url[:100]}") if "api" in r.url or "vimeo" in r.url else None)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(3500)
        
        # Dismiss modals
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Skip for now' || txt === 'Got it!') b.click();
            });
        }""")
        await page.wait_for_timeout(1500)
        
        # Click the Video button using the exact aria-label
        video_btn = page.locator('button[aria-label*="Video, 01."]')
        print(f"Video button count: {await video_btn.count()}")
        if await video_btn.count() > 0:
            print("Clicking Video button...")
            await video_btn.first.click()
            await page.wait_for_timeout(4000)
            
            await page.screenshot(path="scratch/video_dialog.png")
            print("Saved scratch/video_dialog.png")
            
            # Check what's visible on page or dialog
            dialog_info = await page.evaluate("""() => {
                const modal = document.querySelector('dialog[open], .modal, .modal-open, [role="dialog"]');
                const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src);
                const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
                return {
                    has_modal: !!modal,
                    modal_text: modal ? modal.innerText : null,
                    iframes: iframes,
                    buttons: buttons
                };
            }""")
            print("Dialog Info:", json.dumps(dialog_info, indent=2))
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
