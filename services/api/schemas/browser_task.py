from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class BrowserActionType(str, Enum):
    NAVIGATE = "navigate"
    INSPECT = "inspect"
    READ_TEXT = "read_text"
    CLICK = "click"
    DOUBLE_CLICK = "double_click"
    RIGHT_CLICK = "right_click"
    HOVER = "hover"
    TYPE_TEXT = "type_text"
    CLEAR_INPUT = "clear_input"
    SELECT_OPTION = "select_option"
    CHECK_BOX = "check_box"
    UNCHECK_BOX = "uncheck_box"
    PRESS_KEY = "press_key"
    DRAG_AND_DROP = "drag_and_drop"
    SCROLL = "scroll"
    WAIT_FOR = "wait_for"
    SCREENSHOT = "screenshot"
    UPLOAD_FILE = "upload_file"
    DOWNLOAD_FILE = "download_file"
    NEW_TAB = "new_tab"
    SWITCH_TAB = "switch_tab"
    CLOSE_TAB = "close_tab"
    GO_BACK = "go_back"
    GO_FORWARD = "go_forward"
    RELOAD = "reload"
    EXTRACT_TABLE = "extract_table"
    HANDLE_DIALOG = "handle_dialog"
    VISUAL_CLICK = "visual_click"


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
    # Phase 2 autonomous execution events
    CHECKPOINT_CREATED = "browser.checkpoint.created"
    SELF_CORRECTION_TRIGGERED = "browser.self_correction.triggered"
    SELF_CORRECTION_SUCCEEDED = "browser.self_correction.succeeded"
    FILE_DOWNLOADED = "browser.file.downloaded"
    FILE_INSPECTED = "browser.file.inspected"
    AGENT_ASSIGNED = "browser.agent.assigned"
    VERIFICATION_COMPLETED = "browser.verification.completed"


class VerificationStatus(str, Enum):
    COMPLETED = "COMPLETED"
    PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
    FAILED = "FAILED"
    WAITING_FOR_USER = "WAITING_FOR_USER"
    UNVERIFIED = "UNVERIFIED"


class BrowserTaskCheckpoint(BaseModel):
    id: str
    step_index: int
    url: str
    page_title: Optional[str] = None
    dom_summary: Optional[str] = None
    screenshot_thumbnail: Optional[str] = None
    created_at: str


class BrowserTaskStage(BaseModel):
    id: str
    name: str
    description: str
    status: str = "pending"  # pending, in_progress, completed, failed
    subtasks: List[str] = Field(default_factory=list)


class DownloadedFileMetadata(BaseModel):
    id: str
    filename: str
    file_path: str
    file_size_bytes: int
    mime_type: str
    summary: Optional[str] = None
    extracted_text: Optional[str] = None
    created_at: str


class BrowserTaskResumeRequest(BaseModel):
    checkpoint_id: Optional[str] = None
    override_instruction: Optional[str] = None


class BrowserTaskRetryRequest(BaseModel):
    reset_to_checkpoint: bool = True


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
    target_selector: Optional[str] = None  # For drag and drop destination
    file_path: Optional[str] = None  # For upload_file
    tab_index: Optional[int] = None  # For switch_tab / close_tab
    coordinate_x: Optional[float] = None  # For visual_click x
    coordinate_y: Optional[float] = None  # For visual_click y
    dialog_action: Optional[str] = None  # "accept" or "dismiss"
    element_index: Optional[int] = None  # Referencing numbered perception element index


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
    checkpoints: Optional[List[Dict[str, Any]]] = None
    verification_status: Optional[str] = "UNVERIFIED"
    assigned_agent: Optional[str] = "browser_execution_agent"
    stages: Optional[List[Dict[str, Any]]] = None
    downloaded_files: Optional[List[Dict[str, Any]]] = None
    retry_count: Optional[int] = 0
    max_retries: Optional[int] = 3
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
