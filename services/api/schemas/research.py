from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

ResearchStatus = Literal[
    "draft",
    "planning",
    "awaiting_approval",
    "running",
    "synthesizing",
    "completed",
    "failed",
    "cancelled",
]

ResearchDepth = Literal["quick", "standard", "deep"]


class ResearchStep(BaseModel):
    step_number: int
    action: str = Field(..., description="'search', 'browse', 'compare_documents', or 'synthesize'")
    query_or_target: str
    rationale: str


class ResearchPlan(BaseModel):
    rationale: str
    steps: List[ResearchStep]
    target_domains: List[str] = Field(default_factory=list)
    estimated_sources: int = 5
    requires_approval: bool = False


class ResearchCitation(BaseModel):
    citation_type: Literal["web", "document"]
    citation_tag: str
    source_id: Optional[str] = None
    url_or_filename: str
    title: str
    page_number: Optional[int] = None
    snippet: str


class ResearchReport(BaseModel):
    title: str
    executive_summary: str
    key_findings: List[str]
    evidence_and_analysis: str
    conflicting_claims: List[str] = Field(default_factory=list)
    limitations_and_unresolved: List[str] = Field(default_factory=list)
    citations: List[ResearchCitation] = Field(default_factory=list)


class ResearchJobCreate(BaseModel):
    question: str = Field(..., min_length=3, max_length=2000, description="Research objective or question")
    depth: ResearchDepth = "standard"
    allowed_domains: Optional[List[str]] = Field(None, description="Optional domain restriction scope")
    file_ids: Optional[List[str]] = Field(None, description="Optional attached document IDs for comparison")
    max_sources: int = Field(default=5, ge=1, le=20, description="Maximum web sources to discover and crawl")
    requires_approval: Optional[bool] = Field(None, description="Force pause for plan approval before execution")


class ResearchJobCancelRequest(BaseModel):
    reason: Optional[str] = Field("Cancelled by user", description="Reason for cancelling the research job")


class ResearchJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    question: str
    status: ResearchStatus
    depth: str
    allowed_domains: Optional[List[str]] = None
    file_ids: Optional[List[str]] = None
    max_sources: int
    requires_approval: bool
    plan: Optional[Dict[str, Any]] = None
    final_report: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class ResearchSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    owner_id: str
    canonical_url: str
    title: str
    publisher: str
    retrieval_timestamp: datetime
    publication_date: Optional[str] = None
    content_hash: Optional[str] = None
    status: str
    validation_status: str
    snippets: List[str] = Field(default_factory=list)
    created_at: datetime


class ResearchEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    event_type: str
    message: str
    payload: Optional[Dict[str, Any]] = None
    created_at: datetime


class ResearchJobListResponse(BaseModel):
    items: List[ResearchJobResponse]
    total: int


class ResearchJobDetailResponse(BaseModel):
    job: ResearchJobResponse
    sources: List[ResearchSourceResponse]
    events: List[ResearchEventResponse]
