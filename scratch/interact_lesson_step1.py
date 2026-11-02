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
    print("Navigating to lesson and interacting...")
    
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
        page.on("response", lambda r: print(f"API: {r.status} {r.url[:80]}") if "api" in r.url and r.status != 200 else None)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(4000)
        
        # 1. Dismiss modal if visible
        skip_btn = page.locator('text="Skip for now"')
        if await skip_btn.count() > 0:
            print("Clicking 'Skip for now' on unlock modal...")
            await skip_btn.first.click()
            await page.wait_for_timeout(1000)
            
        got_it = page.locator('text="Got it!"')
        if await got_it.count() > 0:
            print("Clicking 'Got it!'...")
            await got_it.first.click()
            await page.wait_for_timeout(1000)
            
        await page.screenshot(path="scratch/step1_dismissed.png")
        print("Saved scratch/step1_dismissed.png")
        
        # 2. Look for Video button/card or Learn card in Course 1
        video_btn = page.locator('text="Video"').first
        learn_btn = page.locator('text="Learn"').first
        print(f"Video btn count: {await video_btn.count()}, Learn btn count: {await learn_btn.count()}")
        
        # Inspect what elements are clickable in Course 1
        course1_elements = await page.evaluate("""() => {
            const c1 = document.querySelector('.course-card, .lesson-card, .ng-star-inserted');
            return Array.from(document.querySelectorAll('a, button, [role="button"], .cursor-pointer')).map(el => ({
                text: el.innerText?.trim() || '',
                tag: el.tagName.toLowerCase(),
                className: el.className
            })).filter(x => x.text.includes('Video') || x.text.includes('Learn') || x.text.includes('Practice'));
        }""")
        print("Course 1 matching items:")
        for item in course1_elements:
            print(" ", item)
            
        # Click on Learn to read Learn notes
        print("\nAttempting to click 'Learn'...")
        # Try finding element containing 'Learn'
        learn_target = page.locator('div:has-text("Learn")').filter(has_text="To do").first
        if await learn_target.count() > 0:
            print("Found Learn target! Clicking...")
            await learn_target.click()
        else:
            print("Trying text='Learn'...")
            await page.locator('text="Learn"').first.click()
            
        await page.wait_for_timeout(3000)
        print(f"URL after click: {page.url}")
        print(f"Title: {await page.title()}")
        await page.screenshot(path="scratch/step2_learn_clicked.png")
        print("Saved scratch/step2_learn_clicked.png")
        
        body_after = await page.evaluate("() => document.body.innerText")
        print("Page text snippet after clicking Learn:\n", body_after[:1000])
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
