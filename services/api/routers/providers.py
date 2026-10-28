from fastapi import APIRouter
from schemas.provider import UnifiedProviderStatusResponse
from services.model_gateway import get_model_gateway

router = APIRouter(prefix="/api/provider", tags=["Provider"])


@router.get("/status", response_model=UnifiedProviderStatusResponse)
def get_provider_status() -> UnifiedProviderStatusResponse:
    """Check configuration status of AI providers and available models."""
    gateway = get_model_gateway()
    status = gateway.get_status()
    # Populate backward-compatible 'provider' field
    status.provider = status.active_provider
    return status
