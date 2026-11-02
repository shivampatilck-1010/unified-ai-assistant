from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from schemas.conversation import ConversationSummary


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Project description")
    system_prompt: Optional[str] = Field(default=None, max_length=10000, description="Custom scoped guidance/system instructions")
    icon: Optional[str] = Field(default="folder", max_length=64, description="Icon key")
    color: Optional[str] = Field(default="#6366f1", max_length=32, description="Theme accent color")
    pinned_file_ids: Optional[List[str]] = Field(default_factory=list, description="List of pinned FileRecord UUIDs")


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(default=None, max_length=2000, description="Project description")
    system_prompt: Optional[str] = Field(default=None, max_length=10000, description="Custom scoped guidance/system instructions")
    icon: Optional[str] = Field(default=None, max_length=64, description="Icon key")
    color: Optional[str] = Field(default=None, max_length=32, description="Theme accent color")
    pinned_file_ids: Optional[List[str]] = Field(default=None, description="List of pinned FileRecord UUIDs")


class ProjectSummary(BaseModel):
    id: str
    owner_id: str
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    icon: str = "folder"
    color: str = "#6366f1"
    conversation_count: int = 0
    pinned_file_count: int = 0
    pinned_file_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class PinnedFileInfo(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    created_at: datetime


class ProjectDetail(ProjectSummary):
    conversations: List[ConversationSummary] = Field(default_factory=list)
    pinned_files: List[PinnedFileInfo] = Field(default_factory=list)


class ProjectListResponse(BaseModel):
    items: List[ProjectSummary]
    total: int
    limit: int
    offset: int


class PinFileRequest(BaseModel):
    file_id: str = Field(description="UUID of the FileRecord to pin/unpin")
