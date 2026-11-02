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
        
    url = "https://corporate.bharatenglish.org/#/practice/exams/8149617?adaptiveFlow=1&lessonName=01.%20Developing%20a%20Comprehensive%20Case%20Study%20on%20a%20Business%20Turnaround&practiceUrl=practice%2Fexam%2F8149617%3Ftitle%3DPractice%26adaptiveFlow%3D1%26returnUrl%3D%252Fadaptive-learning%252Fskill%252FWriting&videoPending=1"
    
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
        
        # Scroll to bottom
        await page.evaluate("""() => {
            window.scrollTo(0, document.body.scrollHeight);
            const all = document.querySelectorAll('*');
            for (const el of all) {
                if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = el.scrollHeight;
            }
        }""")
        await page.wait_for_timeout(2000)
        
        btn_details = await page.evaluate("""() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("finished reading"));
            if (!btn) return null;
            return {
                html: btn.outerHTML,
                disabled: btn.disabled,
                parentHTML: btn.parentElement ? btn.parentElement.outerHTML : null
            };
        }""")
        print("Button details:\n", json.dumps(btn_details, indent=2))
        
        # Also check what happens when user navigates directly to practice URL:
        # Notice in query param: practiceUrl=practice%2Fexam%2F8149617%3Ftitle%3DPractice%26adaptiveFlow%3D1%26returnUrl%3D%252Fadaptive-learning%252Fskill%252FWriting
        # Unencoded: practice/exam/8149617?title=Practice&adaptiveFlow=1&returnUrl=/adaptive-learning/skill/Writing
        print("\nDirect practice path is:")
        direct_url = "https://corporate.bharatenglish.org/#/practice/exam/8149617?title=Practice&adaptiveFlow=1&returnUrl=/adaptive-learning/skill/Writing"
        print(direct_url)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
