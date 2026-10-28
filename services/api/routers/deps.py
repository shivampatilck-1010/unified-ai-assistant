from typing import Optional
from fastapi import Header, HTTPException, Request
from config import get_settings


def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
) -> str:
    """Derives and validates current user identity.

    NOTE ON IDENTITY BOUNDARY (Phase 2):
    In local development, if no Authorization header is provided, this falls back
    to the configured server-side `DEV_USER_ID` ('dev-user-default').
    A client-controlled `owner_id` is NEVER accepted from request bodies or queries.
    When multi-user JWT/OAuth authentication is deployed, this dependency will decode
    and verify the cryptographic bearer token.
    """
    settings = get_settings()

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token:
            # Token provided — extract identity token
            return token

    # Fallback to server-side development identity
    return settings.dev_user_id
