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
    print(f"Navigating to active lesson...")
    
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
        await page.wait_for_timeout(4000)
        
        title = await page.title()
        cur_url = page.url
        body_text = await page.evaluate("() => document.body.innerText")
        print(f"URL: {cur_url}")
        print(f"Title: {title}")
        print(f"Body text total length: {len(body_text)}")
        print("\n=== FULL BODY TEXT ===\n")
        print(body_text)
        print("\n======================\n")
        
        os.makedirs("scratch", exist_ok=True)
        await page.screenshot(path="scratch/real_lesson_view.png", full_page=False)
        print("Saved scratch/real_lesson_view.png")
        
        # Extract structured activity metadata
        dom_dump = await page.evaluate("""() => {
            const getTexts = sel => Array.from(document.querySelectorAll(sel)).map(e => e.innerText?.trim()).filter(Boolean);
            return {
                headings: getTexts('h1, h2, h3, h4, h5, .title, .lesson-title, .activity-name'),
                buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map(b => ({
                    text: b.innerText?.trim() || '',
                    className: b.className || '',
                    disabled: b.disabled || false,
                    tag: b.tagName.toLowerCase()
                })).filter(b => b.text.length > 0),
                activities: getTexts('.activity-card, .activity-item, .lesson-item, .step-item'),
                progress: getTexts('.progress, .progress-bar, .score, .percentage, .badge'),
                options: getTexts('.option, .choice, .radio-label, .quiz-option, label'),
                inputs: Array.from(document.querySelectorAll('input, textarea')).map(i => ({
                    type: i.type,
                    value: i.value,
                    placeholder: i.placeholder,
                    name: i.name
                }))
            };
        }""")
        
        with open("scratch/lesson_dom_dump.json", "w", encoding="utf-8") as f:
            json.dump(dom_dump, f, indent=2, ensure_ascii=False)
        print("Saved scratch/lesson_dom_dump.json")
        
        print("\n--- EXTRACTED HEADINGS ---")
        for h in dom_dump["headings"]:
            print(" ", h)
            
        print("\n--- EXTRACTED BUTTONS ---")
        for b in dom_dump["buttons"]:
            print(" ", b)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
