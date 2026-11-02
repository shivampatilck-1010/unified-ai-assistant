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
        
        # Dismiss modals
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Got it!' || txt === 'Skip for now') b.click();
            });
        }""")
        await page.wait_for_timeout(1000)
        
        # Inspect button attributes
        btn_state = await page.evaluate("""() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("finished reading"));
            return btn ? {
                text: btn.innerText.trim(),
                disabled: btn.disabled,
                className: btn.className,
                attributes: Array.from(btn.attributes).map(a => `${a.name}="${a.value}"`)
            } : null;
        }""")
        print("Initial Button State:", json.dumps(btn_state, indent=2))
        
        # Scroll everything to bottom (window and all overflow containers)
        print("\nScrolling all containers and window to bottom...")
        scroll_info = await page.evaluate("""() => {
            window.scrollTo(0, document.body.scrollHeight);
            const scrollables = [];
            const all = document.querySelectorAll('*');
            for (const el of all) {
                if (el.scrollHeight > el.clientHeight + 10) {
                    el.scrollTop = el.scrollHeight;
                    scrollables.push({
                        tag: el.tagName,
                        className: el.className,
                        scrollHeight: el.scrollHeight,
                        clientHeight: el.clientHeight
                    });
                }
            }
            return scrollables;
        }""")
        print(f"Scrolled {len(scroll_info)} scrollable elements.")
        
        # Wait a few seconds to simulate reading / check if button becomes enabled
        for i in range(1, 6):
            await page.wait_for_timeout(2000)
            btn_state = await page.evaluate("""() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes("finished reading"));
                return btn ? { disabled: btn.disabled } : null;
            }""")
            print(f"Wait {i*2}s: Button disabled = {btn_state['disabled'] if btn_state else 'None'}")
            if btn_state and not btn_state['disabled']:
                print("BUTTON BECAME ENABLED!")
                break
                
        # What if videoPending=1 prevents it? Notice in URL: &videoPending=1
        # Let's inspect URL params and what happens if video is watched first
        print("\nURL in address bar:", page.url)
        
        # Take screenshot of bottom of page
        await page.screenshot(path="scratch/reading_scrolled.png")
        print("Saved scratch/reading_scrolled.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
