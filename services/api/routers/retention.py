from typing import Any, Dict
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from routers.deps import get_current_user_id
from services.data_retention_service import DataRetentionService

router = APIRouter(prefix="/api/retention", tags=["Data Retention"])


@router.get("/status")
async def get_retention_status(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """Returns the current data retention policy and user data expiry status."""
    return await DataRetentionService.get_retention_status(db, owner_id=user_id)


@router.post("/cleanup")
async def trigger_retention_cleanup(
    db: AsyncSession = Depends(get_db),
    _user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """Manually triggers background retention cleanup for expired records."""
    return await DataRetentionService.cleanup_expired_data(db)


@router.post("/purge-my-data")
async def purge_all_user_data(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """User-directed permanent deletion of all their stored data across all features."""
    return await DataRetentionService.purge_all_user_data(db, owner_id=user_id)
