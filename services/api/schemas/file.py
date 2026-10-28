from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

FileStatus = Literal["uploaded", "processing", "ready", "failed"]


class FileMetadataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    filename: str
    file_type: str
    mime_type: str
    file_size: int
    content_hash: str
    status: FileStatus
    error_message: Optional[str] = None
    page_count: Optional[int] = None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class FileStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: FileStatus
    chunk_count: int
    error_message: Optional[str] = None
    updated_at: datetime


class FileListResponse(BaseModel):
    items: List[FileMetadataResponse]
    total: int
    total_storage_bytes: int
    max_storage_bytes: int
    file_count: int
    max_file_count: int


class ChunkPreview(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chunk_index: int
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    content: str
    token_count: int


class FileDetailResponse(BaseModel):
    file: FileMetadataResponse
    preview_chunks: List[ChunkPreview]
