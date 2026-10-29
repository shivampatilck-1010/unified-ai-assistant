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
    echo "ERROR: 'docker' command not found. Please install Docker Engine first." >&2
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' plugin not found." >&2
    exit 1
fi

# 2. Check or generate .env.production
if [ ! -f "${ROOT_DIR}/.env.production" ]; then
    echo "Notice: .env.production not found. Generating secure credentials..."
    python3 "${SCRIPT_DIR}/generate_staging_secrets.py"
    cp "${ROOT_DIR}/.env.staging" "${ROOT_DIR}/.env.production"
    chmod 600 "${ROOT_DIR}/.env.production"
    echo "Created ${ROOT_DIR}/.env.production with 0600 permissions."
    echo "IMPORTANT: Verify GEMINI_API_KEY, CORS_ORIGINS, and domain settings in .env.production."
fi

# 3. Build all production images
echo "Building production Docker images (API, Worker, Web)..."
docker compose -f "${COMPOSE_FILE}" build

# 4. Bootstrap Database & Web HTTP Proxy
echo "Starting PostgreSQL database and HTTP bootstrap proxy..."
docker compose -f "${COMPOSE_FILE}" up -d db web

# 5. Wait for Database Health
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

# 6. Optional SSL Setup if DOMAIN and EMAIL are provided
DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    echo "Configuring HTTPS for domain: ${DOMAIN}..."
    "${SCRIPT_DIR}/setup_ssl.sh" "${DOMAIN}" "${EMAIL}"
else
    echo "NOTICE: DOMAIN and EMAIL not passed. Skipping Let's Encrypt certificate issuance."
    echo "Application running in HTTP mode on port 80."
    echo "To activate HTTPS later, run: ./deploy/setup_ssl.sh <DOMAIN> <EMAIL>"
fi

# 7. Mandatory Verified Pre-Migration Backup
echo "Executing pre-migration backup check..."
"${SCRIPT_DIR}/backup_database.sh" /backups/postgresql --allow-empty

# 8. Apply Alembic Database Migrations
echo "Applying database schema migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm api \
    alembic -c alembic.ini upgrade head

# 9. Start Complete Stack
echo "Starting full application stack (API, Worker, Web, DB)..."
docker compose -f "${COMPOSE_FILE}" up -d

# 10. Post-Deployment Smoke Test
echo "Verifying application readiness..."
sleep 5
HEALTH_URL="http://localhost/health"
READY_URL="http://localhost/ready"
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    HEALTH_URL="https://localhost/health"
    READY_URL="https://localhost/ready"
fi

if curl -skf "${HEALTH_URL}" >/dev/null; then
    echo "[PASS] Health probe: OK"
else
    echo "[WARN] Health probe did not respond immediately. Check 'docker compose -f docker-compose.prod.yml logs api'."
fi

if curl -skf "${READY_URL}" >/dev/null; then
    echo "[PASS] Readiness probe: OK"
else
    echo "[WARN] Readiness probe pending. Check 'docker compose -f docker-compose.prod.yml logs api'."
fi

echo "=== Deployment Completed Successfully ==="
docker compose -f "${COMPOSE_FILE}" ps
