from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from routers.deps import get_current_user_id
from schemas.file import (
    ChunkPreview,
    FileDetailResponse,
    FileListResponse,
    FileMetadataResponse,
    FileStatusResponse,
)
from services.file_service import FileService

router = APIRouter(prefix="/api/files", tags=["Files"])


@router.post("/upload", response_model=FileMetadataResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> FileMetadataResponse:
    """Upload a document to private storage, starting the extraction and indexing pipeline."""
    try:
        content = await file.read()
        filename = file.filename or "uploaded_document"
        record = await FileService.upload_file(db, owner_id=user_id, filename=filename, content=content)
        return FileMetadataResponse.model_validate(record)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Upload failed: {str(exc)}")


@router.get("", response_model=FileListResponse)
async def list_files(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by file status"),
    search: Optional[str] = Query(None, description="Search in filename"),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> FileListResponse:
    """List all documents owned by the authenticated identity with storage quota information."""
    settings = get_settings()
    items, total, total_bytes = await FileService.list_files(
        db, owner_id=user_id, status=status_filter, search=search
    )
    return FileListResponse(
        items=[FileMetadataResponse.model_validate(f) for f in items],
        total=total,
        total_storage_bytes=total_bytes,
        max_storage_bytes=settings.max_user_storage_bytes,
        file_count=total,
        max_file_count=settings.max_user_file_count,
    )


@router.get("/{file_id}", response_model=FileDetailResponse)
async def get_file_detail(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> FileDetailResponse:
    """Retrieve detailed file metadata and initial chunk previews."""
    file_rec = await FileService.get_file(db, owner_id=user_id, file_id=file_id)
    if not file_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    chunks = await FileService.get_file_chunks(db, owner_id=user_id, file_id=file_id, limit=10)
    return FileDetailResponse(
        file=FileMetadataResponse.model_validate(file_rec),
        preview_chunks=[ChunkPreview.model_validate(c) for c in chunks],
    )


@router.get("/{file_id}/status", response_model=FileStatusResponse)
async def get_file_status(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> FileStatusResponse:
    """Lightweight polling endpoint to check document indexing status."""
    file_rec = await FileService.get_file(db, owner_id=user_id, file_id=file_id)
    if not file_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileStatusResponse.model_validate(file_rec)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> None:
    """Delete a document and all derived index chunks."""
    deleted = await FileService.delete_file(db, owner_id=user_id, file_id=file_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.post("/{file_id}/reprocess", response_model=FileMetadataResponse)
async def reprocess_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> FileMetadataResponse:
    """Trigger reprocessing and re-indexing of an existing file."""
    reprocessed = await FileService.reprocess_file(db, owner_id=user_id, file_id=file_id)
    if not reprocessed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileMetadataResponse.model_validate(reprocessed)
