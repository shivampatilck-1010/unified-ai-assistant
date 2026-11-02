import asyncio
import os
import sys
import json
from playwright.async_api import async_playwright

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

ANSWERS = [
    (
        "Background:\n"
        "Our research team recently examined the commercial turnaround of Apex Global Logistics following its comprehensive restructuring initiative.\n\n"
        "Analysis:\n"
        "The organization's resurgence was anchored primarily in operational streamlining and rapid technological modernization, as evidenced by a forty percent surge in quarterly fulfillment rates. Notably, management prioritized predictive supply-chain analytics to eliminate freight bottlenecks; by contrast, traditional regional competitors continued to rely on fragmented manual scheduling, causing severe order latency. To gain a deeper strategic perspective, an additional angle worth exploring is the long-term impact of vendor diversification on operational resilience.\n\n"
        "Reflection:\n"
        "In conclusion, sustainable turnaround success hinges not merely on cost reduction, but on embedding agile digital infrastructure that continually safeguards margins against macroeconomic shocks."
    ),
    (
        "Background:\n"
        "This case evaluation reviews the operational trajectory of NexaCorp Enterprise during its rapid transition toward cloud infrastructure delivery.\n\n"
        "Analysis:\n"
        "The primary drivers underpinning the firm's commercial success were relentless customer-centric engineering and disciplined capital allocation, as evidenced by an annualized customer retention rate exceeding ninety-five percent. Notably, their automated onboarding workflow significantly accelerated time-to-value for enterprise accounts; by contrast, legacy industry incumbents struggled with protracted implementation cycles. Nevertheless, as the firm scales further into disparate global jurisdictions, maintaining cross-border regulatory compliance and strict data sovereignty will present a formidable operational challenge.\n\n"
        "Reflection:\n"
        "In summary, hyper-growth demands proactive governance structures so that organizational velocity does not outpace compliance capabilities during multinational expansion."
    ),
    (
        "Background:\n"
        "This training module examines the strategic growth trajectory of Sterling Dynamics from an early-stage startup into an established market leader.\n\n"
        "Analysis:\n"
        "The core strategies responsible for this expansion involved continuous talent development and aggressive digital automation, as evidenced by sustained double-digit revenue gains across consecutive quarters. Notably, leadership cultivated a cross-functional problem-solving culture that drastically shortened product iteration cycles; by contrast, less competitive market participants retained rigid organizational silos that stifled front-line innovation. Consequently, a vital takeaway for new team members is that scalable business execution requires proactive knowledge sharing rather than passive compliance.\n\n"
        "Reflection:\n"
        "Ultimately, an enterprise's enduring competitive advantage is determined not by initial product features, but by its cultural agility and systemic commitment to lifelong workforce learning."
    )
]

async def dismiss_modals(page):
    await page.evaluate("""() => {
        Array.from(document.querySelectorAll('button')).forEach(b => {
            const txt = b.innerText.trim();
            if (txt === 'Got it!' || txt === 'Skip for now') {
                try { b.click(); } catch(e) {}
            }
        });
    }""")

async def main():
    with open("scratch/bet_active_token.txt", "r", encoding="utf-8") as f:
        jwt_token = f.read().strip()
        
    url = "https://corporate.bharatenglish.org/#/practice/exam/8149617?title=Practice&adaptiveFlow=1&returnUrl=/adaptive-learning/skill/Writing"
    print(f"Launching autonomous exam solver for:\n{url}")
    
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
        
        # Track submission APIs
        api_events = []
        async def on_response(res):
            if "api" in res.url:
                try:
                    data = await res.json()
                    api_events.append({"url": res.url, "status": res.status, "data": data})
                except Exception:
                    api_events.append({"url": res.url, "status": res.status})
        page.on("response", on_response)
        
        await page.goto(url, wait_until="commit", timeout=30000)
        await page.wait_for_timeout(4000)
        await dismiss_modals(page)
        await page.wait_for_timeout(1000)
        
        for q_idx in range(3):
            print(f"\n==========================================")
            print(f"PROCESSING QUESTION {q_idx + 1} OF 3")
            print(f"==========================================")
            
            await dismiss_modals(page)
            
            # Wait for textarea
            textarea = page.locator("textarea.cdk-textarea-autosize, textarea").first
            await textarea.wait_for(state="visible", timeout=15000)
            
            # Clear and fill answer
            answer_text = ANSWERS[q_idx]
            await textarea.fill(answer_text)
            print(f"Filled answer ({len(answer_text.split())} words).")
            await page.wait_for_timeout(1500)
            
            # Take screenshot before submit
            screen_before = f"scratch/q{q_idx + 1}_answered.png"
            await page.screenshot(path=screen_before)
            print(f"Saved {screen_before}")
            
            # Click Continue / Submit button
            continue_btn = page.locator('button:has-text("Continue"), button:has-text("Submit")').first
            btn_text = await continue_btn.inner_text()
            print(f"Clicking action button: '{btn_text}'...")
            await continue_btn.click()
            
            # Wait for evaluation response / animation
            await page.wait_for_timeout(6000)
            await dismiss_modals(page)
            
            screen_after = f"scratch/q{q_idx + 1}_submitted.png"
            await page.screenshot(path=screen_after)
            print(f"Saved {screen_after}")
            
            # Check what's displayed after submitting
            body_text = await page.evaluate("() => document.body.innerText")
            print(f"Post-submission snippet:\n{body_text[:600]}")
            
            # If there's an intermediate "Next Question" or "Continue" feedback button, click it
            next_btn = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Next Question")')
            btn_count = await next_btn.count()
            if btn_count > 0 and q_idx < 2:
                # Check if this button is for proceeding
                first_text = await next_btn.first.inner_text()
                print(f"Found progression button '{first_text}'. Clicking to proceed to next question...")
                await next_btn.first.click()
                await page.wait_for_timeout(3000)
                await dismiss_modals(page)

        print("\n==========================================")
        print("ALL 3 QUESTIONS SUBMITTED! CHECKING COMPLETION")
        print("==========================================")
        await page.wait_for_timeout(5000)
        await dismiss_modals(page)
        
        # Save final screen
        await page.screenshot(path="scratch/final_completion_screen.png", full_page=False)
        print("Saved scratch/final_completion_screen.png")
        
        full_final_text = await page.evaluate("() => document.body.innerText")
        print(f"\nFINAL PAGE BODY TEXT:\n{full_final_text}")
        
        with open("scratch/completion_api_events.json", "w", encoding="utf-8") as f:
            json.dump(api_events, f, indent=2, default=str)
        print("Saved scratch/completion_api_events.json")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
