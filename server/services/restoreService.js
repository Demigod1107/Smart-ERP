const fs = require('fs');
const { db } = require('../db');
const { createJsonBackup, validateBackup, APPLICATION_TABLES } = require('./backupService');

/**
 * Execute restore from a validated backup file
 */
function restoreFromBackup({ backupId, filepath, format, restoredBy = 'Administrator' }) {
  // Step 1: Validate file exists
  if (!fs.existsSync(filepath)) {
    throw new Error('Backup file does not exist on disk.');
  }

  // Step 2: Validate structure
  const validation = validateBackup(filepath, format);
  if (!validation.valid) {
    throw new Error('Backup validation failed: ' + validation.error);
  }

  // Step 3: Mandatory safety pre-restore backup of the current database!
  let preRestoreBackup = null;
  try {
    preRestoreBackup = createJsonBackup(`Pre-Restore Automated Safety (${restoredBy})`);
  } catch (err) {
    console.warn('Failed to take pre-restore safety backup:', err.message);
  }

  const preRestoreFilename = preRestoreBackup ? preRestoreBackup.filename : null;
  const isJson = format === 'json' || filepath.endsWith('.json');

  try {
    if (isJson) {
      restoreFromJson(filepath);
    } else {
      restoreFromSql(filepath);
    }

    // Record success in restore_history
    db.prepare(`
      INSERT INTO restore_history (
        backup_id, backup_filename, restored_by, pre_restore_backup_filename, status
      ) VALUES (?, ?, ?, ?, 'Success')
    `).run(backupId || null, filepath.split(/[\\/]/).pop(), restoredBy, preRestoreFilename);

    return {
      success: true,
      preRestoreBackup: preRestoreFilename,
      message: 'Database restored successfully.',
    };
  } catch (err) {
    // Record failure in restore_history
    db.prepare(`
      INSERT INTO restore_history (
        backup_id, backup_filename, restored_by, pre_restore_backup_filename, status, error_message
      ) VALUES (?, ?, ?, ?, 'Failed', ?)
    `).run(backupId || null, filepath.split(/[\\/]/).pop(), restoredBy, preRestoreFilename, err.message);

    throw new Error('Database restoration aborted: ' + err.message);
  }
}

/**
 * Restore from JSON file preserving relationships and foreign keys
 */
function restoreFromJson(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const backupData = JSON.parse(content);
  const tables = backupData.tables;

  db.pragma('foreign_keys = OFF');

  const executeRestore = db.transaction(() => {
    // Reverse order for clearing
    const clearOrder = [...APPLICATION_TABLES].reverse();
    clearOrder.forEach(tbl => {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
      if (exists) {
        db.prepare(`DELETE FROM ${tbl}`).run();
      }
    });

    // Insert in forward dependency order
    APPLICATION_TABLES.forEach(tbl => {
      const rows = tables[tbl];
      if (!rows || rows.length === 0) return;

      const keys = Object.keys(rows[0]);
      const placeholders = keys.map(() => '?').join(', ');
      const insertStmt = db.prepare(`INSERT INTO ${tbl} (${keys.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        const values = keys.map(k => row[k]);
        insertStmt.run(...values);
      }
    });
  });

  executeRestore();
  db.pragma('foreign_keys = ON');
}

/**
 * Restore from SQL script
 */
function restoreFromSql(filepath) {
  const sql = fs.readFileSync(filepath, 'utf8');
  db.pragma('foreign_keys = OFF');
  db.exec(sql);
  db.pragma('foreign_keys = ON');
}

/**
 * Fetch restore history records
 */
function getRestoreHistory() {
  return db.prepare('SELECT * FROM restore_history ORDER BY restored_at DESC LIMIT 50').all();
}

module.exports = {
  restoreFromBackup,
  getRestoreHistory,
};

