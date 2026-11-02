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
        
        # Track all network requests to understand API triggers
        page.on("request", lambda r: print(f"REQ: {r.method} {r.url}") if "api" in r.url else None)
        page.on("response", lambda r: print(f"RES: {r.status} {r.url}") if "api" in r.url else None)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(3500)
        
        # Safely dismiss modals
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Skip for now' || txt === 'Got it!') b.click();
            });
        }""")
        await page.wait_for_timeout(2000)
        
        # Inspect the exact selector for Video and Learn cards
        items = await page.evaluate("""() => {
            const results = [];
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                const t = el.innerText?.trim() || '';
                if ((t === 'Video\\nTo do' || t === 'Learn\\nTo do') && el.children.length > 0) {
                    results.push({
                        text: t,
                        tag: el.tagName,
                        className: el.className,
                        id: el.id,
                        onclick: el.getAttribute('onclick'),
                        cursor: window.getComputedStyle(el).cursor
                    });
                }
            }
            return results;
        }""")
        print("Detected exact targets:", json.dumps(items, indent=2))
        
        # Let's click Video card first
        print("\n--- Clicking Video Card ---")
        clicked_video = await page.evaluate("""() => {
            const divs = Array.from(document.querySelectorAll('div, button, a'));
            const target = divs.find(d => d.innerText && d.innerText.trim() === 'Video\\nTo do');
            if (target) {
                target.click();
                return true;
            }
            return false;
        }""")
        print(f"Clicked Video card via evaluate: {clicked_video}")
        await page.wait_for_timeout(4000)
        
        await page.screenshot(path="scratch/after_video_click.png")
        print(f"URL after video click: {page.url}")
        
        # Inspect state after video click
        body_snippet = await page.evaluate("() => document.body.innerText.slice(0, 1500)")
        print("\nPage text snippet after video click:\n", body_snippet)
        
        # Check if video tag exists or modal opened
        video_info = await page.evaluate("""() => {
            const v = document.querySelector('video');
            const btns = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()).filter(Boolean);
            return {
                has_video_tag: !!v,
                video_src: v ? v.src : null,
                buttons_on_screen: btns
            };
        }""")
        print("\nVideo player info:", json.dumps(video_info, indent=2))
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
