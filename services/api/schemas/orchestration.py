from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    PLANNING = "planning"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    WAITING_FOR_INPUT = "waiting_for_input"
    WAITING_FOR_CONFIRMATION = "waiting_for_confirmation"
    PARTIALLY_COMPLETED = "partially_completed"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkflowStepStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    WAITING_FOR_CONFIRMATION = "waiting_for_confirmation"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class CapabilityType(str, Enum):
    KNOWLEDGE_SEARCH = "knowledge_search"
    WEB_RESEARCH = "web_research"
    BROWSER_ACTION = "browser_action"
    TASK_CREATE = "task_create"
    TASK_UPDATE = "task_update"
    CALENDAR_EVENT_CREATE = "calendar_event_create"
    REMINDER_CREATE = "reminder_create"
    WIFI_SENSING_QUERY = "wifi_sensing_query"
    GENERAL_SYNTHESIS = "general_synthesis"


CONSEQUENTIAL_CAPABILITIES = {
    CapabilityType.TASK_CREATE.value,
    CapabilityType.TASK_UPDATE.value,
    CapabilityType.CALENDAR_EVENT_CREATE.value,
    CapabilityType.REMINDER_CREATE.value,
    CapabilityType.BROWSER_ACTION.value,
}

SAFE_READ_CAPABILITIES = {
    CapabilityType.KNOWLEDGE_SEARCH.value,
    CapabilityType.WEB_RESEARCH.value,
    CapabilityType.WIFI_SENSING_QUERY.value,
    CapabilityType.GENERAL_SYNTHESIS.value,
}


class CapabilityDefinitionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    identifier: str
    name: str
    description: str
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    required_permissions: List[str]
    risk_level: str
    requires_confirmation: bool


class WorkflowStepCreate(BaseModel):
    step_number: int = Field(ge=1, description="1-based chronological step sequence number")
    title: str = Field(min_length=1, max_length=255, description="Clear description of what this step does")
    capability: CapabilityType = Field(description="Strict capability allowlist identifier")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Typed parameters for the capability")
    depends_on: List[int] = Field(default_factory=list, description="Step numbers that must complete before this step can run")
    is_consequential: bool = Field(default=False, description="Whether this step mutates state or has external consequences")
    consequential_reason: Optional[str] = Field(default=None, description="Explanation of why this action is consequential")
    requires_confirmation: bool = Field(default=False, description="Whether human confirmation is mandated before execution")

    @field_validator("parameters")
    @classmethod
    def validate_step_parameters(cls, v: Dict[str, Any], info) -> Dict[str, Any]:
        capability = info.data.get("capability")
        if capability == CapabilityType.KNOWLEDGE_SEARCH:
            if not v.get("query"):
                raise ValueError("knowledge_search step requires 'query' parameter")
        elif capability == CapabilityType.WEB_RESEARCH:
            if not v.get("question"):
                raise ValueError("web_research step requires 'question' parameter")
        elif capability == CapabilityType.TASK_CREATE:
            if not v.get("title"):
                raise ValueError("task_create step requires 'title' parameter")
        elif capability == CapabilityType.CALENDAR_EVENT_CREATE:
            if not v.get("title") or not v.get("start_time") or not v.get("end_time"):
                raise ValueError("calendar_event_create step requires 'title', 'start_time', and 'end_time'")
        elif capability == CapabilityType.REMINDER_CREATE:
            if not v.get("title") or not v.get("scheduled_time"):
                raise ValueError("reminder_create step requires 'title' and 'scheduled_time'")
        elif capability == CapabilityType.BROWSER_ACTION:
            if not v.get("url"):
                raise ValueError("browser_action step requires 'url' parameter")
        elif capability == CapabilityType.WIFI_SENSING_QUERY:
            if not v.get("room_id") and not v.get("list_all"):
                raise ValueError("wifi_sensing_query step requires 'room_id' or 'list_all=True'")
        return v


class WorkflowPlan(BaseModel):
    summary: str = Field(min_length=1, description="Overview of the orchestrated strategy")
    steps: List[WorkflowStepCreate] = Field(min_length=1, description="Topologically ordered steps")
    estimated_duration_seconds: Optional[int] = Field(default=30)
    consequential_actions_count: int = Field(default=0)


class WorkflowStepResponse(BaseModel):
    id: str
    step_number: int
    title: str
    capability: str
    parameters: Optional[Dict[str, Any]] = None
    depends_on: List[int] = Field(default_factory=list)
    is_consequential: bool
    consequential_reason: Optional[str] = None
    requires_confirmation: bool
    confirmed_by_user: Optional[bool] = None
    status: str
    retry_count: int = 0
    max_retries: int = 2
    output_data: Optional[Dict[str, Any]] = None
    citations: Optional[List[Dict[str, Any]]] = None
    is_simulated: bool = False
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WorkflowCreateRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=4000, description="Natural language request for multi-capability orchestration")
    conversation_id: Optional[str] = Field(default=None, description="Optional conversation context reference")
    auto_approve: bool = Field(default=False, description="Auto-approve non-consequential plan immediately")
    file_ids: Optional[List[str]] = Field(default=None, description="Attached documents for grounding")


class WorkflowApproveRequest(BaseModel):
    approved: bool = Field(default=True, description="Whether to approve or reject plan")
    modified_plan: Optional[WorkflowPlan] = Field(default=None, description="Optional modified plan")
    plan_version: int = Field(default=1, description="Version of the plan being approved to prevent race conditions")


class WorkflowClarifyRequest(BaseModel):
    clarification_response: str = Field(min_length=1, max_length=2000, description="User response to clarification question")


class WorkflowConfirmStepRequest(BaseModel):
    step_number: int = Field(ge=1, description="Step number to confirm or reject")
    approved: bool = Field(default=True, description="Human confirmation verdict")
    reason: Optional[str] = Field(default=None, description="Optional explanation")


class WorkflowCancelRequest(BaseModel):
    reason: Optional[str] = Field(default="Cancelled by user", description="Cancellation reason")


class WorkflowResponse(BaseModel):
    id: str
    owner_id: str
    conversation_id: Optional[str] = None
    title: str
    request_prompt: str
    status: str
    plan_version: int = 1
    plan: Optional[Dict[str, Any]] = None
    context_data: Optional[Dict[str, Any]] = None
    clarification_question: Optional[str] = None
    clarification_response: Optional[str] = None
    pending_confirmation: Optional[Dict[str, Any]] = None
    result_summary: Optional[str] = None
    final_report: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    steps: List[WorkflowStepResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class WorkflowListResponse(BaseModel):
    items: List[WorkflowResponse]
    total: int


class WorkflowEventResponse(BaseModel):
    id: str
    workflow_id: str
    step_id: Optional[str] = None
    event_type: str
    message: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
