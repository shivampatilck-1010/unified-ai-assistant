import asyncio
import os
import sys
from playwright.async_api import async_playwright

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

async def main():
    with open("scratch/bet_active_token.txt", "r", encoding="utf-8") as f:
        jwt_token = f.read().strip()
        
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print("Navigating to lesson...")
    
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
        
        # Safely dismiss modals via evaluate (no pointer intercept hang)
        dismissed = await page.evaluate("""() => {
            const results = [];
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const b of buttons) {
                const txt = b.innerText.trim();
                if (txt === 'Skip for now' || txt === 'Got it!') {
                    b.click();
                    results.push(txt);
                }
            }
            return results;
        }""")
        print(f"Dismissed modals: {dismissed}")
        await page.wait_for_timeout(2000)
        
        os.makedirs("scratch", exist_ok=True)
        await page.screenshot(path="scratch/after_dismiss.png", full_page=False)
        print("Saved scratch/after_dismiss.png")
        
        # Now find the lessons / cards on screen
        cards = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('div, button, a'))
                .filter(el => {
                    const t = el.innerText?.trim() || '';
                    return (t.includes('01. Developing a Comprehensive Case Study') || t.includes('Video') || t.includes('Learn') || t.includes('Practice'))
                        && el.children.length <= 4 && t.length < 150;
                })
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    text: el.innerText.trim(),
                    classes: el.className
                }));
        }""")
        print(f"\nFound {len(cards)} card elements:")
        for c in cards[:25]:
            print(f" - [{c['tag']}] {repr(c['text'])}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
