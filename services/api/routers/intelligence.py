import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import get_settings
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
    max_files: int = Field(default=100, ge=1, le=500)


class CodingReadRequest(BaseModel):
    file_path: str = Field(min_length=1, max_length=512)
    max_lines: int = Field(default=500, ge=1, le=5000)


class CodingModifyRequest(BaseModel):
    file_path: str = Field(min_length=1, max_length=512)
    new_content: str = Field(max_length=1_000_000)
    expected_sha256: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class CodingPreviewRequest(BaseModel):
    file_path: str = Field(min_length=1, max_length=512)
    new_content: str = Field(max_length=1_000_000)


class CodingTestRequest(BaseModel):
    test_target: Optional[str] = Field(default=None, max_length=256)
    timeout_seconds: int = Field(default=30, ge=1, le=120)


class DataAnalysisRequest(BaseModel):
    csv_text: str


class AutomationCreateRequest(BaseModel):
    name: str
    task_goal: str
    capability: str = "report"
    schedule_cron: Optional[str] = None
    interval_hours: Optional[int] = 24


def _coding_agent_for_user(user_id: str) -> CodingAgent:
    return CodingAgent.for_user(user_id, get_settings().coding_workspace_root)


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
async def inspect_code_workspace(
    req: CodingInspectRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Lists files in the authenticated user's private coding workspace."""
    agent = _coding_agent_for_user(user_id)
    try:
        files = agent.inspect_workspace(max_files=req.max_files)
        return {
            "files": [f.model_dump() for f in files],
            "total_count": len(files),
            "tests_enabled": get_settings().enable_coding_tests,
        }
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))


@router.post("/coding/read")
async def read_code_file(
    req: CodingReadRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Reads a file inside the authenticated user's private coding workspace."""
    agent = _coding_agent_for_user(user_id)
    try:
        content = agent.read_source_file(req.file_path, max_lines=req.max_lines)
        return {"file_path": req.file_path, "content": content}
    except FileNotFoundError as fe:
        raise HTTPException(status_code=404, detail=str(fe))
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except (UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/coding/preview")
async def preview_code_modification(
    req: CodingPreviewRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Returns a diff for explicit review before any workspace file is changed."""
    agent = _coding_agent_for_user(user_id)
    try:
        return agent.preview_modification(req.file_path, req.new_content).model_dump()
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except (IsADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/coding/modify")
async def modify_code_file(
    req: CodingModifyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Applies a reviewed edit only if the source still matches its preview."""
    agent = _coding_agent_for_user(user_id)
    try:
        result = agent.apply_modification(
            req.file_path,
            req.new_content,
            expected_sha256=req.expected_sha256,
        )
        return result.model_dump()
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except (IsADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/coding/test")
async def execute_code_tests(
    req: CodingTestRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Runs pytest by argument vector inside the authenticated user's workspace."""
    if not get_settings().enable_coding_tests:
        raise HTTPException(
            status_code=503,
            detail="Code execution is disabled. Enable only for trusted users; this runner is not an OS-level sandbox.",
        )
    agent = _coding_agent_for_user(user_id)
    try:
        res = await agent.run_tests(
            test_target=req.test_target,
            timeout_seconds=req.timeout_seconds,
        )
        return res.model_dump()
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


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
