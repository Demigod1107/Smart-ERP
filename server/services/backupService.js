const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../db');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const BACKUP_DIR = isVercel 
  ? path.join('/tmp', 'backups') 
  : path.join(__dirname, '..', '..', 'backups');

try {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Backup directory initialization note:', e.message);
}

// All application tables in dependency order for safe export/import
const APPLICATION_TABLES = [
  'classes',
  'users',
  'teachers',
  'students',
  'subjects',
  'subject_enrollments',
  'periods',
  'timetable',
  'holidays',
  'settings',
  'qr_sessions',
  'leave_applications',
  'notifications',
  'attendance',
  'attendance_sessions',
  'period_attendance',
  'attendance_audit',
  'communication_logs'
];

/**
 * Generate formatted timestamp string: YYYY-MM-DD_HHMMSS
 */
function getBackupTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${d}_${t}`;
}

/**
 * Create a consistent SQL backup of the active database
 */
function createSqlBackup(createdBy = 'Administrator') {
  const ts = getBackupTimestamp();
  const filename = `smart_school_backup_${ts}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  let sqlContent = `-- ========================================================\n`;
  sqlContent += `-- SMART SCHOOL DATABASE SQL BACKUP\n`;
  sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
  sqlContent += `-- Created By: ${createdBy}\n`;
  sqlContent += `-- Engine: SQLite (better-sqlite3)\n`;
  sqlContent += `-- ========================================================\n\n`;
  sqlContent += `PRAGMA foreign_keys = OFF;\n`;
  sqlContent += `BEGIN TRANSACTION;\n\n`;

  let totalRecords = 0;
  let tableCount = 0;

  APPLICATION_TABLES.forEach(tbl => {
    // Check if table exists in sqlite_master
    const checkTbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
    if (!checkTbl) return;

    tableCount++;
    sqlContent += `-- Table: ${tbl}\n`;
    sqlContent += `DROP TABLE IF EXISTS ${tbl};\n`;
    sqlContent += `${checkTbl.sql};\n\n`;

    const rows = db.prepare(`SELECT * FROM ${tbl}`).all();
    totalRecords += rows.length;

    rows.forEach(r => {
      const keys = Object.keys(r);
      const values = keys.map(k => {
        const val = r[k];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return val;
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      sqlContent += `INSERT INTO ${tbl} (${keys.join(', ')}) VALUES (${values.join(', ')});\n`;
    });
    sqlContent += `\n`;
  });

  sqlContent += `COMMIT;\n`;
  sqlContent += `PRAGMA foreign_keys = ON;\n`;

  fs.writeFileSync(filepath, sqlContent, 'utf8');
  const stats = fs.statSync(filepath);
  const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

  // Record in backup history
  const res = db.prepare(`
    INSERT INTO backup_history (
      filename, filepath, format, filesize_bytes, created_by,
      status, table_count, record_count, checksum
    ) VALUES (?, ?, 'sql', ?, ?, 'Valid', ?, ?, ?)
  `).run(filename, filepath, stats.size, createdBy, tableCount, totalRecords, checksum);

  return {
    id: res.lastInsertRowid,
    filename,
    filepath,
    format: 'sql',
    filesize: stats.size,
    tableCount,
    recordCount: totalRecords,
    checksum,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a structured JSON backup
 */
function createJsonBackup(createdBy = 'Administrator') {
  const ts = getBackupTimestamp();
  const filename = `smart_school_backup_${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  const backupData = {
    metadata: {
      system: 'Smart School Attendance Management System',
      version: '4.0.0',
      timestamp: new Date().toISOString(),
      createdBy,
      databaseType: 'sqlite',
      tableCount: 0,
      recordCount: 0,
    },
    tables: {}
  };

  let totalRecords = 0;
  let tableCount = 0;

  APPLICATION_TABLES.forEach(tbl => {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
    if (!exists) return;

    tableCount++;
    const rows = db.prepare(`SELECT * FROM ${tbl}`).all();
    backupData.tables[tbl] = rows;
    totalRecords += rows.length;
  });

  backupData.metadata.tableCount = tableCount;
  backupData.metadata.recordCount = totalRecords;

  const jsonString = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filepath, jsonString, 'utf8');

  const stats = fs.statSync(filepath);
  const checksum = crypto.createHash('sha256').update(jsonString).digest('hex');

  const res = db.prepare(`
    INSERT INTO backup_history (
      filename, filepath, format, filesize_bytes, created_by,
      status, table_count, record_count, checksum
    ) VALUES (?, ?, 'json', ?, ?, 'Valid', ?, ?, ?)
  `).run(filename, filepath, stats.size, createdBy, tableCount, totalRecords, checksum);

  return {
    id: res.lastInsertRowid,
    filename,
    filepath,
    format: 'json',
    filesize: stats.size,
    tableCount,
    recordCount: totalRecords,
    checksum,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Validate backup file integrity
 */
function validateBackup(filepath, format) {
  if (!fs.existsSync(filepath)) {
    return { valid: false, error: 'Backup file does not exist on disk' };
  }

  const content = fs.readFileSync(filepath, 'utf8');
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Backup file is empty' };
  }

  if (format === 'json' || filepath.endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (!data.metadata || !data.tables) {
        return { valid: false, error: 'Missing metadata or tables in JSON backup structure' };
      }
      return {
        valid: true,
        metadata: data.metadata,
        tableCount: Object.keys(data.tables).length,
        tables: Object.keys(data.tables)
      };
    } catch (e) {
      return { valid: false, error: 'Corrupt JSON format: ' + e.message };
    }
  } else {
    // SQL validation
    if (!content.includes('PRAGMA foreign_keys') && !content.includes('INSERT INTO')) {
      return { valid: false, error: 'Invalid SQL backup format: Missing table dump statements' };
    }
    return { valid: true, format: 'sql', size: content.length };
  }
}

/**
 * Get list of backups from database history
 */
function getBackupHistory() {
  return db.prepare('SELECT * FROM backup_history ORDER BY created_at DESC').all();
}

/**
 * Delete a backup record and disk file
 */
function deleteBackup(id) {
  const row = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(id);
  if (!row) return false;

  if (fs.existsSync(row.filepath)) {
    try {
      fs.unlinkSync(row.filepath);
    } catch (e) {}
  }
  db.prepare('DELETE FROM backup_history WHERE id = ?').run(id);
  return true;
}

module.exports = {
  BACKUP_DIR,
  APPLICATION_TABLES,
  createSqlBackup,
  createJsonBackup,
  validateBackup,
  getBackupHistory,
  deleteBackup,
};

