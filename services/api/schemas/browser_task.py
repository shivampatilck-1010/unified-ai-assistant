from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class BrowserActionType(str, Enum):
    NAVIGATE = "navigate"
    INSPECT = "inspect"
    READ_TEXT = "read_text"
    CLICK = "click"
    TYPE_TEXT = "type_text"
    SELECT_OPTION = "select_option"
    PRESS_KEY = "press_key"
    SCROLL = "scroll"
    WAIT_FOR = "wait_for"
    SCREENSHOT = "screenshot"


class BrowserTaskStatus(str, Enum):
    PENDING = "pending"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    PAUSED = "paused"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BrowserTaskEventType(str, Enum):
    TASK_STARTED = "task_started"
    PLAN_APPROVED = "plan_approved"
    STEP_STARTED = "step_started"
    STEP_COMPLETED = "step_completed"
    CONFIRMATION_REQUIRED = "confirmation_required"
    RECOVERABLE_ERROR = "recoverable_error"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"
    # Typed live streaming events
    SESSION_CREATED = "browser.session.created"
    NAVIGATION_STARTED = "browser.navigation.started"
    SCREENSHOT_UPDATED = "browser.screenshot.updated"
    ACTION_STARTED = "browser.action.started"
    ACTION_COMPLETED = "browser.action.completed"
    TASK_PROGRESS = "browser.task.progress"
    TASK_PAUSED = "browser.task.paused"
    TASK_RESUMED = "browser.task.resumed"
    SESSION_CLOSED = "browser.session.closed"


class BrowserAction(BaseModel):
    action_type: BrowserActionType
    url: Optional[str] = None
    selector: Optional[str] = None
    text: Optional[str] = None
    key: Optional[str] = None
    value: Optional[str] = None
    direction: Optional[str] = None  # "up", "down", "top", "bottom"
    amount: Optional[int] = None
    condition: Optional[str] = None
    timeout_ms: Optional[int] = None
    is_consequential: bool = False
    consequential_reason: Optional[str] = None


class BrowserPlanStep(BaseModel):
    step_index: int
    description: str
    action: BrowserAction


class BrowserPlan(BaseModel):
    goal: str
    steps: List[BrowserPlanStep]
    estimated_steps: int
    allowed_domains: List[str] = Field(default_factory=list)


class PendingConfirmation(BaseModel):
    confirmation_id: str
    step_index: int
    action_type: str
    target: Optional[str] = None
    data: Optional[str] = None
    reason: str


class BrowserTaskCreateRequest(BaseModel):
    task_description: str = Field(..., min_length=3, max_length=2000)
    initial_url: Optional[str] = None
    allowed_domains: Optional[List[str]] = None


class BrowserTaskApproveRequest(BaseModel):
    approved: bool = True
    modified_plan: Optional[BrowserPlan] = None


class BrowserTaskConfirmationRequest(BaseModel):
    approved: bool
    reason: Optional[str] = None


class BrowserTaskCancelRequest(BaseModel):
    reason: Optional[str] = "User requested cancellation"


class BrowserTaskEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    step_index: Optional[int] = None
    event_type: str
    message: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime


class BrowserTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    task_description: str
    status: str
    current_step: int
    plan: Optional[Dict[str, Any]] = None
    approved_scope: Optional[Dict[str, Any]] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    result_summary: Optional[str] = None
    error_message: Optional[str] = None
    cancellation_reason: Optional[str] = None
    evidence: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class BrowserTaskListResponse(BaseModel):
    items: List[BrowserTaskResponse]
    total: int


class WorkerStatusResponse(BaseModel):
    available: bool
    runtime: str
    active_tasks: int
    browser_session_strategy: str
    message: str
