import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from services.intelligence import IntelligenceCore
from services.coding_agent import CodingAgent
from services.data_analysis import DataAnalysisEngine
from services.automation_service import AutomationService
from services.model_gateway import get_model_gateway

logger = logging.getLogger("routers.intelligence")
router = APIRouter(prefix="/api/intelligence", tags=["Intelligence"])


class IntelligenceProcessRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    project_id: Optional[str] = None
    file_ids: Optional[List[str]] = None


class CodingInspectRequest(BaseModel):
    workspace_path: Optional[str] = None
    max_files: int = 50


class CodingTestRequest(BaseModel):
    workspace_path: Optional[str] = None
    test_command: Optional[str] = None
    timeout_seconds: int = 30


class DataAnalysisRequest(BaseModel):
    csv_text: str


class AutomationCreateRequest(BaseModel):
    name: str
    task_goal: str
    capability: str = "report"
    schedule_cron: Optional[str] = None
    interval_hours: Optional[int] = 24


@router.post("/process")
async def process_intent(
    req: IntelligenceProcessRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Processes natural language goal through the Unified AI Intelligence Core."""
    core = IntelligenceCore(get_model_gateway())
    result = await core.process(
        db=db,
        user_id=user_id,
        message=req.message,
        conversation_id=req.conversation_id,
        project_id=req.project_id,
        file_ids=req.file_ids,
    )
    return {
        "status": "success",
        "intent": result["classification"].intent.value,
        "confidence": result["classification"].confidence,
        "complexity": result["classification"].complexity,
        "plan": result["plan"].model_dump(),
        "is_conversational_direct": result.get("is_conversational_direct", False),
        "response_markdown": result.get("response_markdown"),
        "verdict": result.get("verdict").model_dump() if result.get("verdict") else None,
    }


@router.get("/capabilities")
async def get_capabilities():
    """Returns active model capabilities and execution engines."""
    core = IntelligenceCore(get_model_gateway())
    caps = core.reasoning_engine.get_model_capabilities()
    return {
        "model_capabilities": caps,
        "engines": [
            "browser_agent",
            "research_synthesizer",
            "coding_sandbox",
            "data_analyzer",
            "file_intelligence",
            "calendar_automation",
            "multi_agent_orchestrator",
        ],
    }


@router.post("/coding/inspect")
async def inspect_code_workspace(req: CodingInspectRequest):
    """Lists files and structure of authorized project workspace."""
    agent = CodingAgent()
    try:
        files = agent.inspect_workspace(req.workspace_path, max_files=req.max_files)
        return {"files": [f.model_dump() for f in files], "total_count": len(files)}
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.post("/coding/test")
async def execute_code_tests(req: CodingTestRequest):
    """Executes test suite in authorized workspace with timeout safeguards."""
    agent = CodingAgent()
    try:
        res = await agent.run_tests(
            workspace_path=req.workspace_path,
            test_command=req.test_command,
            timeout_seconds=req.timeout_seconds,
        )
        return res.model_dump()
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.post("/data-analysis/csv")
async def analyze_csv(req: DataAnalysisRequest):
    """Computes authentic descriptive statistics and distributions on CSV text."""
    res = DataAnalysisEngine.analyze_csv_text(req.csv_text)
    return res.model_dump()


@router.get("/automations")
async def list_automations(user_id: str = Depends(get_current_user_id)):
    """Lists authorized recurring automations for current user."""
    return AutomationService.get_user_automations(user_id)


@router.post("/automations")
async def create_automation(
    req: AutomationCreateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Registers a scheduled background automation."""
    sched = AutomationService.register_automation(
        owner_id=user_id,
        name=req.name,
        task_goal=req.task_goal,
        capability=req.capability,
        schedule_cron=req.schedule_cron,
        interval_hours=req.interval_hours,
    )
    return sched.model_dump()
