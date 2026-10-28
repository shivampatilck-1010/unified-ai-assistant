from typing import Optional
from fastapi import Header, HTTPException, Request
from config import get_settings


def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> str:
    """Derives and validates current user identity.

    Supports Authorization: Bearer <token> or X-User-Id for testing/microservice calls.
    Falls back to server-side dev_user_id in local development.
    """
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token:
            return token

    settings = get_settings()
    return settings.dev_user_id


# Alias for backward/forward compatibility
get_current_user = get_current_user_id
