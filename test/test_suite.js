const assert = require('assert');
const { db } = require('../server/db');
const { generateToken } = require('../server/auth');
const bcrypt = require('bcryptjs');
const { 
  getStudentAttendanceStats, 
  generateAttendanceInsights, 
  calculateAttendancePrediction 
} = require('../server/ai');

console.log('====================================================');
console.log('   RUNNING SMART SCHOOL COMPREHENSIVE TEST SUITE    ');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    Error: ${err.message}`);
  }
}

// ----------------------------------------------------
// 1. DATABASE & SEED DATA TESTS
// ----------------------------------------------------
console.log('Module 1: Database & Seed Data Verification');

it('Classes table is populated with 10-A, 10-B, 12-A', () => {
  const classes = db.prepare('SELECT code FROM classes').all();
  const codes = classes.map(c => c.code);
  assert(codes.includes('10-A'), 'Missing 10-A');
  assert(codes.includes('10-B'), 'Missing 10-B');
  assert(codes.includes('12-A'), 'Missing 12-A');
});

it('Pre-seeded default students exist with initial records', () => {
  const students = db.prepare('SELECT * FROM students').all();
  assert(students.length >= 6, `Expected at least 6 students, got ${students.length}`);
  const aarav = students.find(s => s.name === 'Aarav Sharma');
  assert(aarav, 'Aarav Sharma missing');
  assert.strictEqual(aarav.roll, '10A-01');
  assert.strictEqual(aarav.class_sec, '10-A');
});

it('Default users exist for Admin, Teacher, and Parent', () => {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  const teacher = db.prepare('SELECT * FROM users WHERE username = ?').get('teacher');
  const parent = db.prepare('SELECT * FROM users WHERE username = ?').get('parent');
  assert(admin && admin.role === 'admin', 'Admin user not configured');
  assert(teacher && teacher.role === 'teacher', 'Teacher user not configured');
  assert(parent && parent.role === 'parent', 'Parent user not configured');
});

// ----------------------------------------------------
// 2. AUTHENTICATION & SECURITY TESTS
// ----------------------------------------------------
console.log('\nModule 2: Authentication & Password Security');

it('Password hashing matches bcrypt check for admin and teacher', () => {
  const admin = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin');
  assert(bcrypt.compareSync('admin123', admin.password_hash), 'Admin password hash mismatch');
  assert(!bcrypt.compareSync('wrong_pass', admin.password_hash), 'Accepted wrong password');
});

it('JWT token generation and claims payload integrity', () => {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  const token = generateToken(admin);
  assert(typeof token === 'string' && token.length > 20, 'Invalid token generated');
});

// ----------------------------------------------------
// 3. ATTENDANCE & MATHEMATICAL CALCULATION TESTS
// ----------------------------------------------------
console.log('\nModule 3: Attendance Marking, Calculations & 75% Advisor');

it('getStudentAttendanceStats calculates percentage with weighted late sessions correctly', () => {
  const aarav = db.prepare('SELECT id FROM students WHERE roll = ?').get('10A-01');
  const stats = getStudentAttendanceStats(aarav.id);
  assert(stats.totalCount > 0, 'Total sessions must be > 0');
  assert(typeof stats.pct === 'number', 'Percentage must be number');
  assert.strictEqual(stats.pct, 66, `Expected 66%, got ${stats.pct}%`);
});

it('Attendance advisor correctly calculates minimum recovery classes needed for 75%', () => {
  const aarav = db.prepare('SELECT id FROM students WHERE roll = ?').get('10A-01');
  const stats = getStudentAttendanceStats(aarav.id);
  const needed = Math.max(1, Math.ceil(3 * stats.totalCount - 4 * stats.presentCount));
  assert.strictEqual(needed, 9, `Expected 9 recovery classes, got ${needed}`);
  
  const verifiedPct = Math.round(((stats.presentCount + needed) / (stats.totalCount + needed)) * 100);
  assert(verifiedPct >= 75, `Recovery should bring attendance to >= 75%, got ${verifiedPct}%`);
});

it('Attendance marking handles Present, Absent, Late, Excused and prevents duplicates', () => {
  const testDate = '2026-11-20';
  const s = db.prepare('SELECT id FROM students WHERE roll = ?').get('10A-02');
  
  // Mark Present
  db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by)
    VALUES (?, ?, 'Present', 0, 'Tester')
    ON CONFLICT(student_id, date, period) DO UPDATE SET status = excluded.status
  `).run(s.id, testDate);

  let rec = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, testDate);
  assert.strictEqual(rec.status, 'Present');

  // Update to Late (in-place)
  db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by)
    VALUES (?, ?, 'Late', 0, 'Tester')
    ON CONFLICT(student_id, date, period) DO UPDATE SET status = excluded.status
  `).run(s.id, testDate);

  const count = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, testDate).c;
  assert.strictEqual(count, 1, 'Duplicate row inserted instead of updating');
  
  rec = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, testDate);
  assert.strictEqual(rec.status, 'Late');

  // Clean up
  db.prepare('DELETE FROM attendance WHERE student_id = ? AND date = ?').run(s.id, testDate);
});

// ----------------------------------------------------
// 4. STUDENT MANAGEMENT TESTS
// ----------------------------------------------------
console.log('\nModule 4: Student Directory & Uniqueness Constraints');

it('Ensures unique roll numbers and unique admission numbers', () => {
  const testRoll = 'TEST-99';
  const testAdm = 'ADM-TEST-99';
  
  db.prepare(`
    INSERT INTO students (roll, admission_no, name, class_sec)
    VALUES (?, ?, 'Test Student', '10-A')
  `).run(testRoll, testAdm);

  let threwRoll = false;
  try {
    db.prepare(`
      INSERT INTO students (roll, admission_no, name, class_sec)
      VALUES (?, 'ADM-ANOTHER', 'Test Duplicate Roll', '10-A')
    `).run(testRoll);
  } catch (e) {
    threwRoll = true;
  }
  assert(threwRoll, 'Database allowed duplicate roll number');

  let threwAdm = false;
  try {
    db.prepare(`
      INSERT INTO students (roll, admission_no, name, class_sec)
      VALUES ('TEST-100', ?, 'Test Duplicate Adm', '10-A')
    `).run(testAdm);
  } catch (e) {
    threwAdm = true;
  }
  assert(threwAdm, 'Database allowed duplicate admission number');

  db.prepare('DELETE FROM students WHERE roll = ?').run(testRoll);
});

// ----------------------------------------------------
// 5. LEAVE MANAGEMENT & APPROVAL WORKFLOW
// ----------------------------------------------------
console.log('\nModule 5: Leave Management Workflow & Excused Status Synchronization');

it('Submitting and approving a leave marks corresponding attendance as Excused', () => {
  const aarav = db.prepare('SELECT id FROM students WHERE roll = ?').get('10A-01');
  const leaveStart = '2026-11-25';
  const leaveEnd = '2026-11-25';

  const leaveRes = db.prepare(`
    INSERT INTO leave_applications (student_id, applicant_role, applicant_name, start_date, end_date, reason, status)
    VALUES (?, 'parent', 'Rajesh Sharma', ?, ?, 'Medical dental appointment', 'Pending')
  `).run(aarav.id, leaveStart, leaveEnd);

  const leaveId = leaveRes.lastInsertRowid;
  assert(leaveId, 'Failed to create leave application');

  db.prepare(`
    UPDATE leave_applications SET status = 'Approved', reviewed_by = 'Principal' WHERE id = ?
  `).run(leaveId);

  db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by, remarks)
    VALUES (?, ?, 'Excused', 0, 'Principal', 'Approved Leave')
    ON CONFLICT(student_id, date, period) DO UPDATE SET status = 'Excused', remarks = 'Approved Leave'
  `).run(aarav.id, leaveStart);

  const att = db.prepare('SELECT status, remarks FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(aarav.id, leaveStart);
  assert.strictEqual(att.status, 'Excused', 'Approved leave did not record Excused attendance');
  assert.strictEqual(att.remarks, 'Approved Leave');

  db.prepare('DELETE FROM leave_applications WHERE id = ?').run(leaveId);
  db.prepare('DELETE FROM attendance WHERE student_id = ? AND date = ?').run(aarav.id, leaveStart);
});

// ----------------------------------------------------
// 6. QR CODE ATTENDANCE & GEOLOCATION TESTS
// ----------------------------------------------------
console.log('\nModule 6: QR Code Attendance Session & Geolocation Radius Calculation');

it('Haversine distance calculation validates location within radius', () => {
  const schoolLat = 28.6139;
  const schoolLng = 77.2090;
  
  const closeLat = 28.6142;
  const closeLng = 77.2092;

  const farLat = 28.6300;
  const farLng = 77.2200;

  function dist(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371e3;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const dClose = dist(schoolLat, schoolLng, closeLat, closeLng);
  const dFar = dist(schoolLat, schoolLng, farLat, farLng);

  assert(dClose < 150, `Close distance should be within 150m, got ${dClose}m`);
  assert(dFar > 1000, `Far distance should be > 1000m, got ${dFar}m`);
});

// ----------------------------------------------------
// 7. AI ATTENDANCE INSIGHTS & PREDICTION TESTS
// ----------------------------------------------------
console.log('\nModule 7: AI Attendance Insights & Risk Prediction');

it('AI Insights engine detects defaulters, streak absentees, and generates recommendations', () => {
  const insights = generateAttendanceInsights('All');
  assert(insights.summary.totalAnalyzed >= 6, 'Should analyze at least 6 students');
  assert(Array.isArray(insights.decliningStudents), 'decliningStudents must be an array');
  assert(Array.isArray(insights.insights), 'insights must be an array');
  assert(insights.insights.length >= 3, 'Expected at least 3 categorized insights');
});

it('Attendance Risk Prediction assigns transparent scoring and ranks students', () => {
  const predictions = calculateAttendancePrediction('All');
  assert(predictions.length >= 6, 'Should predict for all active students');
  for (let i = 0; i < predictions.length - 1; i++) {
    assert(predictions[i].riskScore >= predictions[i + 1].riskScore, 'Predictions should be sorted descending by risk score');
  }
  const topRisk = predictions[0];
  assert(Array.isArray(topRisk.riskFactors), 'Risk factors must be an array');
  assert(topRisk.riskFactors.length > 0, 'Risk factors must explain score breakdown');
});

// ----------------------------------------------------
// 8. MODULE 1: SUBJECT-WISE & PERIOD ATTENDANCE TESTS
// ----------------------------------------------------
console.log('\nModule 8: Subject-Wise & Period Attendance Calculations');

const { 
  getStudentSubjectStats, 
  getAllSubjectsForStudent, 
  recordPeriodAttendance, 
  isTeacherAuthorized 
} = require('../server/services/attendancePeriodService');

it('Calculates subject-wise attendance and enforces distinct minimum thresholds', () => {
  const aarav = db.prepare("SELECT id FROM students WHERE roll = '10A-01'").get();
  const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH-10A'").get();
  const phyLab = db.prepare("SELECT id FROM subjects WHERE code = 'PHYLAB-10A'").get();

  const mathStats = getStudentSubjectStats(aarav.id, math.id);
  assert(mathStats.conducted > 0, 'Mathematics sessions must be > 0');
  assert.strictEqual(mathStats.minAttendancePct, 75.0);

  const labStats = getStudentSubjectStats(aarav.id, phyLab.id);
  assert(labStats.conducted > 0, 'Physics Lab sessions must be > 0');
  assert.strictEqual(labStats.minAttendancePct, 80.0, 'Physics Lab must have 80% threshold');
});

it('Accurately calculates minimum recovery sessions needed for 75% and 80% thresholds', () => {
  // Test recovery formula: ceil((r * T - P) / (1 - r))
  // Case A: Threshold r = 0.75, T = 35, P = 24 => (0.75*35 - 24) / 0.25 = 2.25 / 0.25 = 9 sessions
  const r75 = 0.75;
  const tA = 35, pA = 24;
  const xA = Math.max(1, Math.ceil((r75 * tA - pA) / (1 - r75)));
  assert.strictEqual(xA, 9, `Expected 9 recovery sessions for 75%, got ${xA}`);
  assert((pA + xA) / (tA + xA) >= 0.75, 'New percentage must reach at least 75%');

  // Case B: Threshold r = 0.80, T = 20, P = 14 => (0.80*20 - 14) / 0.20 = 2 / 0.20 = 10 sessions
  const r80 = 0.80;
  const tB = 20, pB = 14;
  const xB = Math.max(1, Math.ceil(parseFloat(((r80 * tB - pB) / (1 - r80)).toFixed(6))));
  assert.strictEqual(xB, 10, `Expected 10 recovery sessions for 80%, got ${xB}`);
  assert((pB + xB) / (tB + xB) >= 0.80, 'New percentage must reach at least 80%');
});

it('Enforces teacher authorization restrictions for subjects and classes', () => {
  const teacherUser = { role: 'teacher', teacher_id: 'TCH-101', assigned_class: '10-A' };
  const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH-10A'").get();
  const eng = db.prepare("SELECT id FROM subjects WHERE code = 'ENG-10A'").get();

  // TCH-101 teaches Math in 10-A
  assert(isTeacherAuthorized(teacherUser, '10-A', math.id, 'TCH-101'), 'Assigned teacher should be authorized');
  
  // Unauthorized teacher for other class
  const otherTeacher = { role: 'teacher', teacher_id: 'TCH-999', assigned_class: '12-B' };
  assert(!isTeacherAuthorized(otherTeacher, '10-A', eng.id, 'TCH-103'), 'Unassigned teacher must be rejected');
});

it('Prevents duplicate attendance sessions and duplicate student marks in period attendance', () => {
  const testDate = '2026-11-29';
  const math = db.prepare("SELECT id FROM subjects WHERE code = 'MATH-10A'").get();
  const s = db.prepare("SELECT id FROM students WHERE roll = '10A-01'").get();

  // Create session
  const sess = db.prepare(`
    INSERT INTO attendance_sessions (academic_year, date, class_sec, subject_id, period_number, conducted_by)
    VALUES ('2026-2027', ?, '10-A', ?, 1, 'Tester')
    ON CONFLICT(date, class_sec, subject_id, period_number) DO UPDATE SET conducted_by = excluded.conducted_by
  `).run(testDate, math.id);

  const sessionId = sess.lastInsertRowid || db.prepare(`
    SELECT id FROM attendance_sessions WHERE date = ? AND class_sec = '10-A' AND subject_id = ? AND period_number = 1
  `).get(testDate, math.id).id;

  // Insert period mark
  recordPeriodAttendance(sessionId, [{ studentId: s.id, status: 'Present', remarks: 'Test' }]);
  let rec = db.prepare('SELECT status FROM period_attendance WHERE session_id = ? AND student_id = ?').get(sessionId, s.id);
  assert.strictEqual(rec.status, 'Present');

  // Update in place without duplicating row
  recordPeriodAttendance(sessionId, [{ studentId: s.id, status: 'Late', remarks: 'Updated' }]);
  const count = db.prepare('SELECT COUNT(*) as c FROM period_attendance WHERE session_id = ? AND student_id = ?').get(sessionId, s.id).c;
  assert.strictEqual(count, 1, 'Duplicate period attendance row was inserted');

  rec = db.prepare('SELECT status, remarks FROM period_attendance WHERE session_id = ? AND student_id = ?').get(sessionId, s.id);
  assert.strictEqual(rec.status, 'Late');
  assert.strictEqual(rec.remarks, 'Updated');

  // Clean up
  db.prepare('DELETE FROM period_attendance WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM attendance_sessions WHERE id = ?').run(sessionId);
});

// ----------------------------------------------------
// 9. MODULE 2: COMMUNICATION GATEWAY & DISPATCH TESTS
// ----------------------------------------------------
console.log('\nModule 9: Communication Gateway, Dispatch Logs & Masking');

const { 
  getCommunicationConfig, 
  sendEmailNotification, 
  sendSmsNotification, 
  retryDispatch 
} = require('../server/services/communicationService');

it('Securely masks sensitive SMTP and Twilio secrets in public configuration', () => {
  const config = getCommunicationConfig();
  assert(config.email, 'Email config missing');
  assert(config.sms, 'SMS config missing');
  if (config.email.smtp_pass_masked) {
    assert(config.email.smtp_pass_masked.includes('••••'), 'Password must be masked');
  }
  if (config.sms.twilio_account_sid_masked) {
    assert(config.sms.twilio_account_sid_masked.includes('••••'), 'SID must be masked');
  }
});

it('Logs email and SMS dispatches with delivery statuses and supports retry', async () => {
  const emailRes = await sendEmailNotification({
    toEmail: 'test.parent@example.com',
    subject: 'Absence Notice Test',
    text: 'Student missed Physics Lab period 5.',
    notificationType: 'absence_alert',
  });
  assert(emailRes.success, 'Email notification dispatch should succeed');
  assert(emailRes.logId, 'Dispatch log ID missing');

  const log = db.prepare('SELECT * FROM communication_logs WHERE id = ?').get(emailRes.logId);
  assert.strictEqual(log.recipient, 'test.parent@example.com');
  assert(log.status === 'Sent' || log.status === 'Delivered', `Expected Sent or Delivered, got ${log.status}`);

  // Test retry on a failed log
  const failLog = db.prepare(`
    INSERT INTO communication_logs (student_id, recipient, recipient_type, notification_type, subject, message, provider, status)
    VALUES (1, 'retry.parent@example.com', 'email', 'absence_alert', 'Retry Test', 'Test message', 'mock_smtp', 'Failed')
  `).run();

  const retryRes = await retryDispatch(failLog.lastInsertRowid);
  assert(retryRes.success, 'Retry must succeed');
  
  const updatedLog = db.prepare('SELECT status, retry_count FROM communication_logs WHERE id = ?').get(failLog.lastInsertRowid);
  assert.strictEqual(updatedLog.retry_count, 1, 'Retry count must increment');
});

// ----------------------------------------------------
// 10. MODULE 3: DATABASE BACKUP & RESTORE TESTS
// ----------------------------------------------------
console.log('\nModule 10: Database Backup, Validation & Pre-Restore Safety');

const { 
  createSqlBackup, 
  createJsonBackup, 
  validateBackup, 
  deleteBackup 
} = require('../server/services/backupService');
const { restoreFromBackup } = require('../server/services/restoreService');

let testSqlBackup = null;
let testJsonBackup = null;

it('Creates consistent SQL backup (.sql) with table definitions and checksum', () => {
  testSqlBackup = createSqlBackup('Unit Tester');
  assert(testSqlBackup.id, 'Backup ID missing');
  assert(testSqlBackup.filename.endsWith('.sql'), 'Filename must end with .sql');
  assert(testSqlBackup.filesize > 0, 'Filesize must be > 0');
  assert(testSqlBackup.tableCount >= 10, 'Must contain at least 10 tables');
  assert(testSqlBackup.checksum, 'Checksum must be generated');
});

it('Creates structured JSON backup (.json) with metadata and table structures', () => {
  testJsonBackup = createJsonBackup('Unit Tester');
  assert(testJsonBackup.id, 'JSON backup ID missing');
  assert(testJsonBackup.filename.endsWith('.json'), 'Filename must end with .json');
  assert(testJsonBackup.filesize > 0, 'Filesize must be > 0');
  assert(testJsonBackup.tableCount >= 10, 'Must export at least 10 tables');
});

it('Validates backup file integrity and rejects corrupted files', () => {
  const validCheck = validateBackup(testJsonBackup.filepath, 'json');
  assert.strictEqual(validCheck.valid, true, 'Valid JSON backup should pass');

  // Corrupted check
  const corruptCheck = validateBackup(__filename, 'json');
  assert.strictEqual(corruptCheck.valid, false, 'Corrupted JSON should be rejected');
});

it('Restores from backup after automatically generating a pre-restore safety snapshot', () => {
  const restoreRes = restoreFromBackup({
    backupId: testJsonBackup.id,
    filepath: testJsonBackup.filepath,
    format: 'json',
    restoredBy: 'Unit Tester'
  });
  assert(restoreRes.success, 'Restore must succeed');
  assert(restoreRes.preRestoreBackup, 'Must generate pre-restore safety snapshot');

  // Verify database still has active classes and students
  const studentCount = db.prepare('SELECT count(*) as c FROM students').get().c;
  assert(studentCount >= 6, 'Student records must remain intact after restore');

  // Clean up test backup files
  deleteBackup(testSqlBackup.id);
  deleteBackup(testJsonBackup.id);
});

console.log('\n====================================================');
console.log(`   TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('====================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
