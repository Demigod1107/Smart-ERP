const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const GITHUB_TOKEN = process.env.GITHUB_SYNC_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Demigod1107/Smart-ERP';
const CLOUD_FILE_PATH = 'data/cloud_db.json';

let lastSyncTimestamp = null;
let lastKnownSha = null;
let syncInProgress = false;

const SYNCED_TABLES = [
  'classes',
  'users',
  'teachers',
  'students',
  'subjects',
  'subject_enrollments',
  'periods',
  'timetable',
  'attendance',
  'attendance_sessions',
  'period_attendance',
  'leaves',
  'notifications',
  'communication_logs'
];

/**
 * Serializes the SQLite database into a clean JSON object
 */
function dumpDatabase() {
  const data = {
    version: '4.5.0',
    exportedAt: new Date().toISOString(),
    tables: {}
  };

  for (const table of SYNCED_TABLES) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      data.tables[table] = rows;
    } catch (err) {
      // Table might not exist yet
      data.tables[table] = [];
    }
  }

  return data;
}

/**
 * Hydrates the SQLite database from a JSON object
 */
function restoreDatabase(data) {
  if (!data || !data.tables) return false;

  const insertTx = db.transaction(() => {
    for (const table of SYNCED_TABLES) {
      const rows = data.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const sample = rows[0];
      const cols = Object.keys(sample);
      const placeholders = cols.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);

      for (const row of rows) {
        const values = cols.map(c => row[c] !== undefined ? row[c] : null);
        try {
          stmt.run(...values);
        } catch (e) {
          // Ignore individual constraint skip
        }
      }
    }
  });

  try {
    insertTx();
    return true;
  } catch (err) {
    console.error('Failed to hydrate SQLite from JSON:', err.message);
    return false;
  }
}

/**
 * Downloads the latest persistent database from GitHub
 */
async function pullFromCloud() {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    // If running locally, check if local file exists
    const localFallback = path.join(__dirname, '..', '..', 'data', 'cloud_db.json');
    if (fs.existsSync(localFallback)) {
      try {
        const raw = fs.readFileSync(localFallback, 'utf8');
        restoreDatabase(JSON.parse(raw));
        return { success: true, source: 'local_file' };
      } catch (e) {}
    }
    return { success: false, reason: 'No GitHub credentials configured' };
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CLOUD_FILE_PATH}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Smart-ERP-Sync',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 404) {
      // File doesn't exist yet in repo, push initial state!
      console.log('No cloud_db.json found in repository, initializing on GitHub...');
      await pushToCloud('chore(data): initialize cloud attendance database');
      return { success: true, initialized: true };
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn('GitHub pull response error:', res.status, errText);
      return { success: false, status: res.status };
    }

    const json = await res.json();
    lastKnownSha = json.sha;

    const contentBuffer = Buffer.from(json.content, 'base64');
    const dbData = JSON.parse(contentBuffer.toString('utf8'));

    const restored = restoreDatabase(dbData);
    lastSyncTimestamp = new Date().toISOString();
    console.log('✓ Successfully synchronized database from GitHub Cloud Storage');
    return { success: restored, sha: lastKnownSha, timestamp: lastSyncTimestamp };
  } catch (err) {
    console.warn('Failed to pull from GitHub Cloud:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Commits the current SQLite database to GitHub
 */
async function pushToCloud(commitMsg = 'chore(data): auto-sync attendance records [skip ci]') {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    // Save locally
    try {
      const dataDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'cloud_db.json'), JSON.stringify(dumpDatabase(), null, 2));
      return { success: true, destination: 'local_disk' };
    } catch (e) {
      return { success: false, reason: 'No GitHub sync configured' };
    }
  }

  if (syncInProgress) return { queued: true };
  syncInProgress = true;

  try {
    const dump = dumpDatabase();
    const content = Buffer.from(JSON.stringify(dump, null, 2)).toString('base64');
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CLOUD_FILE_PATH}`;

    // Get latest SHA if we don't have it
    if (!lastKnownSha) {
      const checkRes = await fetch(url, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'Smart-ERP-Sync'
        }
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        lastKnownSha = checkData.sha;
      }
    }

    const payload = {
      message: commitMsg,
      content,
      branch: 'main'
    };
    if (lastKnownSha) {
      payload.sha = lastKnownSha;
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Smart-ERP-Sync',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      lastKnownSha = data.content ? data.content.sha : null;
      lastSyncTimestamp = new Date().toISOString();
      console.log('✓ Successfully saved database snapshot to GitHub Cloud:', lastSyncTimestamp);
      return { success: true, sha: lastKnownSha, timestamp: lastSyncTimestamp };
    } else {
      const err = await res.text();
      // If SHA conflict, clear and retry once
      lastKnownSha = null;
      console.warn('GitHub push failed, will retry on next write:', err);
      return { success: false, error: err };
    }
  } catch (err) {
    console.warn('Exception during GitHub push:', err.message);
    return { success: false, error: err.message };
  } finally {
    syncInProgress = false;
  }
}

// Debounced background push
let debounceTimer = null;
function triggerAutoSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    pushToCloud().catch(() => {});
  }, 2000);
}

function getSyncStatus() {
  return {
    enabled: Boolean(GITHUB_TOKEN && GITHUB_REPO),
    repo: GITHUB_REPO,
    cloudFile: `https://github.com/${GITHUB_REPO}/blob/main/${CLOUD_FILE_PATH}`,
    lastSync: lastSyncTimestamp || 'Not synced yet',
    mode: GITHUB_TOKEN ? '24/7 Cloud Git Persistence' : 'Local Persistence'
  };
}

module.exports = {
  dumpDatabase,
  restoreDatabase,
  pullFromCloud,
  pushToCloud,
  triggerAutoSave,
  getSyncStatus
};
