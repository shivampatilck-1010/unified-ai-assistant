# Operational Guide: Database Backup, Restore, Migrations & Secrets Rotation

This guide details operational runbooks for the **Unified AI Assistant** production deployment, including PostgreSQL backups, disaster recovery, Alembic migrations, worker reconciliation, and zero-downtime secret rotation.

---

## 1. Storage Architecture Overview

The system persists state across two layers:
1. **Relational Database (PostgreSQL 16)**:
   - User identity references, conversations, messages, model metadata.
   - Tasks, calendar events, reminders.
   - Files metadata, chunk embeddings, citations.
   - Autonomous browser tasks, execution plans, step evidence, audit events.
   - Web research jobs, discovered sources, syntheses, traceable citations.
   - Wi-Fi sensing rooms, simulated nodes, occupancy logs.
2. **File Storage Volume**:
   - Uploaded user documents in `uploads/` directory (or GCS/S3 in cloud scale).

---

## 2. PostgreSQL Backup Procedures

### 2.1 Automated Nightly Logical Backups

Run `pg_dump` inside the container or via a cron worker:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/backups/postgresql"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/unified_ai_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Execute pg_dump with gzip compression
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-unified_ai}" -d "${POSTGRES_DB:-unified_ai}" --clean --if-exists \
  | gzip > "${FILENAME}"

# Retain backups for 30 days
find "${BACKUP_DIR}" -type f -name "unified_ai_*.sql.gz" -mtime +30 -delete

echo "Backup completed: ${FILENAME}"
```

### 2.2 Uploaded Documents Backup

Archive the persistent uploads volume:

```bash
tar -czvf /backups/uploads_$(date +"%Y%m%d").tar.gz -C services/api uploads/
```

### 2.3 SQLite WAL-Mode Backup (Development & Local Staging)

When running with SQLite in WAL mode (`journal_mode=WAL`), simple file copies of `.db` may miss active uncheckpointed WAL transactions in `.db-wal`. Always use SQLite's native online backup API or execute a checkpoint before backup:

```python
import sqlite3

def backup_sqlite(source_path: str, backup_path: str):
    conn_src = sqlite3.connect(source_path)
    conn_dst = sqlite3.connect(backup_path)
    with conn_dst:
        conn_src.backup(conn_dst, pages=100)
    conn_dst.close()
    conn_src.close()
```

---

## 3. Disaster Recovery & Restoration Runbook

### 3.1 Restoring from Logical Backup

1. **Stop API and Worker services** to avoid partial writes:
   ```bash
   docker compose -f docker-compose.prod.yml stop api worker
   ```

2. **Restore PostgreSQL database**:
   ```bash
   gunzip -c /backups/postgresql/unified_ai_YYYYMMDD_HHMMSS.sql.gz \
     | docker compose -f docker-compose.prod.yml exec -T db \
       psql -U "${POSTGRES_USER:-unified_ai}" -d "${POSTGRES_DB:-unified_ai}"
   ```

3. **Verify Database Integrity**:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db \
     psql -U "${POSTGRES_USER:-unified_ai}" -d "${POSTGRES_DB:-unified_ai}" \
     -c "SELECT count(*) FROM conversations; SELECT count(*) FROM browser_tasks;"
   ```

4. **Restart API and Worker services**:
   ```bash
   docker compose -f docker-compose.prod.yml start api worker
   ```

5. **Verify Readiness Probe**:
   ```bash
   curl -i http://localhost/ready
   # Expected HTTP 200 with status: "ready"
   ```

---

## 4. Alembic Database Migrations & Rollbacks

All schema alterations are version-controlled using Alembic migrations in `services/api/alembic/versions`.

### 4.1 Applying Migrations in Production

Before deploying updated API or Worker containers:

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  alembic -c alembic.ini upgrade head
```

### 4.2 Verifying Current Schema Version

```bash
docker compose -f docker-compose.prod.yml exec -T api \
  alembic -c alembic.ini current
```

### 4.3 Safe Migration Rollback

If a migration encounters an operational issue during deployment:

```bash
# Downgrade by exactly one revision
docker compose -f docker-compose.prod.yml exec -T api \
  alembic -c alembic.ini downgrade -1
```

> **Migration Rules**:
> - Never add `NOT NULL` columns to existing tables without `server_default`.
> - Write migrations defensively (inspect existing columns before running `op.add_column`).
> - Keep migrations backwards-compatible with the currently running application version.

---

## 5. Secrets & Credential Rotation Procedures

### 5.1 JWT Secret Key Rotation

1. Update `.env.production` with the new `JWT_SECRET_KEY` (minimum 32 characters).
2. Perform rolling container restart:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api
   ```
3. Existing active sessions will require re-authentication; clients receive HTTP 401 and redirect to sign-in.

### 5.2 AI Model API Key Rotation

1. Update the appropriate environment variable in `.env.production`:
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
2. Apply changes:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps api worker
   ```
3. Test provider status:
   ```bash
   curl -s http://localhost/api/provider/status | jq .
   ```

---

## 6. Dangling Tasks & Worker Reconciliation

If an agent worker or API container crashes while tasks are running:

1. **Automatic Startup Recovery**:
   - Both `BrowserWorkerRunner.recover_dangling_tasks()` and `ResearchJobService.recover_dangling_jobs()` automatically execute on application startup.
   - Tasks with remaining retries (`retry_count < max_retries`) are reset to `awaiting_approval` with cleared worker leases.
   - Tasks exceeding maximum retries are set to `failed` with descriptive audit events.

2. **Manual Task Inspection**:
   ```sql
   SELECT id, status, claimed_by_worker, retry_count, max_retries, updated_at 
   FROM browser_tasks 
   WHERE status = 'running';
   ```

3. **Manual Task Reset (if worker dead)**:
   ```sql
   UPDATE browser_tasks 
   SET status = 'awaiting_approval', claimed_by_worker = NULL, updated_at = NOW() 
   WHERE status = 'running' AND claimed_by_worker = 'dead-worker-id';
   ```
