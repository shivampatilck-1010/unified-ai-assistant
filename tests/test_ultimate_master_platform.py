import asyncio
import io
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = BASE_DIR / "services" / "api"
WORKER_DIR = BASE_DIR / "services" / "agent-worker"

for p in (str(API_DIR), str(WORKER_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from services.intelligence import (
    IntelligenceCore,
    IntentClassifier,
    AssistantIntent,
    ContextManager,
    ToolSelector,
    TaskPlanner,
    ResultEvaluator,
    VerificationVerdict,
)
from services.coding_agent import CodingAgent
from services.data_analysis import DataAnalysisEngine
from services.automation_service import AutomationService
from services.connectors.base import ConnectorType, PermissionScope
from services.connectors.registry import ConnectorRegistry


# ============================================================================
# 1. INTENT CLASSIFICATION & ROUTING TESTS
# ============================================================================

def test_intent_classification_across_all_real_world_objectives():
    """Verifies that the Intelligence Core correctly classifies natural language goals without manual flags."""
    # Workflow 1: Research
    res_research = IntentClassifier.classify("Research five top universities and compare their computer science admission requirements.")
    assert res_research.intent in (AssistantIntent.RESEARCH, AssistantIntent.MULTI_AGENT_WORKFLOW)
    assert res_research.confidence >= 0.85

    # Workflow 2: Computer Use / Browser
    res_browser = IntentClassifier.classify("Open website https://portal.example.com and complete the registration form.")
    assert res_browser.intent == AssistantIntent.BROWSER_AGENT
    assert res_browser.extracted_entities.get("target_url") == "https://portal.example.com"

    # Workflow 3: Document Intelligence
    res_doc = IntentClassifier.classify("Analyse these documents and extract the important financial metrics.", context={"file_ids": ["f1"]})
    assert res_doc.intent == AssistantIntent.DOCUMENT_INTELLIGENCE

    # Workflow 4: Autonomous Coding
    res_coding = IntentClassifier.classify("Build a full-stack application and test it.")
    assert res_coding.intent == AssistantIntent.AUTONOMOUS_CODING

    # Workflow 5: Multi-Agent Workflow
    res_multi = IntentClassifier.classify("Research these competitors, compare their pricing models, and prepare a presentation report.")
    assert res_multi.intent == AssistantIntent.MULTI_AGENT_WORKFLOW

    # Workflow 6: Scheduled Automation
    res_auto = IntentClassifier.classify("Prepare this summary report every Monday at 9am.")
    assert res_auto.intent == AssistantIntent.CALENDAR_AUTOMATION

    # Conversational direct
    res_chat = IntentClassifier.classify("Can you explain how KaTeX math rendering works in markdown?")
    assert res_chat.intent == AssistantIntent.CONVERSATIONAL


# ============================================================================
# 2. WORKFLOW 1 — ADVANCED RESEARCH WITH CITATIONS
# ============================================================================

def test_research_planning_and_evidence_evaluation():
    """Verifies Workflow 1: Research query planning, multi-source evidence extraction, and citation validation."""
    intent_res = IntentClassifier.classify("Research solid state battery technology and compare energy density across manufacturers.")
    tool_plan = ToolSelector.select_tools(intent_res, context=MagicMock(pinned_file_ids=[]))
    plan = TaskPlanner.generate_plan(intent_res.extracted_entities["raw_prompt"], intent_res, MagicMock(pinned_file_ids=[]), tool_plan)

    assert any(s.capability == "research_synthesizer" for s in plan.steps)
    assert any("Synthesize Comparative Report" in s.title for s in plan.steps)

    # Evaluate research output with authentic citations
    mock_outcome = {
        "capability": "research_synthesizer",
        "result_summary": "Solid-state batteries demonstrate higher theoretical energy densities (up to 500 Wh/kg).",
        "citations": [
            {"title": "Journal of Energy Storage", "url": "https://doi.org/10.1016/sample", "snippet": "Energy density measured at 480 Wh/kg."},
            {"title": "Battery Technology Index", "url": "https://example.org/battery-index", "snippet": "Comparison across five major suppliers."},
        ],
    }
    verdict = ResultEvaluator.evaluate(
        user_goal="Research solid state battery technology",
        execution_outcome=mock_outcome,
        evidence=[{"type": "research_report"}],
    )
    assert verdict.status == "COMPLETED"
    assert verdict.confidence_score >= 0.90
    assert any("citations" in c for c in verdict.verified_criteria)


# ============================================================================
# 3. WORKFLOW 2 — AUTONOMOUS COMPUTER-USE ENGINE
# ============================================================================

def test_browser_computer_use_intent_and_consequential_detection():
    """Verifies Workflow 2: Browser action planning, consequential action gate detection, and verification."""
    # Standard browse: non-consequential
    safe_intent = IntentClassifier.classify("Navigate to https://news.ycombinator.com and extract the top headlines.")
    safe_tools = ToolSelector.select_tools(safe_intent, context=MagicMock(pinned_file_ids=[]))
    assert safe_tools.requires_human_approval is False

    # Consequential transaction: requires confirmation
    conseq_intent = IntentClassifier.classify("Open https://store.example.com and purchase the item and pay now.")
    conseq_tools = ToolSelector.select_tools(conseq_intent, context=MagicMock(pinned_file_ids=[]))
    assert conseq_tools.requires_human_approval is True

    plan = TaskPlanner.generate_plan("Open https://store.example.com and purchase", conseq_intent, MagicMock(pinned_file_ids=[]), conseq_tools)
    assert plan.requires_approval is True
    assert plan.risk_level == "high"


# ============================================================================
# 4. WORKFLOW 3 — DOCUMENT INTELLIGENCE & FILE EXTRACTION
# ============================================================================

def test_document_intelligence_planning_and_grounding():
    """Verifies Workflow 3: Document analysis planning and grounded evidence verification."""
    intent_res = IntentClassifier.classify("Analyse this study material and extract the key exam concepts.", context={"file_ids": ["doc_123"]})
    tool_plan = ToolSelector.select_tools(intent_res, context=MagicMock(pinned_file_ids=["doc_123"], project_guidance=None))
    plan = TaskPlanner.generate_plan("Analyse study material", intent_res, MagicMock(pinned_file_ids=["doc_123"]), tool_plan)

    assert any(s.capability == "file_extractor" for s in plan.steps)

    mock_outcome = {
        "capability": "file_extractor",
        "result_summary": "Extracted key concepts: Quantum entanglement, Superposition.",
        "citations": [
            {"filename": "physics_notes.pdf", "page_number": 4, "snippet": "Entanglement is a physical phenomenon."},
        ],
    }
    verdict = ResultEvaluator.evaluate(
        user_goal="Analyse study material",
        execution_outcome=mock_outcome,
        evidence=[{"type": "document_extraction"}],
    )
    assert verdict.status == "COMPLETED"
    assert any("document" in c for c in verdict.verified_criteria)


# ============================================================================
# 5. WORKFLOW 4 — AUTONOMOUS CODING AGENT
# ============================================================================

@pytest.mark.asyncio
async def test_coding_agent_workspace_inspection_and_test_execution(tmp_path):
    """Verifies Workflow 4: Coding agent workspace inspection, safe modification, and test runner."""
    agent = CodingAgent(default_workspace=str(tmp_path))

    # 1. Create a sample python module and test file
    code_file = tmp_path / "calculator.py"
    code_file.write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")

    test_file = tmp_path / "test_calculator.py"
    test_file.write_text("from calculator import add\n\ndef test_add():\n    assert add(2, 3) == 5\n", encoding="utf-8")

    # 2. Inspect workspace
    files = agent.inspect_workspace()
    assert len(files) >= 2
    rel_paths = [f.relative_path for f in files]
    assert "calculator.py" in rel_paths
    assert "test_calculator.py" in rel_paths

    # 3. Read source file
    src = agent.read_source_file("calculator.py")
    assert "def add(a, b):" in src

    # 4. Modify source file safely
    proposed = "def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b\n"
    preview = agent.preview_modification("calculator.py", proposed)
    assert "subtract" in preview.diff
    mod_res = agent.apply_modification(
        "calculator.py",
        proposed,
        expected_sha256=preview.original_sha256,
    )
    assert mod_res.status == "modified"
    assert mod_res.lines_added >= 1

    # 5. Run test execution in isolated subprocess
    test_res = await agent.run_tests(workspace_path=str(tmp_path), timeout_seconds=10)
    assert test_res.passed is True
    assert test_res.exit_code == 0


# ============================================================================
# 6. WORKFLOW 5 — MULTI-AGENT EXECUTION & ORCHESTRATION
# ============================================================================

def test_multi_agent_workflow_decomposition_and_roles():
    """Verifies Workflow 5: Goal decomposition into Planning, Research, Browser, Reporting, and Verification roles."""
    intent_res = IntentClassifier.classify("Research these five companies, compare their metrics, and prepare a presentation.")
    assert intent_res.intent == AssistantIntent.MULTI_AGENT_WORKFLOW

    tool_plan = ToolSelector.select_tools(intent_res, context=MagicMock(pinned_file_ids=[]))
    plan = TaskPlanner.generate_plan("Research companies and prepare presentation", intent_res, MagicMock(pinned_file_ids=[]), tool_plan)

    assigned_roles = [s.assigned_agent for s in plan.steps]
    assert "planning_agent" in assigned_roles
    assert "research_agent" in assigned_roles
    assert "reporting_agent" in assigned_roles
    assert "verification_agent" in assigned_roles


# ============================================================================
# 7. WORKFLOW 6 — SCHEDULED AUTOMATION
# ============================================================================

def test_scheduled_automation_registration_and_duplicate_prevention():
    """Verifies Workflow 6: Registering recurring automations, duplicate prevention, and execution history."""
    owner = "user_auto_test_99"
    name = "Weekly Engineering Summary"
    goal = "Summarize git commit activity every Monday"

    # 1. Register automation
    sched1 = AutomationService.register_automation(
        owner_id=owner,
        name=name,
        task_goal=goal,
        capability="report",
        schedule_cron="0 9 * * 1",
        interval_hours=168,
    )
    assert sched1.status == "active"
    assert sched1.next_run_at is not None

    # 2. Duplicate registration returns existing active schedule without duplicates
    sched2 = AutomationService.register_automation(
        owner_id=owner,
        name=name,
        task_goal=goal,
        capability="report",
    )
    assert sched2.id == sched1.id

    # 3. Record execution event
    updated = AutomationService.record_execution(
        automation_id=sched1.id,
        status="completed",
        outcome_summary="Generated weekly report with 14 commits analyzed.",
        artifacts=["report_week_44.md"],
    )
    assert updated.last_run_at is not None
    assert len(updated.execution_history) == 1
    assert updated.execution_history[0]["status"] == "completed"

    # 4. Toggle pause / resume
    paused = AutomationService.toggle_status(sched1.id, owner_id=owner, pause=True)
    assert paused.status == "paused"
    resumed = AutomationService.toggle_status(sched1.id, owner_id=owner, pause=False)
    assert resumed.status == "active"


# ============================================================================
# 8. WORKFLOW 7 — PROJECT INTELLIGENCE & SCOPED CONTINUITY
# ============================================================================

@pytest.mark.asyncio
async def test_project_intelligence_context_resolution():
    """Verifies Workflow 7: Scoped project instructions and pinned files are aggregated into context."""
    mock_db = AsyncMock()
    context = await ContextManager.resolve_context(
        db=mock_db,
        user_id="proj_user_1",
        conversation_id=None,
        project_id="proj_alpha",
        explicit_file_ids=["file_guide_1"],
        current_prompt="Continue working on the architecture",
    )
    assert context.user_id == "proj_user_1"
    assert context.project_id == "proj_alpha"
    assert "file_guide_1" in context.pinned_file_ids


# ============================================================================
# 9. DATA ANALYSIS ENGINE (REAL CALCULATIONS)
# ============================================================================

def test_data_analysis_engine_real_mathematical_computations():
    """Verifies authentic mathematical calculation of means, medians, standard deviations, and correlations."""
    csv_data = (
        "month,revenue,expenses,customers\n"
        "Jan,10000,6000,100\n"
        "Feb,12000,6500,120\n"
        "Mar,15000,7000,150\n"
        "Apr,18000,8000,180\n"
    )
    res = DataAnalysisEngine.analyze_csv_text(csv_data)
    assert res.row_count == 4
    assert res.column_count == 4
    assert "revenue" in res.columns

    rev_stat = next(s for s in res.column_statistics if s.name == "revenue")
    assert rev_stat.data_type == "numeric"
    assert rev_stat.mean == 13750.0
    assert rev_stat.min_value == 10000.0
    assert rev_stat.max_value == 18000.0

    # Strong positive correlation between revenue and customers
    assert "revenue" in res.correlations
    assert res.correlations["revenue"]["customers"] >= 0.95
    assert "Statistical Dataset Profile" in res.insights_markdown


# ============================================================================
# 10. CONNECTED SERVICES ARCHITECTURE
# ============================================================================

def test_connected_services_registration_and_revocation():
    """Verifies modular integration architecture with scopes and revocation."""
    owner = "integration_user_55"
    acc = ConnectorRegistry.register_account(
        owner_id=owner,
        connector_type=ConnectorType.CALENDAR,
        service_name="Google Calendar Integration",
        scopes=[PermissionScope.READ, PermissionScope.WRITE],
        masked_identifier="user***@gmail.com",
    )
    assert acc.is_active is True
    assert acc.connector_type == ConnectorType.CALENDAR

    user_accs = ConnectorRegistry.get_user_accounts(owner)
    assert len(user_accs) == 1

    # Revoke account
    revoked = ConnectorRegistry.revoke_account(acc.id, owner)
    assert revoked is True
    active_accs = ConnectorRegistry.get_user_accounts(owner)
    assert len(active_accs) == 0
