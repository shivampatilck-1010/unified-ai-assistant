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
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(3500)
        
        # Dismiss any modals
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Got it!' || txt === 'Skip for now') b.click();
            });
        }""")
        await page.wait_for_timeout(1000)
        
        # Check the cards on screen
        cards = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('div, button, a'))
                .filter(el => {
                    const t = el.innerText?.trim() || '';
                    return (t.includes('To unlock Practice') || t.includes('Video') || t.includes('Learn') || t.includes('Practice'))
                        && el.children.length <= 4 && t.length < 150;
                })
                .map(el => el.innerText.trim());
        }""")
        print("Updated Card States:")
        for c in set(cards):
            print(f" - {repr(c)}")
            
        await page.screenshot(path="scratch/lesson_progress_after_reading.png")
        print("Saved scratch/lesson_progress_after_reading.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
