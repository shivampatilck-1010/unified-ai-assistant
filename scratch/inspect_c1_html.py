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
        
        # Dismiss modals
        await page.evaluate("""() => {
            Array.from(document.querySelectorAll('button')).forEach(b => {
                const txt = b.innerText.trim();
                if (txt === 'Skip for now' || txt === 'Got it!') b.click();
            });
        }""")
        await page.wait_for_timeout(1500)
        
        # Dump full innerHTML of Course 1 card
        c1_html = await page.evaluate("""() => {
            const divs = Array.from(document.querySelectorAll('*'));
            const c1 = divs.find(d => d.innerText && d.innerText.includes('01. Developing a Comprehensive Case Study on a Business Turnaround') && d.innerText.includes('Video') && d.innerText.includes('Learn'));
            return c1 ? c1.outerHTML : 'NOT_FOUND';
        }""")
        
        with open("scratch/course1_card.html", "w", encoding="utf-8") as f:
            f.write(c1_html)
        print(f"Saved Course 1 HTML ({len(c1_html)} bytes) to scratch/course1_card.html")
        
        # Also inspect what APIs BET uses when video / learn / practice is clicked or fetched
        # Let's inspect the API response data for lesson-insts
        insts_data = await page.evaluate(f"""async () => {{
            const token = localStorage.getItem('BET_AUTH_DATA');
            const res = await fetch('https://corporate.bharatenglish.org/api/orgs/lpu724598/users/12523420/bet-section-insts/177233/bet-section-unit-insts/1362806/bet-section-unit-lesson-insts', {{
                headers: {{ 'Authorization': 'Bearer ' + token }}
            }});
            return await res.json();
        }}""")
        
        with open("scratch/lesson_insts_api.json", "w", encoding="utf-8") as f:
            json.dump(insts_data, f, indent=2)
        print("Saved scratch/lesson_insts_api.json")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
