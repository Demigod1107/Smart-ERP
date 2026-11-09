const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('./db');
const { generateToken, authenticate, authorize } = require('./auth');
const { 
  getStudentAttendanceStats, 
  generateAttendanceInsights, 
  calculateAttendancePrediction 
} = require('./ai');

const { 
  getStudentSubjectStats, 
  getAllSubjectsForStudent, 
  recordPeriodAttendance, 
  isTeacherAuthorized 
} = require('./services/attendancePeriodService');

const { 
  getCommunicationConfig, 
  sendEmailNotification, 
  sendSmsNotification, 
  triggerPeriodAbsenceAlert, 
  triggerSubjectDefaulterAlert, 
  retryDispatch 
} = require('./services/communicationService');

const { 
  createSqlBackup, 
  createJsonBackup, 
  validateBackup, 
  getBackupHistory, 
  deleteBackup,
  BACKUP_DIR 
} = require('./services/backupService');

const { 
  restoreFromBackup, 
  getRestoreHistory 
} = require('./services/restoreService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static files from workspace root
app.use(express.static(path.join(__dirname, '..')));

// Helper: Format Date
const fmtDate = (d) => {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().split('T')[0];
};

// Helper: Log Attendance Audit
function logAudit(studentId, date, oldStatus, newStatus, changedBy, reason = 'Direct update') {
  try {
    db.prepare(`
      INSERT INTO attendance_audit (student_id, date, old_status, new_status, changed_by, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, date, oldStatus, newStatus, changedBy, reason);
  } catch (e) {
    console.error('Audit logging error:', e.message);
  }
}

// Helper: Send in-app notification
function createNotification(userId, studentId, type, title, message) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, student_id, type, title, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, studentId, type, title, message);
  } catch (e) {
    console.error('Notification creation error:', e.message);
  }
}

// -------------------------------------------------------------
// 1. AUTHENTICATION API
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      linked_student_id: user.linked_student_id,
      teacher_id: user.teacher_id,
    },
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, role, name, email, phone, linked_student_id, teacher_id FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// -------------------------------------------------------------
// 2. DASHBOARD & STATS API
// -------------------------------------------------------------
app.get('/api/dashboard/stats', (req, res) => {
  const classSec = req.query.class || 'All';
  const selectedDate = req.query.date || fmtDate(new Date());

  let studentQuery = "SELECT * FROM students WHERE status = 'Active'";
  let studentParams = [];
  if (classSec !== 'All') {
    studentQuery += ' AND class_sec = ?';
    studentParams.push(classSec);
  }
  const students = db.prepare(studentQuery).all(...studentParams);
  const totalStudents = students.length;

  const totalTeachers = db.prepare("SELECT COUNT(*) as c FROM teachers WHERE status = 'Active'").get().c;
  const classes = db.prepare('SELECT * FROM classes ORDER BY code ASC').all();

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let defaulterCount = 0;
  let totalPctSum = 0;

  students.forEach(s => {
    const stats = getStudentAttendanceStats(s.id);
    if (stats.pct < 75) defaulterCount++;
    totalPctSum += stats.pct;

    const dayRecord = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, selectedDate);
    if (dayRecord) {
      if (dayRecord.status === 'Present') presentCount++;
      else if (dayRecord.status === 'Absent') absentCount++;
      else if (dayRecord.status === 'Late') lateCount++;
      else if (dayRecord.status === 'Excused') excusedCount++;
    }
  });

  const overallAvgRate = totalStudents > 0 ? Math.round(totalPctSum / totalStudents) : 0;
  const todayMarkedTotal = presentCount + absentCount + lateCount + excusedCount;
  const todayRate = todayMarkedTotal > 0 ? Math.round(((presentCount + lateCount * 0.5 + excusedCount) / todayMarkedTotal) * 100) : 0;

  // Additional metrics for Module 4 integration
  const todayPeriodAttendanceCount = db.prepare(`
    SELECT COUNT(*) as c FROM period_attendance pa 
    JOIN attendance_sessions s ON pa.session_id = s.id 
    WHERE s.date = ?
  `).get(selectedDate)?.c || 0;

  let subjectDefaultersCount = 0;
  students.forEach(s => {
    const subStats = getAllSubjectsForStudent(s.id);
    if (subStats && subStats.defaulterSubjectsCount > 0) {
      subjectDefaultersCount++;
    }
  });

  const pendingCommAlertsCount = db.prepare("SELECT COUNT(*) as c FROM communication_logs WHERE status = 'Queued'").get()?.c || 0;
  const failedCommCount = db.prepare("SELECT COUNT(*) as c FROM communication_logs WHERE status = 'Failed'").get()?.c || 0;

  const lastBackupRow = db.prepare("SELECT created_at, filename FROM backup_history WHERE status = 'Valid' ORDER BY created_at DESC LIMIT 1").get();
  const lastBackup = lastBackupRow ? lastBackupRow.created_at : null;
  const backupHealth = lastBackup ? 'Operational / Verified' : 'Initial (No Manual Backup)';

  res.json({
    totalStudents,
    totalTeachers,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    todayMarkedTotal,
    overallAvgRate,
    todayRate,
    defaulterCount,
    eligibleCount: totalStudents - defaulterCount,
    todayPeriodAttendanceCount,
    subjectDefaultersCount,
    pendingCommAlertsCount,
    failedCommCount,
    lastBackup,
    backupHealth,
    classes,
    selectedDate,
  });
});

app.get('/api/dashboard/charts', (req, res) => {
  const classSec = req.query.class || 'All';

  // 1. Weekly Attendance Trends (Past 7 distinct dates with attendance recorded)
  const pastDates = db.prepare(`
    SELECT DISTINCT date FROM attendance 
    ORDER BY date DESC LIMIT 7
  `).all().map(r => r.date).reverse();

  let studentFilter = "WHERE status = 'Active'";
  let studentParams = [];
  if (classSec !== 'All') {
    studentFilter += ' AND class_sec = ?';
    studentParams.push(classSec);
  }
  const students = db.prepare(`SELECT id, class_sec FROM students ${studentFilter}`).all(...studentParams);
  const studentIds = students.map(s => s.id);

  const weeklyTrend = pastDates.map(date => {
    if (studentIds.length === 0) return { date, rate: 0, present: 0, absent: 0, late: 0 };
    const placeholders = studentIds.map(() => '?').join(',');
    const records = db.prepare(`
      SELECT status, COUNT(*) as cnt 
      FROM attendance 
      WHERE date = ? AND student_id IN (${placeholders}) AND period = 0 
      GROUP BY status
    `).all(date, ...studentIds);

    let p = 0, a = 0, l = 0, e = 0;
    records.forEach(r => {
      if (r.status === 'Present') p = r.cnt;
      if (r.status === 'Absent') a = r.cnt;
      if (r.status === 'Late') l = r.cnt;
      if (r.status === 'Excused') e = r.cnt;
    });
    const tot = p + a + l + e;
    const rate = tot > 0 ? Math.round(((p + l * 0.5 + e) / tot) * 100) : 0;
    return { date, rate, present: p, absent: a, late: l, excused: e };
  });

  // 2. Class-wise Comparison
  const allClasses = db.prepare('SELECT code FROM classes ORDER BY code ASC').all();
  const classComparison = allClasses.map(cls => {
    const clsStudents = db.prepare("SELECT id FROM students WHERE class_sec = ? AND status = 'Active'").all(cls.code);
    if (clsStudents.length === 0) return { classSec: cls.code, rate: 0, studentCount: 0 };

    let sumPct = 0;
    clsStudents.forEach(st => {
      const stats = getStudentAttendanceStats(st.id);
      sumPct += stats.pct;
    });
    return {
      classSec: cls.code,
      rate: Math.round(sumPct / clsStudents.length),
      studentCount: clsStudents.length,
    };
  });

  // 3. Status Distribution (overall)
  let distQuery = `
    SELECT a.status, COUNT(*) as count 
    FROM attendance a 
    JOIN students s ON a.student_id = s.id 
    WHERE a.period = 0 AND s.status = 'Active'
  `;
  let distParams = [];
  if (classSec !== 'All') {
    distQuery += ' AND s.class_sec = ?';
    distParams.push(classSec);
  }
  distQuery += ' GROUP BY a.status';
  const distributionRows = db.prepare(distQuery).all(...distParams);

  res.json({
    weeklyTrend,
    classComparison,
    distribution: distributionRows,
  });
});

// -------------------------------------------------------------
// 3. ATTENDANCE MANAGEMENT API
// -------------------------------------------------------------
app.get('/api/attendance', (req, res) => {
  const classSec = req.query.class || 'All';
  const selectedDate = req.query.date || fmtDate(new Date());
  const period = parseInt(req.query.period || '0', 10);
  const search = (req.query.search || '').trim().toLowerCase();
  const filterStatus = req.query.status || 'All';

  let studentQuery = "SELECT * FROM students WHERE status = 'Active'";
  let studentParams = [];
  if (classSec !== 'All') {
    studentQuery += ' AND class_sec = ?';
    studentParams.push(classSec);
  }
  let students = db.prepare(studentQuery).all(...studentParams);

  // Distinct recent 5 dates
  const recentDates = db.prepare(`
    SELECT DISTINCT date FROM attendance 
    ORDER BY date DESC LIMIT 5
  `).all().map(r => r.date).reverse();

  if (!recentDates.includes(selectedDate)) {
    recentDates.push(selectedDate);
    if (recentDates.length > 5) recentDates.shift();
  }

  const result = [];

  students.forEach(s => {
    if (search && !s.name.toLowerCase().includes(search) && !s.roll.toLowerCase().includes(search)) {
      return;
    }

    const currentRec = db.prepare(`
      SELECT status, remarks, updated_at 
      FROM attendance 
      WHERE student_id = ? AND date = ? AND period = ?
    `).get(s.id, selectedDate, period);

    const currentStatus = currentRec ? currentRec.status : 'Unmarked';
    const stats = getStudentAttendanceStats(s.id);

    // Filter check
    let matchesFilter = true;
    if (filterStatus === 'AtRisk') {
      matchesFilter = stats.pct < 75;
    } else if (filterStatus !== 'All') {
      matchesFilter = currentStatus === filterStatus;
    }

    if (!matchesFilter) return;

    // Get trend across recent 5 dates
    const streak = recentDates.map(d => {
      const rec = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, d);
      return { date: d, status: rec ? rec.status : 'Unmarked' };
    });

    // 75% Goal calculation
    let adviceText = '';
    let adviceType = 'safe';
    if (stats.pct < 75) {
      const needed = Math.max(1, Math.ceil(3 * stats.totalCount - 4 * stats.presentCount));
      adviceText = `⚠️ Need next ${needed} classes for 75%`;
      adviceType = 'danger';
    } else {
      const canMiss = Math.floor((4 * stats.presentCount - 3 * stats.totalCount) / 3);
      if (canMiss > 0) {
        adviceText = `✓ Safe to miss ${canMiss} class${canMiss > 1 ? 'es' : ''}`;
        adviceType = 'safe';
      } else {
        adviceText = `⚡ Borderline: Cannot miss any`;
        adviceType = 'warning';
      }
    }

    result.push({
      id: s.id,
      roll: s.roll,
      name: s.name,
      classSec: s.class_sec,
      phone: s.parent_phone,
      parentName: s.parent_name,
      currentStatus,
      stats: {
        present: stats.presentCount,
        total: stats.totalCount,
        pct: stats.pct,
      },
      streak,
      advice: { text: adviceText, type: adviceType },
    });
  });

  res.json({
    students: result,
    recentDates,
    selectedDate,
    period,
  });
});

app.post('/api/attendance/mark', (req, res) => {
  const { studentId, date, status, period = 0, remarks = '', markedBy = 'User', reason = 'Direct update' } = req.body;
  if (!studentId || !date || !status) {
    return res.status(400).json({ error: 'Student ID, date, and status are required.' });
  }

  const validStatuses = ['Present', 'Absent', 'Late', 'Excused'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const existing = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = ?').get(studentId, date, period);
  const oldStatus = existing ? existing.status : 'Unmarked';

  db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by, remarks, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, date, period) DO UPDATE SET
      status = excluded.status,
      marked_by = excluded.marked_by,
      remarks = excluded.remarks,
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, date, status, period, markedBy, remarks);

  // Log audit
  logAudit(studentId, date, oldStatus, status, markedBy, reason);

  // If marked absent, auto-create notification for linked parent
  if (status === 'Absent') {
    const student = db.prepare('SELECT name, roll, class_sec FROM students WHERE id = ?').get(studentId);
    const parentUser = db.prepare('SELECT id FROM users WHERE linked_student_id = ?').get(studentId);
    if (student) {
      createNotification(
        parentUser ? parentUser.id : null,
        studentId,
        'absence',
        `Absence Alert: ${student.name}`,
        `${student.name} (${student.roll}) was marked Absent on ${date}.`
      );
    }
  }

  // Check 75% threshold alert
  const stats = getStudentAttendanceStats(studentId);
  if (stats && stats.pct < 75) {
    const student = stats.student;
    const parentUser = db.prepare('SELECT id FROM users WHERE linked_student_id = ?').get(studentId);
    createNotification(
      parentUser ? parentUser.id : null,
      studentId,
      'defaulter',
      `75% Threshold Alert: ${student.name}`,
      `Attendance for ${student.name} is now at ${stats.pct}%, below the mandatory 75% minimum threshold.`
    );
  }

  res.json({ success: true, studentId, date, status });
});

app.post('/api/attendance/mark-all', (req, res) => {
  const { classSec = 'All', date, status = 'Present', period = 0, markedBy = 'User' } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  let query = "SELECT id FROM students WHERE status = 'Active'";
  let params = [];
  if (classSec !== 'All') {
    query += ' AND class_sec = ?';
    params.push(classSec);
  }
  const students = db.prepare(query).all(...params);

  const markStmt = db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, date, period) DO UPDATE SET
      status = excluded.status,
      marked_by = excluded.marked_by,
      updated_at = CURRENT_TIMESTAMP
  `);

  const markMany = db.transaction((list) => {
    list.forEach(s => {
      markStmt.run(s.id, date, status, period, markedBy);
      logAudit(s.id, date, 'Previous', status, markedBy, `Bulk mark all ${status}`);
    });
  });

  markMany(students);
  res.json({ success: true, count: students.length, status, date });
});

app.post('/api/attendance/reset', (req, res) => {
  const { classSec = 'All', date, period = 0 } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  let query = 'DELETE FROM attendance WHERE date = ? AND period = ?';
  let params = [date, period];
  if (classSec !== 'All') {
    query += ' AND student_id IN (SELECT id FROM students WHERE class_sec = ?)';
    params.push(classSec);
  }
  const info = db.prepare(query).run(...params);
  res.json({ success: true, deleted: info.changes });
});

// Monthly calendar attendance for a student
app.get('/api/attendance/calendar/:studentId', (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const year = req.query.year || new Date().getFullYear().toString();
  const month = req.query.month ? req.query.month.padStart(2, '0') : (new Date().getMonth() + 1).toString().padStart(2, '0');
  const monthPrefix = `${year}-${month}`;

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  // Get records for that month
  const records = db.prepare(`
    SELECT date, status, remarks 
    FROM attendance 
    WHERE student_id = ? AND period = 0 AND date LIKE ? 
    ORDER BY date ASC
  `).all(studentId, `${monthPrefix}%`);

  // Get holidays for that month
  const holidays = db.prepare(`
    SELECT date, name, type 
    FROM holidays 
    WHERE date LIKE ?
  `).all(`${monthPrefix}%`);

  const stats = getStudentAttendanceStats(studentId);

  res.json({
    student,
    year,
    month,
    records,
    holidays,
    overallStats: {
      present: stats.presentCount,
      total: stats.totalCount,
      pct: stats.pct,
    },
  });
});

// Full attendance history with audit records
app.get('/api/attendance/history/:studentId', (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const records = db.prepare(`
    SELECT date, status, period, remarks, updated_at 
    FROM attendance 
    WHERE student_id = ? 
    ORDER BY date DESC, period ASC
  `).all(studentId);

  const audits = db.prepare(`
    SELECT date, old_status, new_status, changed_by, timestamp, reason 
    FROM attendance_audit 
    WHERE student_id = ? 
    ORDER BY timestamp DESC LIMIT 20
  `).all(studentId);

  const stats = getStudentAttendanceStats(studentId);

  res.json({
    student,
    records,
    audits,
    stats,
  });
});

// -------------------------------------------------------------
// 4. STUDENT MANAGEMENT API
// -------------------------------------------------------------
app.get('/api/students', (req, res) => {
  const classSec = req.query.class || 'All';
  const search = (req.query.search || '').trim().toLowerCase();
  const status = req.query.status || 'Active';

  let query = 'SELECT * FROM students WHERE 1=1';
  let params = [];

  if (status !== 'All') {
    query += ' AND status = ?';
    params.push(status);
  }
  if (classSec !== 'All') {
    query += ' AND class_sec = ?';
    params.push(classSec);
  }

  const rows = db.prepare(query).all(...params);
  const students = rows.filter(s => {
    if (!search) return true;
    return s.name.toLowerCase().includes(search) || 
           s.roll.toLowerCase().includes(search) || 
           s.admission_no.toLowerCase().includes(search);
  }).map(s => {
    const stats = getStudentAttendanceStats(s.id);
    return {
      ...s,
      presentDays: stats.presentCount,
      totalDays: stats.totalCount,
      pct: stats.pct,
    };
  });

  res.json({ students });
});

app.get('/api/students/:id', (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const stats = getStudentAttendanceStats(studentId);
  const recentRecords = db.prepare(`
    SELECT date, status, period, remarks 
    FROM attendance 
    WHERE student_id = ? AND period = 0 
    ORDER BY date DESC LIMIT 30
  `).all(studentId);

  const leaves = db.prepare(`
    SELECT * FROM leave_applications 
    WHERE student_id = ? 
    ORDER BY created_at DESC
  `).all(studentId);

  res.json({
    student,
    stats,
    recentRecords,
    leaves,
  });
});

app.post('/api/students', (req, res) => {
  const {
    roll, admission_no, name, dob, gender, class_sec,
    parent_name, parent_phone, parent_email, address,
    admission_date, photo_url, base_present = 18, base_total = 20
  } = req.body;

  if (!roll || !name || !class_sec) {
    return res.status(400).json({ error: 'Roll number, Name, and Class & Section are required.' });
  }

  const cleanRoll = roll.trim().toUpperCase();
  const cleanAdm = (admission_no || `ADM-${Date.now().toString().slice(-6)}`).trim().toUpperCase();

  const check = db.prepare('SELECT id FROM students WHERE roll = ? OR admission_no = ?').get(cleanRoll, cleanAdm);
  if (check) {
    return res.status(400).json({ error: 'Roll number or Admission number already exists.' });
  }

  const result = db.prepare(`
    INSERT INTO students (
      roll, admission_no, name, dob, gender, class_sec,
      parent_name, parent_phone, parent_email, address,
      admission_date, photo_url, base_present, base_total, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
  `).run(
    cleanRoll, cleanAdm, name.trim(), dob || null, gender || 'Not Specified', class_sec,
    parent_name || null, parent_phone || null, parent_email || null, address || null,
    admission_date || fmtDate(new Date()), photo_url || null, base_present, base_total
  );

  res.status(201).json({ success: true, studentId: result.lastInsertRowid });
});

app.put('/api/students/:id', (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const {
    roll, admission_no, name, dob, gender, class_sec,
    parent_name, parent_phone, parent_email, address,
    photo_url, status
  } = req.body;

  const existing = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!existing) return res.status(404).json({ error: 'Student not found' });

  db.prepare(`
    UPDATE students SET
      roll = COALESCE(?, roll),
      admission_no = COALESCE(?, admission_no),
      name = COALESCE(?, name),
      dob = COALESCE(?, dob),
      gender = COALESCE(?, gender),
      class_sec = COALESCE(?, class_sec),
      parent_name = COALESCE(?, parent_name),
      parent_phone = COALESCE(?, parent_phone),
      parent_email = COALESCE(?, parent_email),
      address = COALESCE(?, address),
      photo_url = COALESCE(?, photo_url),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(
    roll ? roll.toUpperCase() : null,
    admission_no ? admission_no.toUpperCase() : null,
    name, dob, gender, class_sec, parent_name, parent_phone, parent_email, address, photo_url, status,
    studentId
  );

  res.json({ success: true, message: 'Student updated successfully' });
});

app.delete('/api/students/:id', (req, res) => {
  const studentId = parseInt(req.params.id, 10);
  const info = db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
  if (info.changes === 0) return res.status(404).json({ error: 'Student not found' });
  res.json({ success: true, message: 'Student deleted successfully' });
});

// Bulk CSV Import
app.post('/api/students/import-csv', (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: 'CSV data is required.' });

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV must contain headers and at least one student row.' });

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
  let inserted = 0;
  let skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO students (
      roll, admission_no, name, dob, gender, class_sec,
      parent_name, parent_phone, parent_email, address,
      admission_date, status, base_present, base_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
  `);

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    if (!row || row.length < 3 || !row[0]) continue;

    const roll = row[0].toUpperCase();
    const name = row[1];
    const classSec = row[2] || '10-A';
    const phone = row[3] || '';
    const admNo = row[4] || `ADM-${Date.now().toString().slice(-6)}-${i}`;
    const pName = row[5] || '';

    const exists = db.prepare('SELECT id FROM students WHERE roll = ?').get(roll);
    if (exists) {
      skipped++;
      continue;
    }

    try {
      insertStmt.run(roll, admNo, name, null, 'Not Specified', classSec, pName, phone, null, null, fmtDate(new Date()), 18, 20);
      inserted++;
    } catch (e) {
      skipped++;
    }
  }

  res.json({ success: true, inserted, skipped });
});

// -------------------------------------------------------------
// 5. TEACHER MANAGEMENT API
// -------------------------------------------------------------
app.get('/api/teachers', (req, res) => {
  const teachers = db.prepare('SELECT * FROM teachers ORDER BY teacher_code ASC').all();
  res.json({ teachers });
});

app.post('/api/teachers', (req, res) => {
  const { teacher_code, name, email, phone, subject, assigned_class } = req.body;
  if (!teacher_code || !name || !assigned_class) {
    return res.status(400).json({ error: 'Teacher ID, Name, and Assigned Class are required.' });
  }

  const check = db.prepare('SELECT id FROM teachers WHERE teacher_code = ?').get(teacher_code);
  if (check) return res.status(400).json({ error: 'Teacher Code already exists.' });

  const result = db.prepare(`
    INSERT INTO teachers (teacher_code, name, email, phone, subject, assigned_class, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Active')
  `).run(teacher_code.trim().toUpperCase(), name.trim(), email, phone, subject, assigned_class);

  res.status(201).json({ success: true, teacherId: result.lastInsertRowid });
});

app.put('/api/teachers/:id', (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  const { name, email, phone, subject, assigned_class, status } = req.body;

  db.prepare(`
    UPDATE teachers SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      subject = COALESCE(?, subject),
      assigned_class = COALESCE(?, assigned_class),
      status = COALESCE(?, status)
    WHERE id = ?
  `).run(name, email, phone, subject, assigned_class, status, teacherId);

  res.json({ success: true, message: 'Teacher updated successfully' });
});

app.delete('/api/teachers/:id', (req, res) => {
  const teacherId = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM teachers WHERE id = ?').run(teacherId);
  res.json({ success: true, message: 'Teacher removed successfully' });
});

// -------------------------------------------------------------
// 6. LEAVE MANAGEMENT API
// -------------------------------------------------------------
app.get('/api/leaves', (req, res) => {
  const studentId = req.query.studentId;
  const status = req.query.status;

  let query = `
    SELECT l.*, s.name as student_name, s.roll as student_roll, s.class_sec 
    FROM leave_applications l 
    JOIN students s ON l.student_id = s.id 
    WHERE 1=1
  `;
  let params = [];

  if (studentId) {
    query += ' AND l.student_id = ?';
    params.push(studentId);
  }
  if (status && status !== 'All') {
    query += ' AND l.status = ?';
    params.push(status);
  }
  query += ' ORDER BY l.created_at DESC';

  const leaves = db.prepare(query).all(...params);
  res.json({ leaves });
});

app.post('/api/leaves', (req, res) => {
  const { student_id, applicant_role = 'parent', applicant_name, start_date, end_date, reason } = req.body;
  if (!student_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ error: 'Student, start date, end date, and reason are required.' });
  }

  const result = db.prepare(`
    INSERT INTO leave_applications (student_id, applicant_role, applicant_name, start_date, end_date, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending')
  `).run(student_id, applicant_role, applicant_name || 'Guardian', start_date, end_date, reason);

  // Send admin/teacher notification
  const student = db.prepare('SELECT name, roll, class_sec FROM students WHERE id = ?').get(student_id);
  createNotification(
    null,
    student_id,
    'leave_submitted',
    `New Leave Request: ${student ? student.name : 'Student'}`,
    `Leave application submitted for ${start_date} to ${end_date}. Reason: ${reason}`
  );

  res.status(201).json({ success: true, leaveId: result.lastInsertRowid });
});

app.put('/api/leaves/:id/status', (req, res) => {
  const leaveId = parseInt(req.params.id, 10);
  const { status, reviewed_by = 'Administrator', rejection_reason = '' } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  }

  const leave = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(leaveId);
  if (!leave) return res.status(404).json({ error: 'Leave application not found' });

  db.prepare(`
    UPDATE leave_applications SET
      status = ?,
      reviewed_by = ?,
      rejection_reason = ?
    WHERE id = ?
  `).run(status, reviewed_by, rejection_reason, leaveId);

  // If approved, mark attendance as 'Excused' across the leave date span
  if (status === 'Approved') {
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    const markStmt = db.prepare(`
      INSERT INTO attendance (student_id, date, status, period, marked_by, remarks, updated_at)
      VALUES (?, ?, 'Excused', 0, ?, 'Approved Leave', CURRENT_TIMESTAMP)
      ON CONFLICT(student_id, date, period) DO UPDATE SET
        status = 'Excused',
        remarks = 'Approved Leave',
        updated_at = CURRENT_TIMESTAMP
    `);

    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const curStr = fmtDate(dt);
      markStmt.run(leave.student_id, curStr, reviewed_by);
      logAudit(leave.student_id, curStr, 'Unmarked/Previous', 'Excused', reviewed_by, 'Leave Approved');
    }
  }

  // Notify parent
  const parentUser = db.prepare('SELECT id FROM users WHERE linked_student_id = ?').get(leave.student_id);
  createNotification(
    parentUser ? parentUser.id : null,
    leave.student_id,
    'leave_update',
    `Leave Application ${status}`,
    `Your leave request for ${leave.start_date} to ${leave.end_date} has been ${status.toUpperCase()}.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`
  );

  res.json({ success: true, status, leaveId });
});

// -------------------------------------------------------------
// 7. NOTIFICATIONS API
// -------------------------------------------------------------
app.get('/api/notifications', (req, res) => {
  const userId = req.query.userId;
  const studentId = req.query.studentId;

  let query = 'SELECT * FROM notifications WHERE 1=1';
  let params = [];
  if (userId) {
    query += ' AND (user_id = ? OR user_id IS NULL)';
    params.push(userId);
  }
  if (studentId) {
    query += ' AND student_id = ?';
    params.push(studentId);
  }
  query += ' ORDER BY created_at DESC LIMIT 50';

  const notifications = db.prepare(query).all(...params);
  const unreadCount = notifications.filter(n => n.is_read === 0).length;

  res.json({ notifications, unreadCount });
});

app.put('/api/notifications/:id/read', (req, res) => {
  const notifId = parseInt(req.params.id, 10);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);
  res.json({ success: true });
});

app.put('/api/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1').run();
  res.json({ success: true });
});

// -------------------------------------------------------------
// 8. TIMETABLE & HOLIDAYS & SETTINGS API
// -------------------------------------------------------------
app.get('/api/timetable', (req, res) => {
  const classSec = req.query.class || '10-A';
  const timetable = db.prepare('SELECT * FROM timetable WHERE class_sec = ? ORDER BY period_number ASC').all(classSec);
  res.json({ timetable });
});

app.post('/api/timetable', (req, res) => {
  const { class_sec, day_of_week, period_number, start_time, end_time, subject, teacher_name, room } = req.body;
  const result = db.prepare(`
    INSERT INTO timetable (class_sec, day_of_week, period_number, start_time, end_time, subject, teacher_name, room)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(class_sec, day_of_week, period_number, start_time, end_time, subject, teacher_name, room);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/timetable/:id', (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/holidays', (req, res) => {
  const holidays = db.prepare('SELECT * FROM holidays ORDER BY date ASC').all();
  res.json({ holidays });
});

app.post('/api/holidays', (req, res) => {
  const { date, name, type = 'Holiday' } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'Date and Name are required.' });

  db.prepare(`
    INSERT INTO holidays (date, name, type) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET name = excluded.name, type = excluded.type
  `).run(date, name, type);

  res.status(201).json({ success: true });
});

app.delete('/api/holidays/:id', (req, res) => {
  db.prepare('DELETE FROM holidays WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  res.json({ settings });
});

app.put('/api/settings', (req, res) => {
  const { settings } = req.body;
  if (!settings) return res.status(400).json({ error: 'Settings object required.' });

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  Object.keys(settings).forEach(key => {
    stmt.run(key, String(settings[key]));
  });
  res.json({ success: true, message: 'Settings updated' });
});

// -------------------------------------------------------------
// 9. ADVANCED FEATURES: QR CODE, GEO & AI PREDICTIONS
// -------------------------------------------------------------
app.post('/api/qr/generate', (req, res) => {
  const { classSec = '10-A', createdBy = 'Teacher' } = req.body;
  const sessionToken = crypto.randomBytes(16).toString('hex');
  const todayStr = fmtDate(new Date());
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

  const schoolLat = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'school_lat'").get()?.value || '28.6139');
  const schoolLng = parseFloat(db.prepare("SELECT value FROM settings WHERE key = 'school_lng'").get()?.value || '77.2090');
  const radius = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'geo_radius_meters'").get()?.value || '150', 10);

  db.prepare(`
    INSERT INTO qr_sessions (session_token, class_sec, date, expires_at, lat, lng, radius_meters, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(sessionToken, classSec, todayStr, expiresAt, schoolLat, schoolLng, radius, createdBy);

  res.json({
    sessionToken,
    classSec,
    date: todayStr,
    expiresAt,
    geoVerificationEnabled: true,
    schoolLat,
    schoolLng,
    radiusMeters: radius,
  });
});

app.post('/api/qr/scan', (req, res) => {
  const { sessionToken, studentId, studentLat, studentLng } = req.body;
  if (!sessionToken || !studentId) {
    return res.status(400).json({ error: 'Session token and student ID are required.' });
  }

  const session = db.prepare('SELECT * FROM qr_sessions WHERE session_token = ?').get(sessionToken);
  if (!session) {
    return res.status(404).json({ error: 'Invalid or unrecognized QR session token.' });
  }

  if (new Date() > new Date(session.expires_at)) {
    return res.status(410).json({ error: 'QR Code session has expired. Please ask the instructor for a fresh code.' });
  }

  // Geolocation Haversine check if coordinates provided
  if (studentLat && studentLng && session.lat && session.lng) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371e3; // metres
    const φ1 = toRad(session.lat);
    const φ2 = toRad(studentLat);
    const Δφ = toRad(studentLat - session.lat);
    const Δλ = toRad(studentLng - session.lng);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dist = R * c;

    if (dist > session.radius_meters) {
      return res.status(403).json({
        error: `Location check failed. You are ${Math.round(dist)}m away from school (allowed radius: ${session.radius_meters}m).`
      });
    }
  }

  // Mark student Present
  db.prepare(`
    INSERT INTO attendance (student_id, date, status, period, marked_by, remarks, updated_at)
    VALUES (?, ?, 'Present', 0, 'QR Scan', 'Verified via Classroom QR', CURRENT_TIMESTAMP)
    ON CONFLICT(student_id, date, period) DO UPDATE SET
      status = 'Present',
      marked_by = 'QR Scan',
      remarks = 'Verified via Classroom QR',
      updated_at = CURRENT_TIMESTAMP
  `).run(studentId, session.date);

  logAudit(studentId, session.date, 'Unmarked', 'Present', 'QR Scan', 'QR code attendance verification');

  res.json({
    success: true,
    message: 'Attendance recorded successfully via QR code verification!',
    studentId,
    date: session.date,
  });
});

app.get('/api/ai/insights', (req, res) => {
  const classSec = req.query.class || 'All';
  const insights = generateAttendanceInsights(classSec);
  res.json(insights);
});

app.get('/api/ai/predictions', (req, res) => {
  const classSec = req.query.class || 'All';
  const predictions = calculateAttendancePrediction(classSec);
  res.json({ predictions });
});

// -------------------------------------------------------------
// 10. REPORTS & EXPORTS API
// -------------------------------------------------------------
app.get('/api/reports/defaulters', (req, res) => {
  const classSec = req.query.class || 'All';
  const threshold = parseFloat(req.query.threshold || '75');

  const predictions = calculateAttendancePrediction(classSec);
  const defaulters = predictions.filter(p => p.currentPct < threshold);

  res.json({
    threshold,
    classSec,
    totalDefaulters: defaulters.length,
    defaulters,
  });
});

app.get('/api/reports/summary', (req, res) => {
  const classSec = req.query.class || 'All';
  const type = req.query.type || 'daily'; // daily, weekly, monthly, annual
  const selectedDate = req.query.date || fmtDate(new Date());

  let studentFilter = "WHERE status = 'Active'";
  let studentParams = [];
  if (classSec !== 'All') {
    studentFilter += ' AND class_sec = ?';
    studentParams.push(classSec);
  }
  const students = db.prepare(`SELECT * FROM students ${studentFilter} ORDER BY roll ASC`).all(...studentParams);

  const reportRows = students.map(s => {
    const stats = getStudentAttendanceStats(s.id);
    const dayRec = db.prepare('SELECT status FROM attendance WHERE student_id = ? AND date = ? AND period = 0').get(s.id, selectedDate);
    const dayStatus = dayRec ? dayRec.status : 'Unmarked';

    let requiredClasses = 0;
    if (stats.pct < 75) {
      requiredClasses = Math.max(1, Math.ceil(3 * stats.totalCount - 4 * stats.presentCount));
    }

    return {
      roll: s.roll,
      admissionNo: s.admission_no,
      name: s.name,
      classSec: s.class_sec,
      phone: s.parent_phone,
      dayStatus,
      presentSessions: stats.presentCount,
      totalSessions: stats.totalCount,
      percentage: stats.pct,
      isDefaulter: stats.pct < 75,
      requiredClasses,
    };
  });

  res.json({
    type,
    classSec,
    date: selectedDate,
    totalStudents: reportRows.length,
    reportRows,
  });
});

// -------------------------------------------------------------
// 11. MODULE 1: SUBJECT-WISE & PERIOD-WISE ATTENDANCE API
// -------------------------------------------------------------
app.get('/api/subjects', (req, res) => {
  const classSec = req.query.class;
  let query = `
    SELECT s.*, t.name as teacher_name 
    FROM subjects s 
    LEFT JOIN teachers t ON s.teacher_code = t.teacher_code
    WHERE 1=1
  `;
  const params = [];
  if (classSec && classSec !== 'All') {
    query += ' AND s.class_sec = ?';
    params.push(classSec);
  }
  query += ' ORDER BY s.code ASC';
  const subjects = db.prepare(query).all(...params);
  res.json({ subjects });
});

app.post('/api/subjects', (req, res) => {
  const { code, name, type = 'Theory', class_sec, teacher_code, min_attendance_pct = 75.0 } = req.body;
  if (!code || !name || !class_sec) {
    return res.status(400).json({ error: 'Code, Name, and Class are required.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const existing = db.prepare('SELECT id FROM subjects WHERE code = ?').get(cleanCode);
  if (existing) {
    return res.status(400).json({ error: `Subject code ${cleanCode} already exists.` });
  }

  const result = db.prepare(`
    INSERT INTO subjects (code, name, type, class_sec, teacher_code, min_attendance_pct)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cleanCode, name.trim(), type, class_sec, teacher_code || null, parseFloat(min_attendance_pct) || 75.0);

  // Automatically enroll students of that class in the new subject
  const studentsInClass = db.prepare("SELECT id FROM students WHERE class_sec = ? AND status = 'Active'").all(class_sec);
  const enrollStmt = db.prepare('INSERT OR IGNORE INTO subject_enrollments (subject_id, student_id, enrolled_date) VALUES (?, ?, ?)');
  studentsInClass.forEach(st => enrollStmt.run(result.lastInsertRowid, st.id, fmtDate(new Date())));

  res.status(201).json({ success: true, subjectId: result.lastInsertRowid });
});

app.put('/api/subjects/:id', (req, res) => {
  const subjectId = parseInt(req.params.id, 10);
  const { name, type, class_sec, teacher_code, min_attendance_pct } = req.body;

  db.prepare(`
    UPDATE subjects SET
      name = COALESCE(?, name),
      type = COALESCE(?, type),
      class_sec = COALESCE(?, class_sec),
      teacher_code = COALESCE(?, teacher_code),
      min_attendance_pct = COALESCE(?, min_attendance_pct)
    WHERE id = ?
  `).run(name, type, class_sec, teacher_code, min_attendance_pct !== undefined ? parseFloat(min_attendance_pct) : null, subjectId);

  res.json({ success: true, message: 'Subject updated successfully' });
});

app.delete('/api/subjects/:id', (req, res) => {
  const subjectId = parseInt(req.params.id, 10);
  db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId);
  res.json({ success: true, message: 'Subject deleted successfully' });
});

app.get('/api/periods', (req, res) => {
  const periods = db.prepare('SELECT * FROM periods ORDER BY period_number ASC').all();
  res.json({ periods });
});

app.get('/api/attendance/sessions', (req, res) => {
  const { classSec, date, subjectId } = req.query;
  let query = `
    SELECT s.*, sub.name as subject_name, sub.code as subject_code, p.name as period_name, p.start_time, p.end_time
    FROM attendance_sessions s
    JOIN subjects sub ON s.subject_id = sub.id
    LEFT JOIN periods p ON s.period_number = p.period_number
    WHERE 1=1
  `;
  const params = [];
  if (classSec && classSec !== 'All') {
    query += ' AND s.class_sec = ?';
    params.push(classSec);
  }
  if (date) {
    query += ' AND s.date = ?';
    params.push(date);
  }
  if (subjectId) {
    query += ' AND s.subject_id = ?';
    params.push(subjectId);
  }
  query += ' ORDER BY s.date DESC, s.period_number ASC';
  const sessions = db.prepare(query).all(...params);
  res.json({ sessions });
});

app.post('/api/attendance/sessions', (req, res) => {
  const { academicYear = '2026-2027', date, classSec, subjectId, periodNumber, teacherCode, conductedBy = 'Teacher' } = req.body;
  if (!date || !classSec || !subjectId || !periodNumber) {
    return res.status(400).json({ error: 'Date, Class, Subject, and Period are required.' });
  }

  // Teacher authorization check if requested by teacher
  if (req.user && req.user.role === 'teacher') {
    if (!isTeacherAuthorized(req.user, classSec, subjectId, teacherCode)) {
      return res.status(403).json({ error: 'You are not authorized to mark attendance for this subject and class.' });
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO attendance_sessions (academic_year, date, class_sec, subject_id, period_number, teacher_code, status, conducted_by)
      VALUES (?, ?, ?, ?, ?, ?, 'Completed', ?)
      ON CONFLICT(date, class_sec, subject_id, period_number) DO UPDATE SET
        status = 'Completed',
        conducted_by = excluded.conducted_by
    `).run(academicYear, date, classSec, subjectId, periodNumber, teacherCode || null, conductedBy);

    const sessionId = result.lastInsertRowid || db.prepare(`
      SELECT id FROM attendance_sessions WHERE date = ? AND class_sec = ? AND subject_id = ? AND period_number = ?
    `).get(date, classSec, subjectId, periodNumber).id;

    res.status(201).json({ success: true, sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/attendance/period-wise', (req, res) => {
  const { date, classSec, subjectId, periodNumber } = req.query;
  if (!date || !classSec || !subjectId || !periodNumber) {
    return res.status(400).json({ error: 'Date, Class, Subject, and Period are required parameters.' });
  }

  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });

  // Find or create session
  let session = db.prepare(`
    SELECT * FROM attendance_sessions 
    WHERE date = ? AND class_sec = ? AND subject_id = ? AND period_number = ?
  `).get(date, classSec, subjectId, periodNumber);

  const sessionId = session ? session.id : null;

  // Enrolled students
  const students = db.prepare(`
    SELECT DISTINCT s.id, s.roll, s.name, s.class_sec, s.parent_phone, s.parent_email
    FROM students s
    LEFT JOIN subject_enrollments se ON se.student_id = s.id AND se.subject_id = ?
    WHERE (s.class_sec = ? OR se.subject_id = ?) AND s.status = 'Active'
    ORDER BY s.roll ASC
  `).all(subjectId, classSec, subjectId);

  const records = sessionId ? db.prepare('SELECT student_id, status, remarks FROM period_attendance WHERE session_id = ?').all(sessionId) : [];
  const recordsMap = {};
  records.forEach(r => recordsMap[r.student_id] = r);

  const studentList = students.map(st => {
    const rec = recordsMap[st.id];
    const subStats = getStudentSubjectStats(st.id, subjectId);
    return {
      id: st.id,
      roll: st.roll,
      name: st.name,
      classSec: st.class_sec,
      phone: st.parent_phone,
      email: st.parent_email,
      status: rec ? rec.status : 'Unmarked',
      remarks: rec ? rec.remarks : '',
      subjectAttendancePct: subStats.percentage,
      isSubjectEligible: subStats.isEligible,
      recoverySessions: subStats.recoverySessions,
    };
  });

  res.json({
    session,
    subject,
    date,
    classSec,
    periodNumber,
    isCompleted: !!session && session.status === 'Completed',
    students: studentList,
  });
});

app.post('/api/attendance/period-wise', async (req, res) => {
  const { date, classSec, subjectId, periodNumber, records, conductedBy = 'Teacher' } = req.body;
  if (!date || !classSec || !subjectId || !periodNumber || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Date, Class, Subject, Period, and Records array are required.' });
  }

  // Teacher authorization check
  if (req.user && req.user.role === 'teacher') {
    if (!isTeacherAuthorized(req.user, classSec, subjectId)) {
      return res.status(403).json({ error: 'You are not authorized to record attendance for this subject.' });
    }
  }

  try {
    // 1. Ensure attendance session exists
    let session = db.prepare(`
      SELECT id FROM attendance_sessions 
      WHERE date = ? AND class_sec = ? AND subject_id = ? AND period_number = ?
    `).get(date, classSec, subjectId, periodNumber);

    let sessionId = session ? session.id : null;
    if (!sessionId) {
      const ins = db.prepare(`
        INSERT INTO attendance_sessions (academic_year, date, class_sec, subject_id, period_number, status, conducted_by)
        VALUES ('2026-2027', ?, ?, ?, ?, 'Completed', ?)
      `).run(date, classSec, subjectId, periodNumber, conductedBy);
      sessionId = ins.lastInsertRowid;
    }

    // 2. Record period attendance in bulk transaction
    const saveResult = recordPeriodAttendance(sessionId, records, conductedBy);

    // 3. Automated notification triggers for Absences and Defaulters
    const subject = db.prepare('SELECT name, min_attendance_pct FROM subjects WHERE id = ?').get(subjectId);
    records.forEach(r => {
      const subStats = getStudentSubjectStats(r.studentId, subjectId);
      if (r.status === 'Absent' && subject) {
        triggerPeriodAbsenceAlert({
          studentId: r.studentId,
          subjectName: subject.name,
          periodNumber,
          date,
          currentPct: subStats ? subStats.percentage : 0,
        }).catch(() => {});
      }
      if (subStats && !subStats.isEligible && subject) {
        triggerSubjectDefaulterAlert({
          studentId: r.studentId,
          subjectName: subject.name,
          currentPct: subStats.percentage,
          minPct: subject.min_attendance_pct,
          neededSessions: subStats.recoverySessions,
        }).catch(() => {});
      }
    });

    res.json({
      success: true,
      sessionId,
      count: saveResult.count,
      message: `Recorded period attendance for ${records.length} students.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/attendance/student/:studentId/subjects', (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const result = getAllSubjectsForStudent(studentId);
  if (!result) return res.status(404).json({ error: 'Student not found' });
  res.json(result);
});

app.get('/api/attendance/eligibility/:studentId', (req, res) => {
  const studentId = parseInt(req.params.studentId, 10);
  const result = getAllSubjectsForStudent(studentId);
  if (!result) return res.status(404).json({ error: 'Student not found' });

  const stats = getStudentAttendanceStats(studentId);
  res.json({
    student: result.student,
    overallAttendancePct: stats.pct,
    overallEligible: stats.pct >= 75.0,
    overallRecoveryClasses: stats.pct < 75 ? Math.max(1, Math.ceil(3 * stats.totalCount - 4 * stats.presentCount)) : 0,
    subjectPerformance: result.subjects,
    totalSubjects: result.totalSubjects,
    eligibleSubjectsCount: result.eligibleSubjectsCount,
    defaulterSubjectsCount: result.defaulterSubjectsCount,
  });
});

// -------------------------------------------------------------
// 12. MODULE 2: REAL EMAIL & SMS GATEWAY API
// -------------------------------------------------------------
app.get('/api/settings/communications', (req, res) => {
  const config = getCommunicationConfig();
  res.json({ config });
});

app.put('/api/settings/communications/email', (req, res) => {
  const { enabled, provider, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, sender_name, sender_address } = req.body;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (enabled !== undefined) stmt.run('email_enabled', String(enabled));
  if (provider) stmt.run('email_provider', provider);
  if (smtp_host) stmt.run('smtp_host', smtp_host);
  if (smtp_port) stmt.run('smtp_port', String(smtp_port));
  if (smtp_secure !== undefined) stmt.run('smtp_secure', String(smtp_secure));
  if (smtp_user) stmt.run('smtp_user', smtp_user);
  if (smtp_pass && !smtp_pass.includes('••••')) stmt.run('smtp_pass', smtp_pass);
  if (sender_name) stmt.run('email_sender_name', sender_name);
  if (sender_address) stmt.run('email_sender_address', sender_address);

  res.json({ success: true, message: 'Email configuration saved successfully' });
});

app.put('/api/settings/communications/sms', (req, res) => {
  const { enabled, provider, twilio_account_sid, twilio_auth_token, twilio_sender_number } = req.body;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (enabled !== undefined) stmt.run('sms_enabled', String(enabled));
  if (provider) stmt.run('sms_provider', provider);
  if (twilio_account_sid && !twilio_account_sid.includes('••••')) stmt.run('twilio_account_sid', twilio_account_sid);
  if (twilio_auth_token && !twilio_auth_token.includes('••••')) stmt.run('twilio_auth_token', twilio_auth_token);
  if (twilio_sender_number) stmt.run('twilio_sender_number', twilio_sender_number);

  res.json({ success: true, message: 'SMS configuration saved successfully' });
});

app.post('/api/settings/communications/test-email', async (req, res) => {
  const { testEmail } = req.body;
  if (!testEmail) return res.status(400).json({ error: 'Recipient email address is required for test' });

  const result = await sendEmailNotification({
    toEmail: testEmail,
    subject: 'Smart School Gateway: Test Email Connection',
    text: `Hello,\nThis is a test notification from the Smart School Communication Gateway sent at ${new Date().toLocaleString()}.\n\nIf you received this message, your SMTP credentials and mail gateway are operational.`,
    notificationType: 'test',
  });

  res.json(result);
});

app.post('/api/settings/communications/test-sms', async (req, res) => {
  const { testPhone } = req.body;
  if (!testPhone) return res.status(400).json({ error: 'Recipient phone number is required for test' });

  const result = await sendSmsNotification({
    toPhone: testPhone,
    message: `Smart School Gateway: Test SMS connection dispatched at ${new Date().toLocaleTimeString()}.`,
    notificationType: 'test',
  });

  res.json(result);
});

app.get('/api/notifications/dispatch-logs', (req, res) => {
  const { status, type } = req.query;
  let query = `
    SELECT l.*, s.name as student_name, s.roll as student_roll
    FROM communication_logs l
    LEFT JOIN students s ON l.student_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (status && status !== 'All') {
    query += ' AND l.status = ?';
    params.push(status);
  }
  if (type && type !== 'All') {
    query += ' AND l.recipient_type = ?';
    params.push(type);
  }
  query += ' ORDER BY l.created_at DESC LIMIT 100';

  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

app.post('/api/notifications/:id/retry', async (req, res) => {
  const logId = parseInt(req.params.id, 10);
  try {
    const result = await retryDispatch(logId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/webhooks/twilio/status', (req, res) => {
  const { MessageSid, MessageStatus } = req.body;
  if (MessageSid) {
    const statusMap = {
      delivered: 'Delivered',
      sent: 'Sent',
      failed: 'Failed',
      undelivered: 'Failed',
    };
    const mapped = statusMap[MessageStatus] || 'Processing';
    db.prepare('UPDATE communication_logs SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE provider_message_id = ?')
      .run(mapped, MessageSid);
  }
  res.status(200).send('<Response></Response>');
});

app.post('/api/webhooks/sendgrid/events', (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [];
  events.forEach(evt => {
    if (evt.sg_message_id) {
      const status = evt.event === 'delivered' ? 'Delivered' : evt.event === 'bounce' ? 'Failed' : 'Sent';
      db.prepare('UPDATE communication_logs SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE provider_message_id = ?')
        .run(status, evt.sg_message_id);
    }
  });
  res.status(200).json({ success: true });
});

// -------------------------------------------------------------
// 13. MODULE 3: DATABASE BACKUP & RESTORE SYSTEM API
// -------------------------------------------------------------
app.get('/api/admin/backups', (req, res) => {
  const backups = getBackupHistory();
  res.json({ backups });
});

app.post('/api/admin/backups', (req, res) => {
  const { format = 'sql', createdBy = 'Administrator' } = req.body;
  try {
    let backupResult = null;
    if (format === 'json') {
      backupResult = createJsonBackup(createdBy);
    } else {
      backupResult = createSqlBackup(createdBy);
    }
    res.status(201).json({ success: true, backup: backupResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/backups/:id/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(id);
  if (!row || !fs.existsSync(row.filepath)) {
    return res.status(404).json({ error: 'Backup file not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
  res.setHeader('Content-Type', row.format === 'json' ? 'application/json' : 'application/sql');
  const fileStream = fs.createReadStream(row.filepath);
  fileStream.pipe(res);
});

app.post('/api/admin/backups/validate', (req, res) => {
  const { backupId, filepath, format } = req.body;
  let targetPath = filepath;
  if (backupId) {
    const row = db.prepare('SELECT filepath, format FROM backup_history WHERE id = ?').get(backupId);
    if (!row) return res.status(404).json({ error: 'Backup record not found' });
    targetPath = row.filepath;
  }

  const result = validateBackup(targetPath, format);
  res.json(result);
});

app.post('/api/admin/backups/restore', (req, res) => {
  const { backupId, filepath, format, restoredBy = 'Administrator' } = req.body;
  let targetPath = filepath;
  let targetFormat = format;

  if (backupId) {
    const row = db.prepare('SELECT filepath, format FROM backup_history WHERE id = ?').get(backupId);
    if (!row) return res.status(404).json({ error: 'Backup record not found' });
    targetPath = row.filepath;
    targetFormat = row.format;
  }

  if (!targetPath) {
    return res.status(400).json({ error: 'Backup identifier or filepath is required' });
  }

  try {
    const result = restoreFromBackup({
      backupId,
      filepath: targetPath,
      format: targetFormat,
      restoredBy
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/backups/restore-history', (req, res) => {
  const history = getRestoreHistory();
  res.json({ history });
});

app.delete('/api/admin/backups/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const success = deleteBackup(id);
  if (!success) return res.status(404).json({ error: 'Backup not found' });
  res.json({ success: true, message: 'Backup file and history entry deleted' });
});

// Fallback for HTML routing (SPA-like navigation)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  // If requesting a specific .html file that exists, let express.static handle it
  next();
});

// Start Express Server only when run directly
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`SMART SCHOOL server running on http://127.0.0.1:${PORT}`);
  });
}

module.exports = { app, server };
