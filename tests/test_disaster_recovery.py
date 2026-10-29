"""
Automated Database Backup & Disaster Recovery Verification Test.
Tests snapshot backup creation, canary mutation, and recovery rollback.
"""

import asyncio
import os
import shutil
import sqlite3
import uuid
from pathlib import Path


def test_backup_and_restore_cycle():
    root_dir = Path(__file__).resolve().parent.parent
    db_path = root_dir / "services" / "api" / "unified_ai.db"
    backup_path = root_dir / "services" / "api" / "unified_ai.db.backup_test"

    assert db_path.exists(), f"Database file not found at {db_path}"

    print(f"1. Database file verified at {db_path} ({db_path.stat().st_size} bytes)")

    # 1. Take atomic backup using SQLite's online backup API (WAL-safe)
    conn_src = sqlite3.connect(str(db_path))
    conn_backup = sqlite3.connect(str(backup_path))
    with conn_backup:
        conn_src.backup(conn_backup, pages=100)
    conn_backup.close()
    conn_src.close()

    assert backup_path.exists(), "Backup snapshot failed to create"
    print(f"2. Online backup snapshot created successfully at {backup_path}")

    canary_id = f"canary-{uuid.uuid4().hex[:12]}"
    test_user_id = "canary-disaster-recovery-user"

    # 2. Insert canary mutation into live database
    conn_live = sqlite3.connect(str(db_path))
    cursor = conn_live.cursor()
    cursor.execute(
        "INSERT INTO conversations (id, owner_id, title, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
        (canary_id, test_user_id, "Canary Disaster Recovery Test Record"),
    )
    conn_live.commit()

    # 3. Verify canary exists in live database
    cursor.execute("SELECT id, title FROM conversations WHERE id = ?", (canary_id,))
    row = cursor.fetchone()
    assert row is not None, "Canary record failed to insert"
    assert row[0] == canary_id
    print(f"3. Canary mutation inserted: {canary_id} ('{row[1]}')")
    conn_live.close()

    # 4. Perform Disaster Recovery (restore snapshot into live database using online backup API)
    conn_snap = sqlite3.connect(str(backup_path))
    conn_restore = sqlite3.connect(str(db_path))
    with conn_restore:
        conn_snap.backup(conn_restore, pages=100)
    conn_snap.close()
    conn_restore.close()
    print("4. Restored live database from backup snapshot using SQLite online backup")

    # 5. Verify recovery
    conn_restored = sqlite3.connect(str(db_path))
    cursor_restored = conn_restored.cursor()

    # Verify canary record no longer exists
    cursor_restored.execute("SELECT id FROM conversations WHERE id = ?", (canary_id,))
    canary_after_restore = cursor_restored.fetchone()
    assert canary_after_restore is None, "Canary record still present after disaster recovery restore!"
    print("5. Canary record cleanly absent after restore")

    # Verify database integrity
    cursor_restored.execute("PRAGMA integrity_check")
    integrity = cursor_restored.fetchone()
    assert integrity is not None and integrity[0] == "ok", f"Integrity check failed: {integrity}"
    print(f"6. Database integrity verified: {integrity[0]}")

    conn_restored.close()

    # 6. Clean up temporary backup artifact
    if backup_path.exists():
        backup_path.unlink()
    print("7. Temporary backup snapshot cleaned up")
    print("=== DISASTER RECOVERY & BACKUP/RESTORE TEST PASSED SUCCESSFULLY ===")


if __name__ == "__main__":
    test_backup_and_restore_cycle()
