#!/usr/bin/env bash
# ==============================================================================
# Unified AI Assistant - Automated Linux Staging / Production Deployment Script
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

echo "=== Unified AI Assistant Production Deployment ==="

# 1. Check Docker & Docker Compose
if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: 'docker' command not found. Please install Docker Engine first:" >&2
    echo "  curl -fsSL https://get.docker.com | sh" >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' plugin not found." >&2
    exit 1
fi

# 2. Parse domain and email arguments
RAW_DOMAIN="${1:-}"
EMAIL="${2:-}"

DOMAIN=""
if [ "$RAW_DOMAIN" = "auto" ]; then
    echo "Resolving VPS public IP for automatic free HTTPS hostname..."
    PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org || curl -s --max-time 5 https://ifconfig.me || true)
    if [ -n "$PUBLIC_IP" ]; then
        DOMAIN="${PUBLIC_IP}.sslip.io"
        echo "Using automated wildcard DNS hostname: ${DOMAIN} (resolves to ${PUBLIC_IP})"
    else
        echo "WARNING: Could not automatically detect public IP. Falling back to HTTP on port 80."
    fi
elif [ -n "$RAW_DOMAIN" ]; then
    # If a raw IP address was passed, format it with sslip.io
    if [[ "$RAW_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        DOMAIN="${RAW_DOMAIN}.sslip.io"
        echo "IP address provided. Using wildcard DNS hostname: ${DOMAIN}"
    else
        DOMAIN="$RAW_DOMAIN"
    fi
fi

# 3. Check or generate .env.production
if [ ! -f "${ROOT_DIR}/.env.production" ]; then
    echo "Notice: .env.production not found. Generating cryptographically secure credentials..."
    python3 "${SCRIPT_DIR}/generate_staging_secrets.py"
    cp "${ROOT_DIR}/.env.staging" "${ROOT_DIR}/.env.production"
    chmod 600 "${ROOT_DIR}/.env.production"
    echo "Created ${ROOT_DIR}/.env.production with 0600 permissions."
fi

# Ensure domain is in CORS_ORIGINS
if [ -n "$DOMAIN" ]; then
    if ! grep -q "${DOMAIN}" "${ROOT_DIR}/.env.production"; then
        echo "Adding https://${DOMAIN} to CORS_ORIGINS in .env.production..."
        sed -i "s|CORS_ORIGINS=\[|CORS_ORIGINS=[\"https://${DOMAIN}\", \"http://${DOMAIN}\", |" "${ROOT_DIR}/.env.production"
    fi
fi

# 4. Build all production images
echo "Building production Docker images (API, Worker, Web)..."
docker compose -f "${COMPOSE_FILE}" build

# 5. Bootstrap Database & Web HTTP Proxy
echo "Starting PostgreSQL database and HTTP bootstrap proxy..."
docker compose -f "${COMPOSE_FILE}" up -d db web

# 6. Wait for Database Health
echo "Waiting for PostgreSQL database to report healthy..."
for i in {1..30}; do
    STATUS=$(docker compose -f "${COMPOSE_FILE}" ps db --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | cut -d'"' -f4 || true)
    if [ "$STATUS" = "healthy" ]; then
        echo "PostgreSQL is healthy."
        break
    fi
    echo "Waiting for database (${i}/30)..."
    sleep 2
done

# 7. Optional SSL Setup if DOMAIN and EMAIL are available
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    echo "Requesting Let's Encrypt SSL certificate for: ${DOMAIN}..."
    "${SCRIPT_DIR}/setup_ssl.sh" "${DOMAIN}" "${EMAIL}"
else
    echo "NOTICE: Domain and email not both provided. Running in HTTP mode on port 80."
    echo "To activate HTTPS at any time, run: ./deploy/setup_ssl.sh <DOMAIN> <EMAIL>"
fi

# 8. Mandatory Verified Pre-Migration Backup
echo "Executing pre-migration database backup check..."
"${SCRIPT_DIR}/backup_database.sh" /backups/postgresql --allow-empty

# 9. Apply Alembic Database Migrations
echo "Applying database schema migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm api \
    alembic -c alembic.ini upgrade head

# 10. Start Complete Stack
echo "Starting full application stack (API, Worker, Web, DB)..."
docker compose -f "${COMPOSE_FILE}" up -d

# 11. Post-Deployment Smoke Test
echo "Running post-deployment readiness and health checks..."
sleep 5

SCHEME="http"
TARGET_HOST="localhost"
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    SCHEME="https"
    TARGET_HOST="${DOMAIN}"
fi

HEALTH_URL="${SCHEME}://${TARGET_HOST}/health"
READY_URL="${SCHEME}://${TARGET_HOST}/ready"

if curl -skf "${HEALTH_URL}" >/dev/null; then
    echo "[PASS] Health probe: OK (${HEALTH_URL})"
else
    echo "[WARN] Health probe pending. Inspect container logs with: docker compose -f ${COMPOSE_FILE} logs api"
fi

if curl -skf "${READY_URL}" >/dev/null; then
    echo "[PASS] Readiness probe: OK (${READY_URL})"
else
    echo "[WARN] Readiness probe pending. Inspect container logs with: docker compose -f ${COMPOSE_FILE} logs api"
fi

echo ""
echo "================================================================================"
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    echo " SUCCESS: Unified AI Assistant is publicly accessible at:"
    echo " https://${DOMAIN}/"
else
    PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "localhost")
    echo " SUCCESS: Unified AI Assistant is running at:"
    echo " http://${PUBLIC_IP}/"
fi
echo "================================================================================"
docker compose -f "${COMPOSE_FILE}" ps
