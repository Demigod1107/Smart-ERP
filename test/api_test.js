const assert = require('assert');
const { app } = require('../server/server');

async function runApiTests() {
  console.log('\n====================================================');
  console.log('       RUNNING REST API INTEGRATION TESTS           ');
  console.log('====================================================\n');

  const { db } = require('../server/db');
  db.prepare("DELETE FROM attendance WHERE date IN ('2026-11-21', '2026-11-22')").run();
  db.prepare("DELETE FROM subjects WHERE code LIKE 'TEST-SUB-%'").run();
  db.prepare("DELETE FROM subjects WHERE code LIKE 'TEST-SUB-%'").run();

  const testServer = app.listen(0, '127.0.0.1');
  await new Promise(r => testServer.once('listening', r));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  async function test(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${desc}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${desc}`);
      console.error(`    Error: ${e.message}`);
    }
  }

  let authToken = '';

  await test('POST /api/auth/login authenticates admin and returns JWT token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.token, 'Token missing');
    assert.strictEqual(data.user.role, 'admin');
    authToken = data.token;
  });

  await test('GET /api/dashboard/stats returns real counted database metrics', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/stats?class=All`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.totalStudents >= 6, `Expected >= 6 students, got ${data.totalStudents}`);
    assert(typeof data.overallAvgRate === 'number');
    assert(data.classes.length >= 3);
  });

  await test('GET /api/dashboard/charts returns weekly trends & class comparison', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/charts?class=All`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.weeklyTrend));
    assert(Array.isArray(data.classComparison));
  });

  await test('GET /api/attendance returns student roll-call list and 5-day streaks', async () => {
    const res = await fetch(`${baseUrl}/api/attendance?class=10-A`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.students));
    assert(data.students.length > 0);
    assert(Array.isArray(data.recentDates));
    assert(data.students[0].streak);
  });

  await test('POST /api/attendance/mark records attendance with audit and notifications', async () => {
    const res = await fetch(`${baseUrl}/api/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: 1,
        date: '2026-11-21',
        status: 'Present',
        markedBy: 'Admin',
        reason: 'Automated Test',
      }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
  });

  await test('POST /api/attendance/mark-all marks entire class present', async () => {
    const res = await fetch(`${baseUrl}/api/attendance/mark-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classSec: '10-A',
        date: '2026-11-22',
        status: 'Present',
      }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
    assert(data.count >= 2);
  });

  await test('GET /api/teachers returns teacher directory', async () => {
    const res = await fetch(`${baseUrl}/api/teachers`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.teachers));
    assert(data.teachers.length >= 3);
  });

  await test('GET /api/leaves and POST /api/leaves handles student leave requests', async () => {
    const postRes = await fetch(`${baseUrl}/api/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: 2,
        applicant_role: 'parent',
        applicant_name: 'Suresh Patel',
        start_date: '2026-11-28',
        end_date: '2026-11-29',
        reason: 'Family wedding event',
      }),
    });
    const postData = await postRes.json();
    assert.strictEqual(postRes.status, 201);
    assert(postData.leaveId);

    const getRes = await fetch(`${baseUrl}/api/leaves`);
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert(getData.leaves.some(l => l.id === postData.leaveId));
  });

  await test('GET /api/ai/insights returns trend analysis and recommendations', async () => {
    const res = await fetch(`${baseUrl}/api/ai/insights`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.summary);
    assert(Array.isArray(data.insights));
  });

  await test('GET /api/ai/predictions returns risk rankings and factor explanations', async () => {
    const res = await fetch(`${baseUrl}/api/ai/predictions`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.predictions));
    assert(data.predictions.length > 0);
  });

  await test('POST /api/qr/generate creates time-bounded QR session', async () => {
    const res = await fetch(`${baseUrl}/api/qr/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classSec: '10-A', createdBy: 'Sunita Rao' }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.sessionToken);
    assert(data.expiresAt);
  });

  await test('GET /api/reports/defaulters identifies students below threshold', async () => {
    const res = await fetch(`${baseUrl}/api/reports/defaulters?threshold=75`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.defaulters));
    assert(data.defaulters.length > 0);
  });

  // ------------------------------------------------------------------
  // MODULE 1 API TESTS: SUBJECT-WISE & PERIOD ATTENDANCE
  // ------------------------------------------------------------------
  await test('GET /api/subjects & POST /api/subjects creates and lists subjects with thresholds', async () => {
    const postRes = await fetch(`${baseUrl}/api/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TEST-SUB-01',
        name: 'Robotics & AI Lab',
        type: 'Practical',
        class_sec: '10-A',
        min_attendance_pct: 80.0
      })
    });
    const postData = await postRes.json();
    assert.strictEqual(postRes.status, 201);
    assert(postData.subjectId);

    const getRes = await fetch(`${baseUrl}/api/subjects?class=10-A`);
    const getData = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert(getData.subjects.some(s => s.code === 'TEST-SUB-01'));
  });

  await test('POST /api/attendance/period-wise records period session and computes subject stats', async () => {
    const mathSub = db.prepare("SELECT id FROM subjects WHERE code = 'MATH-10A'").get();
    const res = await fetch(`${baseUrl}/api/attendance/period-wise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-11-28',
        classSec: '10-A',
        subjectId: mathSub.id,
        periodNumber: 1,
        records: [
          { studentId: 1, status: 'Present', remarks: 'Active engagement' },
          { studentId: 2, status: 'Present', remarks: 'Good' }
        ],
        conductedBy: 'Sunita Rao'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
    assert(data.sessionId);
  });

  await test('GET /api/attendance/student/:studentId/subjects returns subject performance', async () => {
    const res = await fetch(`${baseUrl}/api/attendance/student/1/subjects`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.subjects));
    assert(data.subjects.length > 0);
    const math = data.subjects.find(s => s.subjectCode === 'MATH-10A');
    assert(math, 'Math subject missing');
    assert(typeof math.percentage === 'number');
    assert(typeof math.recoverySessions === 'number');
  });

  // ------------------------------------------------------------------
  // MODULE 2 API TESTS: COMMUNICATION GATEWAY & DISPATCH LOGS
  // ------------------------------------------------------------------
  await test('GET /api/settings/communications returns masked credentials for UI', async () => {
    const res = await fetch(`${baseUrl}/api/settings/communications`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.config.email);
    assert(data.config.sms);
  });

  await test('POST /api/settings/communications/test-email tests mail gateway dispatch', async () => {
    const res = await fetch(`${baseUrl}/api/settings/communications/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testEmail: 'parent.test@example.com' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
    assert(data.logId);
  });

  await test('GET /api/notifications/dispatch-logs returns communication audit log', async () => {
    const res = await fetch(`${baseUrl}/api/notifications/dispatch-logs`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(data.logs));
    assert(data.logs.length > 0);
  });

  // ------------------------------------------------------------------
  // MODULE 3 API TESTS: DATABASE BACKUP & RESTORE
  // ------------------------------------------------------------------
  let createdBackupId = null;

  await test('POST /api/admin/backups creates SQL and JSON database snapshots', async () => {
    const res = await fetch(`${baseUrl}/api/admin/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'json', createdBy: 'API Tester' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert(data.backup);
    assert(data.backup.filename.endsWith('.json'));
    createdBackupId = data.backup.id;
  });

  await test('POST /api/admin/backups/validate verifies backup snapshot integrity', async () => {
    const res = await fetch(`${baseUrl}/api/admin/backups/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId: createdBackupId, format: 'json' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.valid, true);
  });

  await test('POST /api/admin/backups/restore executes restore with pre-restore safety snapshot', async () => {
    const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backupId: createdBackupId, restoredBy: 'API Tester' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
    assert(data.preRestoreBackup, 'Must record pre-restore safety backup');
  });

  console.log('\n====================================================');
  console.log(`   API TEST RESULTS: ${passed} / ${total} TESTS PASSED (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  db.prepare("DELETE FROM attendance WHERE date IN ('2026-11-21', '2026-11-22')").run();
  db.prepare("DELETE FROM subjects WHERE code LIKE 'TEST-SUB-%'").run();

  testServer.close();
  setTimeout(() => {
    process.exit(passed === total ? 0 : 1);
  }, 100);
}

runApiTests();
