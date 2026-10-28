import logging
from typing import Optional
from fastapi import Header, HTTPException, status

from auth import (
    AuthenticationError,
    InvalidClaimsError,
    InvalidSignatureError,
    TokenExpiredError,
    decode_and_validate_token,
)
from config import get_settings

logger = logging.getLogger(__name__)


def get_current_user_id(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> str:
    """Derives, validates, and authenticates user identity.

    Security & Hardening Rules (Phase 8):
    1. In production (or when allow_dev_auth=False):
       - Never accepts arbitrary unverified bearer tokens or spoofed X-User-Id.
       - Fails closed with 401 Unauthorized if Authorization header is missing, malformed, or untrusted.
       - Cryptographically validates JWT signature, expiration, issuer, and audience using server secret.
    2. In development or test environments (allow_dev_auth=True):
       - If Authorization Bearer is provided and jwt_secret_key is set, verifies it; if valid, extracts subject.
       - If X-User-Id header is explicitly provided, accepts it for deterministic testing.
       - If no credentials are provided, falls back to settings.dev_user_id.
    """
    settings = get_settings()

    # 1. Bearer Token Verification
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Empty Bearer token provided.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # If a JWT secret key is configured, cryptographically validate the token
        if settings.jwt_secret_key:
            try:
                token_data = decode_and_validate_token(
                    token=token,
                    secret_key=settings.jwt_secret_key,
                    expected_issuer=settings.jwt_issuer,
                    expected_audience=settings.jwt_audience,
                )
                return token_data.user_id
            except TokenExpiredError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication token has expired.",
                    headers={"WWW-Authenticate": 'Bearer error="invalid_token", error_description="token expired"'},
                )
            except (InvalidSignatureError, InvalidClaimsError, AuthenticationError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Authentication token validation failed: {str(exc)}",
                    headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
                )
        else:
            # No JWT secret configured on server
            if not settings.allow_dev_auth:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Server is configured for secure authentication but JWT_SECRET_KEY is missing.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            # In dev-only mode without JWT key, token string is permitted as mock user id
            return token

    # 2. Production or strict mode: fail closed if no valid bearer token was provided
    if not settings.allow_dev_auth or settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Development/Test mode allowances
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()

    return settings.dev_user_id


get_current_user = get_current_user_id
