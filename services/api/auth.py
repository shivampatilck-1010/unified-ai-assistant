import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuthenticationError(Exception):
    """Base exception for authentication failures."""
    pass


TokenValidationError = AuthenticationError


class TokenExpiredError(AuthenticationError):
    """Raised when an authentication token has expired."""
    pass


class InvalidSignatureError(AuthenticationError):
    """Raised when token signature does not match expected cryptographic digest."""
    pass


class InvalidClaimsError(AuthenticationError):
    """Raised when required claims (issuer, audience, subject) are missing or invalid."""
    pass


@dataclass
class TokenData:
    user_id: str
    exp: int
    iat: int
    iss: Optional[str] = None
    aud: Optional[str] = None
    role: str = "user"
    profile: Optional[Dict[str, str]] = None

    def __getitem__(self, item: str) -> Any:
        if item == "sub":
            return self.user_id
        if hasattr(self, item):
            return getattr(self, item)
        raise KeyError(item)

    def get(self, item: str, default: Any = None) -> Any:
        try:
            return self[item]
        except KeyError:
            return default


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("utf-8"))


def create_access_token(
    user_id: str,
    secret_key: str,
    expires_delta: Optional[timedelta] = None,
    expires_in_seconds: Optional[int] = None,
    issuer: Optional[str] = "unified-ai-assistant",
    audience: Optional[str] = "unified-ai-assistant-api",
    role: str = "user",
    algorithm: str = "HS256",
    profile: Optional[Dict[str, str]] = None,
) -> str:
    """Generates a cryptographically signed HMAC-SHA256 JWT access token."""
    if not secret_key or len(secret_key) < 16:
        raise ValueError("JWT signing secret key must be at least 16 characters.")

    now = utc_now()
    if expires_in_seconds is not None:
        expire = now + timedelta(seconds=expires_in_seconds)
    elif expires_delta is not None:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=1)

    header = {"alg": algorithm, "typ": "JWT"}
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": issuer,
        "aud": audience,
        "role": role,
        "profile": profile,
    }

    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_and_validate_token(
    token: str,
    secret_key: str,
    expected_issuer: Optional[str] = None,
    expected_audience: Optional[str] = None,
    issuer: Optional[str] = None,
    audience: Optional[str] = None,
    algorithm: Optional[str] = None,
) -> TokenData:
    """Validates signature, expiration, issuer, and audience of an HS256 JWT token."""
    expected_issuer = expected_issuer or issuer
    expected_audience = expected_audience or audience
    if not token or not isinstance(token, str):
        raise AuthenticationError("Token must be a non-empty string.")

    parts = token.strip().split(".")
    if len(parts) != 3:
        raise AuthenticationError("Malformed JWT token structure: expected 3 dot-separated segments.")

    header_b64, payload_b64, sig_b64 = parts

    # 1. Validate header
    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
        if header.get("alg") != "HS256":
            raise AuthenticationError(f"Unsupported algorithm '{header.get('alg')}'. Expected HS256.")
    except Exception as e:
        if isinstance(e, AuthenticationError):
            raise
        raise AuthenticationError(f"Invalid JWT header: {e}")

    # 2. Verify signature in constant time
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    expected_sig_b64 = _b64url_encode(expected_sig)

    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        raise InvalidSignatureError("Cryptographic token signature verification failed.")

    # 3. Decode and validate payload claims
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as e:
        raise AuthenticationError(f"Invalid JWT payload JSON: {e}")

    # Subject
    user_id = payload.get("sub")
    if not user_id or not isinstance(user_id, str):
        raise InvalidClaimsError("Missing or invalid 'sub' (subject/user_id) claim in token.")

    # Expiration
    exp = payload.get("exp")
    if exp is None:
        raise InvalidClaimsError("Missing required 'exp' claim in token.")
    current_ts = int(utc_now().timestamp())
    if current_ts > exp:
        raise TokenExpiredError(f"Token has expired (expired at {exp}, current {current_ts}).")

    # Issuer
    if expected_issuer and payload.get("iss") != expected_issuer:
        raise InvalidClaimsError(
            f"Token issuer '{payload.get('iss')}' does not match expected '{expected_issuer}'."
        )

    # Audience
    if expected_audience and payload.get("aud") != expected_audience:
        raise InvalidClaimsError(
            f"Token audience '{payload.get('aud')}' does not match expected '{expected_audience}'."
        )

    return TokenData(
        user_id=user_id,
        exp=exp,
        iat=payload.get("iat", 0),
        iss=payload.get("iss"),
        aud=payload.get("aud"),
        role=payload.get("role", "user"),
        profile=payload.get("profile") if isinstance(payload.get("profile"), dict) else None,
    )
