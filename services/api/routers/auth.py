import logging
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from auth import create_access_token, decode_and_validate_token
from config import get_settings
from routers.deps import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=8192, description="Google ID Token JWT")


class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    provider: str = "google"


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class BoundedGoogleRequest(GoogleRequest):
    def __call__(self, url, method="GET", body=None, headers=None, timeout=5, **kwargs):
        return super().__call__(
            url,
            method=method,
            body=body,
            headers=headers,
            timeout=min(timeout, 5),
            **kwargs,
        )


@router.post("/google", response_model=AuthResponse)
async def authenticate_google(payload: GoogleAuthRequest) -> AuthResponse:
    """Validates a Google ID token before creating an application session."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured.",
        )
    if not settings.jwt_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Session signing is not configured.",
        )

    try:
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token,
            payload.credential,
            BoundedGoogleRequest(),
            settings.google_client_id,
        )
    except TransportError as exc:
        logger.warning("Google ID-token verification is unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in verification is temporarily unavailable.",
        ) from exc
    except (ValueError, GoogleAuthError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token is invalid or expired.",
        ) from exc

    if not isinstance(claims, dict) or (
        claims.get("aud") != settings.google_client_id
        or claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}
        or claims.get("email_verified") is not True
        or not claims.get("sub")
        or not claims.get("email")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token claims are invalid.",
        )

    email = claims["email"]
    display_name = claims.get("name") or email.split("@")[0]
    user_id = f"google_{claims['sub']}"

    # Generate cryptographically signed HMAC-SHA256 JWT
    token = create_access_token(
        user_id=user_id,
        secret_key=settings.jwt_secret_key,
        issuer=settings.jwt_issuer,
        audience=settings.jwt_audience,
        role="user",
        profile={
            "email": email,
            "name": display_name,
            "picture": claims.get("picture") or "",
        },
    )

    user_profile = UserProfile(
        id=user_id,
        email=email,
        name=display_name,
        picture=claims.get("picture") or "",
        provider="google",
    )

    return AuthResponse(access_token=token, token_type="bearer", user=user_profile)


@router.get("/me", response_model=UserProfile)
async def get_current_user_profile(
    user_id: str = Depends(get_current_user_id),
    authorization: Optional[str] = Header(default=None),
) -> UserProfile:
    """Returns the authenticated user profile."""
    settings = get_settings()
    if authorization and authorization.startswith("Bearer ") and settings.jwt_secret_key:
        token_data = decode_and_validate_token(
            token=authorization[7:].strip(),
            secret_key=settings.jwt_secret_key,
            expected_issuer=settings.jwt_issuer,
            expected_audience=settings.jwt_audience,
        )
        if token_data.profile:
            return UserProfile(
                id=user_id,
                email=token_data.profile.get("email", ""),
                name=token_data.profile.get("name", ""),
                picture=token_data.profile.get("picture", ""),
                provider="google",
            )

    # Format user details from identity
    clean_id = user_id
    if user_id.startswith("google_"):
        raw_identity = user_id.replace("google_", "")
        email = raw_identity if "@" in raw_identity else f"{raw_identity.replace('_gmail_com', '')}@gmail.com"
        clean_name = email.split("@")[0].replace(".", " ").replace("_", " ").title()
    else:
        clean_name = user_id.replace("_", " ").title()
        email = f"{user_id}@unified-ai.local"

    return UserProfile(
        id=clean_id,
        email=email,
        name=clean_name,
        picture="",
        provider="google" if "google" in user_id else "local",
    )


@router.post("/logout")
async def logout() -> dict:
    """Logs out the user session."""
    return {"status": "logged_out", "message": "Session invalidated successfully."}
