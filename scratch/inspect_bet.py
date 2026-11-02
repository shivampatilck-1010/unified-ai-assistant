import asyncio
import os
from playwright.async_api import async_playwright

async def inspect():
    url = "https://corporate.bharatenglish.org/#/practice/adaptive/177233/lessons/1362806?sectionId=4&unitId=103"
    print(f"Navigating to: {url}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 UnifiedAIAssistant/1.0"
        )
        page = await context.new_page()
        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            print(f"Goto completed. Status: {resp.status if resp else 'N/A'}")
            print(f"Current URL: {page.url}")
            
            # Wait for SPA hydration
            await page.wait_for_timeout(4000)
            
            print(f"Final URL after hydration: {page.url}")
            title = await page.title()
            print(f"Page title: {title}")
            
            # Check text and selectors
            body_text = await page.text_content("body")
            print(f"Body text preview (first 500 chars):\n{body_text[:500] if body_text else 'EMPTY'}")
            
            os.makedirs("scratch", exist_ok=True)
            await page.screenshot(path="scratch/bet_inspect.png", full_page=False)
            print("Saved screenshot to scratch/bet_inspect.png")
            
            # Look for forms, buttons, inputs
            inputs = await page.query_selector_all("input")
            print(f"Found {len(inputs)} inputs:")
            for i, inp in enumerate(inputs[:5]):
                itype = await inp.get_attribute("type")
                iname = await inp.get_attribute("name")
                iplhd = await inp.get_attribute("placeholder")
                print(f"  Input {i}: type={itype}, name={iname}, placeholder={iplhd}")
                
            buttons = await page.query_selector_all("button")
            print(f"Found {len(buttons)} buttons:")
            for i, btn in enumerate(buttons[:10]):
                btxt = await btn.text_content()
                print(f"  Button {i}: text={btxt.strip() if btxt else 'N/A'}")
                
        except Exception as e:
            print(f"Error during inspection: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(inspect())
