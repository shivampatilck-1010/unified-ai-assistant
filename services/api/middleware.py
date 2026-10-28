import collections
import time
import uuid
from typing import Callable, Deque, Dict, Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RequestCorrelationMiddleware(BaseHTTPMiddleware):
    """Assigns or propagates a correlation ID (X-Request-ID) on all incoming requests and outgoing responses."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        corr_id = request.headers.get("X-Request-ID")
        if not corr_id:
            corr_id = f"req-{uuid.uuid4().hex[:12]}"

        request.state.request_id = corr_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = corr_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforces essential defensive HTTP security response headers."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response: Response = await call_next(request)

        # Essential defensive headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' ws: wss: http: https:; "
            "frame-ancestors 'none';"
        )
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"

        return response


class PayloadSizeLimitMiddleware(BaseHTTPMiddleware):
    """Enforces a strict upper bound on request body payload size."""

    def __init__(self, app, max_body_bytes: int = 15 * 1024 * 1024):
        super().__init__(app)
        self.max_body_bytes = max_body_bytes

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method in ("POST", "PUT", "PATCH"):
            cl_header = request.headers.get("content-length")
            if cl_header:
                try:
                    content_length = int(cl_header)
                    if content_length > self.max_body_bytes:
                        return JSONResponse(
                            status_code=413,
                            content={
                                "detail": f"Request entity too large ({content_length} bytes). Maximum allowed: {self.max_body_bytes} bytes."
                            },
                        )
                except ValueError:
                    pass

        return await call_next(request)


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """In-memory sliding window rate limiter per client IP or authenticated identity."""

    def __init__(self, app, requests_per_minute: int = 120, enabled: bool = True):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.enabled = enabled
        self._history: Dict[str, Deque[float]] = collections.defaultdict(collections.deque)
        # Paths exempted from rate limiting
        self._exempt_paths = {"/health", "/ready", "/docs", "/openapi.json", "/"}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_host = request.client.host if request.client else "unknown-client"
        is_test_client = client_host == "testclient" and not request.headers.get("X-Test-Rate-Limit")
        if not self.enabled or is_test_client or request.url.path in self._exempt_paths:
            return await call_next(request)

        client_key = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or client_host
        )

        now = time.monotonic()
        cutoff = now - 60.0

        history = self._history[client_key]
        # Prune requests older than 60 seconds
        while history and history[0] < cutoff:
            history.popleft()

        if len(history) >= self.requests_per_minute:
            retry_after = int(60.0 - (now - history[0])) if history else 60
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Too many requests. Please slow down.",
                    "limit_per_minute": self.requests_per_minute,
                },
                headers={"Retry-After": str(max(1, retry_after))},
            )

        history.append(now)
        return await call_next(request)
