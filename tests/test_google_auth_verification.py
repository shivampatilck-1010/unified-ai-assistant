import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from auth import decode_and_validate_token
from config import Settings, get_settings
from routers import auth as auth_router


@pytest.mark.asyncio
async def test_google_sign_in_uses_verified_claims_for_identity(monkeypatch):
    settings = get_settings()
    secret = "google-auth-test-secret-with-at-least-32-characters"
    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "jwt_secret_key", secret)
    claims = {
        "aud": settings.google_client_id,
        "iss": "https://accounts.google.com",
        "email_verified": True,
        "sub": "google-subject-123",
        "email": "verified@example.com",
        "name": "Verified User",
        "picture": "https://example.com/avatar.png",
        "exp": "4102444800",
    }
    monkeypatch.setattr(
        auth_router.id_token,
        "verify_oauth2_token",
        lambda credential, _request, audience: claims
        if credential == "test-google-token" and audience == settings.google_client_id
        else {},
    )

    response = await auth_router.authenticate_google(
        auth_router.GoogleAuthRequest(credential="test-google-token")
    )

    token_data = decode_and_validate_token(
        response.access_token,
        secret_key=secret,
        expected_issuer=settings.jwt_issuer,
        expected_audience=settings.jwt_audience,
    )
    assert token_data.user_id == "google_google-subject-123"
    assert token_data.profile == {
        "email": "verified@example.com",
        "name": "Verified User",
        "picture": "https://example.com/avatar.png",
    }
    assert response.user.email == "verified@example.com"


@pytest.mark.asyncio
async def test_google_sign_in_rejects_unverified_audience(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "expected-client")
    monkeypatch.setattr(settings, "jwt_secret_key", "google-auth-test-secret-with-at-least-32-characters")
    claims = {
        "aud": "attacker-client",
        "iss": "accounts.google.com",
        "email_verified": True,
        "sub": "attacker",
        "email": "attacker@example.com",
        "exp": "4102444800",
    }
    monkeypatch.setattr(auth_router.id_token, "verify_oauth2_token", lambda *_args: claims)

    with pytest.raises(HTTPException) as exc:
        await auth_router.authenticate_google(
            auth_router.GoogleAuthRequest(credential="test-google-token")
        )
    assert exc.value.status_code == 401


def test_google_sign_in_does_not_accept_profile_only_input():
    with pytest.raises(ValidationError):
        auth_router.GoogleAuthRequest.model_validate({"email": "attacker@example.com"})


def test_production_settings_require_an_explicit_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_DEV_AUTH", "false")
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

    with pytest.raises(ValueError, match="JWT_SECRET_KEY must be provided"):
        Settings()
