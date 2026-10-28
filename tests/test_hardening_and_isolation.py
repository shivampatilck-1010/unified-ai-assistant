import asyncio
import time
import uuid
from datetime import datetime, timezone
import pytest
from httpx import ASGITransport, AsyncClient

from auth import (
    TokenValidationError,
    create_access_token,
    decode_and_validate_token,
)
from config import Settings, get_settings
from database import async_session_factory
from main import app
from models.browser_task import BrowserTask
from policy import (
    ALLOWED_WEB_PORTS,
    PROHIBITED_PORTS,
    PolicyViolationError,
    validate_url,
)
from schemas.browser_task import BrowserTaskStatus
from worker import BrowserWorkerRunner


# ==============================================================================
# 1. JWT & Identity Hardening Tests
# ==============================================================================

def test_jwt_token_creation_and_validation():
    secret = "a_very_secure_test_secret_key_with_at_least_32_characters"
    issuer = "test-issuer"
    audience = "test-audience"
    user_id = f"user-{uuid.uuid4().hex[:8]}"

    # 1. Create valid token
    token = create_access_token(
        user_id=user_id,
        secret_key=secret,
        algorithm="HS256",
        expires_in_seconds=3600,
        issuer=issuer,
        audience=audience,
    )
    assert token and isinstance(token, str)

    # 2. Decode and validate valid token
    payload = decode_and_validate_token(
        token=token,
        secret_key=secret,
        algorithm="HS256",
        issuer=issuer,
        audience=audience,
    )
    assert payload["sub"] == user_id
    assert payload["iss"] == issuer
    assert payload["aud"] == audience
    assert payload["exp"] > time.time()


def test_jwt_token_tampered_signature():
    secret = "a_very_secure_test_secret_key_with_at_least_32_characters"
    token = create_access_token(user_id="user-123", secret_key=secret)

    # Tamper with signature segment
    parts = token.split(".")
    tampered_sig = ("A" if parts[2][0] != "A" else "B") + parts[2][1:]
    tampered_token = f"{parts[0]}.{parts[1]}.{tampered_sig}"

    with pytest.raises(TokenValidationError) as exc:
        decode_and_validate_token(token=tampered_token, secret_key=secret)
    assert "signature" in str(exc.value).lower()


def test_jwt_token_expired():
    secret = "a_very_secure_test_secret_key_with_at_least_32_characters"
    token = create_access_token(
        user_id="user-123",
        secret_key=secret,
        expires_in_seconds=-10,  # Already expired in the past
    )

    with pytest.raises(TokenValidationError) as exc:
        decode_and_validate_token(token=token, secret_key=secret)
    assert "expired" in str(exc.value).lower()


def test_jwt_token_issuer_and_audience_mismatch():
    secret = "a_very_secure_test_secret_key_with_at_least_32_characters"
    token = create_access_token(
        user_id="user-123",
        secret_key=secret,
        issuer="expected-issuer",
        audience="expected-audience",
    )

    # Mismatched issuer
    with pytest.raises(TokenValidationError) as exc:
        decode_and_validate_token(token=token, secret_key=secret, issuer="wrong-issuer", audience="expected-audience")
    assert "issuer" in str(exc.value).lower()

    # Mismatched audience
    with pytest.raises(TokenValidationError) as exc:
        decode_and_validate_token(token=token, secret_key=secret, issuer="expected-issuer", audience="wrong-audience")
    assert "audience" in str(exc.value).lower()


@pytest.mark.asyncio
async def test_production_auth_fails_closed_without_token(monkeypatch):
    """In production mode or when dev auth is disabled, missing or invalid credentials return HTTP 401."""
    settings = get_settings()
    monkeypatch.setattr(settings, "allow_dev_auth", False)
    monkeypatch.setattr(settings, "auth_mode", "jwt")
    monkeypatch.setattr(settings, "jwt_secret_key", "mock_prod_secret_key_with_at_least_32_chars")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Missing Authorization header -> 401
        res1 = await client.get("/api/conversations")
        assert res1.status_code == 401
        assert "authentication required" in res1.json()["detail"].lower()

        # 2. X-User-Id spoofing attempt without bearer token -> 401
        res2 = await client.get("/api/conversations", headers={"X-User-Id": "spoofed-admin"})
        assert res2.status_code == 401

        # 3. Forged bearer token -> 401
        res3 = await client.get("/api/conversations", headers={"Authorization": "Bearer forged.invalid.token"})
        assert res3.status_code == 401

        # 4. Valid JWT access token -> 200
        valid_token = create_access_token(
            user_id="legit-user-1",
            secret_key=settings.jwt_secret_key,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        res4 = await client.get("/api/conversations", headers={"Authorization": f"Bearer {valid_token}"})
        assert res4.status_code == 200


# ==============================================================================
# 2. SSRF, Cloud Metadata & IP Evasion Protection Tests
# ==============================================================================

def test_cloud_metadata_blocking():
    blocked_metadata_urls = [
        "http://169.254.169.254/latest/meta-data/",
        "http://169.254.170.2/v2/metadata",
        "http://100.100.100.200/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://instance-data/latest/meta-data/",
        "http://metadata/v1/",
    ]
    for url in blocked_metadata_urls:
        with pytest.raises(PolicyViolationError) as exc:
            validate_url(url, allow_local=False)
        assert any(term in str(exc.value).lower() for term in ["cloud metadata", "prohibited", "local/internal"])


def test_ip_evasion_blocking():
    evasion_urls = [
        # Decimal representation of 127.0.0.1
        "http://2130706433/",
        # Decimal representation of 169.254.169.254
        "http://2852039166/",
        # Hexadecimal representation of 127.0.0.1
        "http://0x7f000001/",
        # Octal representation of 127.0.0.1
        "http://0177.0.0.1/",
        # Carrier-grade NAT (100.64.0.1)
        "http://100.64.0.1/",
        # Private RFC 1918
        "http://10.0.0.1/",
        "http://192.168.1.1/",
        "http://172.16.0.1/",
    ]
    for url in evasion_urls:
        with pytest.raises(PolicyViolationError):
            validate_url(url, allow_local=False)


def test_port_validation():
    # Restricted system/database ports
    for port in (21, 22, 23, 25, 5432, 6379, 27017):
        with pytest.raises(PolicyViolationError):
            validate_url(f"http://example.com:{port}", allow_local=False)

    # Allowed web ports
    validate_url("http://example.com:80", allow_local=False)
    validate_url("https://example.com:443", allow_local=False)
    validate_url("http://example.com:8080", allow_local=False)


def test_embedded_credentials_prohibited():
    with pytest.raises(PolicyViolationError) as exc:
        validate_url("http://admin:secret@example.com/login", allow_local=False)
    assert "embedded credentials" in str(exc.value).lower()


# ==============================================================================
# 3. Atomic Task Claiming & Concurrency Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_atomic_task_claiming():
    task_id = f"task-claim-{uuid.uuid4().hex[:8]}"

    # Insert a test browser task
    async with async_session_factory() as session:
        async with session.begin():
            task = BrowserTask(
                id=task_id,
                owner_id="test-user",
                task_description="Test atomic claiming",
                status=BrowserTaskStatus.AWAITING_APPROVAL.value,
                max_retries=3,
                retry_count=0,
            )
            session.add(task)

    runner_a = BrowserWorkerRunner(worker_id="worker-node-alpha")
    runner_b = BrowserWorkerRunner(worker_id="worker-node-beta")

    # Worker A claims first
    claimed_a = await runner_a.claim_task(task_id)
    assert claimed_a is True

    # Worker B attempts to claim the same task simultaneously
    claimed_b = await runner_b.claim_task(task_id)
    assert claimed_b is False  # Must fail closed to prevent duplicate concurrent execution!

    # Verify task ownership in database
    async with async_session_factory() as session:
        stored = await session.get(BrowserTask, task_id)
        assert stored.status == BrowserTaskStatus.RUNNING.value
        assert stored.claimed_by_worker == "worker-node-alpha"


# ==============================================================================
# 4. Worker Restart Recovery Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_dangling_task_restart_recovery():
    task_id_retryable = f"task-recover-retry-{uuid.uuid4().hex[:8]}"
    task_id_exhausted = f"task-recover-fail-{uuid.uuid4().hex[:8]}"

    async with async_session_factory() as session:
        async with session.begin():
            # Task with retries remaining
            t1 = BrowserTask(
                id=task_id_retryable,
                owner_id="test-user",
                task_description="Dangling task with retries",
                status=BrowserTaskStatus.RUNNING.value,
                claimed_by_worker="crashed-worker-old",
                retry_count=1,
                max_retries=3,
            )
            # Task with retries exhausted
            t2 = BrowserTask(
                id=task_id_exhausted,
                owner_id="test-user",
                task_description="Dangling task with no retries left",
                status=BrowserTaskStatus.RUNNING.value,
                claimed_by_worker="crashed-worker-old",
                retry_count=3,
                max_retries=3,
            )
            session.add_all([t1, t2])

    runner = BrowserWorkerRunner(worker_id="worker-node-fresh")
    recovered_count = await runner.recover_dangling_tasks()
    assert recovered_count >= 2

    async with async_session_factory() as session:
        t1_after = await session.get(BrowserTask, task_id_retryable)
        assert t1_after.status == BrowserTaskStatus.AWAITING_APPROVAL.value
        assert t1_after.claimed_by_worker is None
        assert t1_after.retry_count == 2

        t2_after = await session.get(BrowserTask, task_id_exhausted)
        assert t2_after.status == BrowserTaskStatus.FAILED.value
        assert "exhausted" in t2_after.error_message.lower()


# ==============================================================================
# 5. Security Middlewares, Correlation & Readiness Probes
# ==============================================================================

@pytest.mark.asyncio
async def test_security_headers_and_correlation_id():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request with client-supplied correlation ID
        custom_req_id = "req-client-custom-12345"
        res = await client.get("/health", headers={"X-Request-ID": custom_req_id})
        assert res.status_code == 200

        # Check propagation of correlation ID
        assert res.headers.get("X-Request-ID") == custom_req_id

        # Check mandatory defensive security headers
        assert res.headers.get("X-Content-Type-Options") == "nosniff"
        assert res.headers.get("X-Frame-Options") == "DENY"
        assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "default-src 'self'" in res.headers.get("Content-Security-Policy", "")


@pytest.mark.asyncio
async def test_payload_size_limit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Huge fake content length header (e.g. 50 MB > 15 MB)
        res = await client.post(
            "/api/conversations",
            headers={"Content-Length": "52428800", "Content-Type": "application/json"},
            content=b"{}",
        )
        assert res.status_code == 413
        assert "too large" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_rate_limiting_middleware():
    from middleware import RateLimitingMiddleware
    from fastapi import FastAPI
    from fastapi.responses import PlainTextResponse

    test_app = FastAPI()
    test_app.add_middleware(RateLimitingMiddleware, requests_per_minute=2, enabled=True)

    @test_app.get("/test-endpoint")
    def sample_endpoint():
        return PlainTextResponse("ok")

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"X-Forwarded-For": "203.0.113.50", "X-Test-Rate-Limit": "1"}
        r1 = await client.get("/test-endpoint", headers=headers)
        assert r1.status_code == 200
        r2 = await client.get("/test-endpoint", headers=headers)
        assert r2.status_code == 200
        # 3rd request exceeds limit of 2 requests per minute
        r3 = await client.get("/test-endpoint", headers=headers)
        assert r3.status_code == 429
        assert "rate limit exceeded" in r3.json()["detail"].lower()


@pytest.mark.asyncio
async def test_readiness_probe():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/ready")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ready"
        assert data["database"] == "connected"
        assert "model_gateway" in data
        assert "browser_worker" in data
        assert data["scheduler"] in ("running", "stopped")
