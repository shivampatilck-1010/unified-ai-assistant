#!/usr/bin/env bash
# ==============================================================================
# Production Database Backup Script with Strict Error Handling
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${1:-/backups/postgresql}"
ALLOW_EMPTY="${2:-false}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/unified_ai_${TIMESTAMP}.sql.gz"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

# 1. Verify destination directory exists and is writable
mkdir -p "${BACKUP_DIR}"
if [ ! -w "${BACKUP_DIR}" ]; then
    echo "ERROR: Backup directory '${BACKUP_DIR}' is not writable." >&2
    exit 1
fi

# 2. Check database connectivity and inspect existing table count
echo "Checking PostgreSQL database connectivity and state..."
set +e
TABLE_COUNT=$(docker compose -f "${COMPOSE_FILE}" exec -T db \
    psql -U "${POSTGRES_USER:-unified_ai}" -d "${POSTGRES_DB:-unified_ai}" -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d '[:space:]')
PSQL_STATUS=$?
set -e

if [ "$PSQL_STATUS" -ne 0 ] || [ -z "$TABLE_COUNT" ]; then
    echo "ERROR: Unable to query PostgreSQL database. Ensure the 'db' container is running and healthy." >&2
    exit 1
fi

echo "Existing public tables in database: ${TABLE_COUNT}"

# 3. Handle initial empty database vs populated database
if [ "$TABLE_COUNT" -eq 0 ]; then
    if [ "$ALLOW_EMPTY" = "--allow-empty" ] || [ "$ALLOW_EMPTY" = "true" ]; then
        echo "NOTICE: Database is currently empty (0 tables). Initial pre-migration backup skipped."
        exit 0
    else
        echo "WARNING: Database contains 0 public tables. Executing backup to verify schema state..."
    fi
fi

# 4. Execute pg_dump with gzip compression (pipefail ensures pg_dump failure propagates)
echo "Executing pg_dump to ${FILENAME}..."
docker compose -f "${COMPOSE_FILE}" exec -T db \
    pg_dump -U "${POSTGRES_USER:-unified_ai}" -d "${POSTGRES_DB:-unified_ai}" --clean --if-exists \
    | gzip > "${FILENAME}"

# 5. Strict verification of resulting backup archive
if [ ! -f "${FILENAME}" ]; then
    echo "ERROR: Backup file '${FILENAME}' was not created." >&2
    exit 1
fi

if [ ! -s "${FILENAME}" ]; then
    echo "ERROR: Backup file '${FILENAME}' is empty (0 bytes). pg_dump may have failed." >&2
    rm -f "${FILENAME}"
    exit 1
fi

# Test gzip archive integrity
if ! gzip -t "${FILENAME}" 2>/dev/null; then
    echo "ERROR: Backup file '${FILENAME}' is corrupted or truncated (gzip integrity check failed)." >&2
    rm -f "${FILENAME}"
    exit 1
fi

FILE_SIZE=$(ls -lh "${FILENAME}" | awk '{print $5}')
echo "SUCCESS: Database backup verified and written to ${FILENAME} (${FILE_SIZE})."
