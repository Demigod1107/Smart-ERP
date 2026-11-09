# SMART SCHOOL — Database Backup & Restore Guide

This guide describes the disaster recovery, backup, and restore architecture of Smart School. The application features native support for automated SQL (`.sql`) and structured JSON (`.json`) exports, SHA-256 cryptographic verification, automatic pre-restore safety snapshots, and controlled rollback.

---

## 1. Backup Architecture Overview

All backups are stored in the dedicated `backups/` directory located at the project root.

```
d:\ITWS project\
├── backups\
│   ├── backup_2026-11-09T18-00-00-000Z.sql
│   ├── backup_2026-11-09T18-15-00-000Z.json
│   └── pre_restore_safety_backup_2026-11-09T18-30-00-000Z.json
```

Each backup operation records an entry in the `backup_history` database table, calculating:
- File name
- Format (`sql` or `json`)
- File size in bytes
- Cryptographic SHA-256 hash checksum
- Creation timestamp and triggering user

---

## 2. Backup Formats

### Format 1: SQL Dump (`.sql`)
- Contains full DDL schema statements (`CREATE TABLE IF NOT EXISTS`, indices) followed by transactional DML `INSERT INTO ...` statements.
- Wrapped inside a single `BEGIN TRANSACTION; ... COMMIT;` block.
- Disables and re-enables `PRAGMA foreign_keys` to ensure order-independent record restoration.
- Compatible with SQLite command-line tools:
  ```bash
  sqlite3 server/smart_school.db < backups/backup_2026-11-09T18-00-00-000Z.sql
  ```

### Format 2: Structured JSON (`.json`)
- Contains structured document format with schema metadata, export timestamp, application version, and complete table rows:
  ```json
  {
    "metadata": {
      "version": "4.5.0",
      "exportedAt": "2026-11-09T18:15:00.000Z",
      "format": "smart-school-json-v1"
    },
    "tables": {
      "classes": [...],
      "students": [...],
      "subjects": [...],
      "attendance": [...]
    }
  }
  ```
- Easily parseable, inspectable, and auditable across different database systems.

---

## 3. Creating Backups

### Via Web Administrative Interface
1. Log in as an Administrator (`admin` / `admin123`).
2. Navigate to **Administration** -> **Database & Backup** (`settings-database.html`).
3. Click either **Create SQL Backup** or **Create JSON Backup**.
4. The system immediately dumps the database, computes the SHA-256 hash, registers the archive, and updates the table.
5. Click the **Download** action icon to save the snapshot file locally.

### Via REST API
```bash
# Generate SQL Backup
curl -X POST http://localhost:3000/api/admin/backups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"format": "sql"}'

# Generate JSON Backup
curl -X POST http://localhost:3000/api/admin/backups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"format": "json"}'
```

---

## 4. Integrity Verification

Before any restore can proceed, the system verifies the file:
1. **Physical Existence**: Checks if the requested file exists in `backups/`.
2. **SHA-256 Consistency**: Re-reads the file from disk, hashes it using `crypto.createHash('sha256')`, and compares it to the registered checksum in `backup_history`.
3. **Format & Syntax Validation**:
   - For `.json`: Parses JSON structure, ensures top-level `metadata` and `tables` keys, and verifies essential tables (`students`, `attendance`, `classes`) are present.
   - For `.sql`: Ensures valid SQL statement syntax and standard transaction tags.

---

## 5. Automated Pre-Restore Safety Snapshot & Restoration Runbook

Restoring a database replaces the current working database. To prevent accidental data loss:

> [!IMPORTANT]
> **Pre-Restore Safety Guarantee**: Every call to the restore service **automatically creates a timestamped JSON safety snapshot** of the active database *before* modifying or truncating any table.
> If the restore encounters any error, the transaction rolls back immediately.

### Restore Procedure via UI:
1. Open **Database & Backup** (`settings-database.html`).
2. Find the target backup snapshot in the **Available Backup Snapshots** table.
3. Click the **Restore** button (↺).
4. Review the modal confirmation dialog, which displays the warning and confirms the pre-restore backup will be created.
5. Click **Confirm & Restore Database**.
6. The UI refreshes with a success confirmation toast, displaying the newly generated pre-restore backup filename.

---

## 6. Cold Disaster Recovery (Manual CLI)

If the Node.js server cannot boot due to a corrupted SQLite file:

1. Stop the application server:
   ```bash
   # Kill running node process
   ```
2. Move the damaged database out of the way:
   ```powershell
   Move-Item server/smart_school.db server/smart_school.db.bak
   ```
3. Re-initialize an empty database using `db.js`:
   ```bash
   node -e "require('./server/db')"
   ```
4. Restore from the most recent SQL backup:
   ```powershell
   Get-Content backups/backup_2026-11-09T18-00-00-000Z.sql | sqlite3 server/smart_school.db
   ```
5. Restart the server:
   ```bash
   npm start
   ```

