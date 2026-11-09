const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'smart_school.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high performance
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    -- Classes & Sections
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL, -- e.g. "10-A"
      name TEXT NOT NULL,         -- e.g. "Class 10"
      section TEXT NOT NULL,      -- e.g. "A"
      room TEXT
    );

    -- Users (Admin, Teacher, Parent)
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'parent')),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      linked_student_id INTEGER,
      teacher_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Teachers
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      subject TEXT,
      assigned_class TEXT, -- e.g. "10-A"
      status TEXT DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Students
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll TEXT UNIQUE NOT NULL,
      admission_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      class_sec TEXT NOT NULL,
      parent_name TEXT,
      parent_phone TEXT,
      parent_email TEXT,
      address TEXT,
      photo_url TEXT,
      admission_date TEXT,
      status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Archived', 'Suspended')),
      base_present INTEGER DEFAULT 18,
      base_total INTEGER DEFAULT 20,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Attendance Records
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Excused')),
      period INTEGER DEFAULT 0, -- 0 for full day, 1-8 for periods
      marked_by TEXT,
      remarks TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, date, period)
    );

    -- Attendance Audit Trail
    CREATE TABLE IF NOT EXISTS attendance_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      changed_by TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      reason TEXT
    );

    -- Leave Applications
    CREATE TABLE IF NOT EXISTS leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      applicant_role TEXT DEFAULT 'parent',
      applicant_name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      document_url TEXT,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      reviewed_by TEXT,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- In-App Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      student_id INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Timetable
    CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_sec TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      period_number INTEGER NOT NULL,
      start_time TEXT,
      end_time TEXT,
      subject TEXT NOT NULL,
      teacher_name TEXT,
      room TEXT
    );

    -- Holidays
    CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Holiday'
    );

    -- School Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- QR Sessions
    CREATE TABLE IF NOT EXISTS qr_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT UNIQUE NOT NULL,
      class_sec TEXT NOT NULL,
      date TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      lat REAL,
      lng REAL,
      radius_meters INTEGER DEFAULT 100,
      created_by TEXT
    );

    -- Subjects (Module 1)
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Theory',
      class_sec TEXT NOT NULL,
      teacher_code TEXT,
      min_attendance_pct REAL DEFAULT 75.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Subject Enrollments (Module 1)
    CREATE TABLE IF NOT EXISTS subject_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      enrolled_date TEXT,
      UNIQUE(subject_id, student_id)
    );

    -- School Master Periods (Module 1)
    CREATE TABLE IF NOT EXISTS periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_number INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );

    -- Academic Attendance Sessions (Module 1)
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year TEXT DEFAULT '2026-2027',
      date TEXT NOT NULL,
      class_sec TEXT NOT NULL,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      period_number INTEGER NOT NULL,
      teacher_code TEXT,
      status TEXT DEFAULT 'Completed',
      conducted_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, class_sec, subject_id, period_number)
    );

    -- Period Attendance Records (Module 1)
    CREATE TABLE IF NOT EXISTS period_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Excused')),
      remarks TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, student_id)
    );

    -- Communication Logs (Module 2)
    CREATE TABLE IF NOT EXISTS communication_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      recipient TEXT NOT NULL,
      recipient_type TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_reason TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,
      provider_message_id TEXT
    );

    -- Backup History (Module 3)
    CREATE TABLE IF NOT EXISTS backup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      format TEXT NOT NULL,
      filesize_bytes INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL,
      table_count INTEGER,
      record_count INTEGER,
      checksum TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Restore History (Module 3)
    CREATE TABLE IF NOT EXISTS restore_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_id INTEGER,
      backup_filename TEXT NOT NULL,
      restored_by TEXT NOT NULL,
      pre_restore_backup_filename TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      restored_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDefaultData();
}

function seedDefaultData() {
  // Check if classes exist
  const classCount = db.prepare('SELECT COUNT(*) as count FROM classes').get().count;
  if (classCount === 0) {
    const insertClass = db.prepare('INSERT INTO classes (code, name, section, room) VALUES (?, ?, ?, ?)');
    insertClass.run('10-A', 'Class 10', 'A', 'Room 101');
    insertClass.run('10-B', 'Class 10', 'B', 'Room 102');
    insertClass.run('12-A', 'Class 12', 'A', 'Room 201');
  }

  // Check if settings exist
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
  if (settingsCount === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('attendance_threshold', '75');
    insertSetting.run('school_name', 'Smart School International');
    insertSetting.run('academic_year', '2026-2027');
    insertSetting.run('late_weight', '0.5'); // Late counts as 0.5 present
    insertSetting.run('school_lat', '28.6139');
    insertSetting.run('school_lng', '77.2090');
    insertSetting.run('geo_radius_meters', '150');
  }

  // Check if students exist
  const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  if (studentCount === 0) {
    const insertStudent = db.prepare(`
      INSERT INTO students (
        roll, admission_no, name, dob, gender, class_sec,
        parent_name, parent_phone, parent_email, address,
        admission_date, status, base_present, base_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
    `);

    // Helper past dates
    const d = new Date();
    const fmt = (dt) => dt.toISOString().split('T')[0];
    const todayStr = fmt(d);
    const d1 = fmt(new Date(Date.now() - 86400000));
    const d2 = fmt(new Date(Date.now() - 86400000 * 2));
    const d3 = fmt(new Date(Date.now() - 86400000 * 3));
    const d4 = fmt(new Date(Date.now() - 86400000 * 4));

    const s1 = insertStudent.run(
      '10A-01', 'ADM-2024-001', 'Aarav Sharma', '2010-04-15', 'Male', '10-A',
      'Rajesh Sharma', '9876543210', 'rajesh.sharma@example.com', '12 Lake View Road, Delhi',
      '2024-04-01', 14, 20
    );
    const s2 = insertStudent.run(
      '10A-02', 'ADM-2024-002', 'Priya Patel', '2010-08-22', 'Female', '10-A',
      'Suresh Patel', '9876543211', 'suresh.patel@example.com', '45 Green Park, Delhi',
      '2024-04-01', 18, 20
    );
    const s3 = insertStudent.run(
      '10B-01', 'ADM-2024-003', 'Rohan Verma', '2010-01-10', 'Male', '10-B',
      'Mahesh Verma', '9876543212', 'mahesh.verma@example.com', '88 Sector 14, Gurgaon',
      '2024-04-01', 11, 20
    );
    const s4 = insertStudent.run(
      '10B-02', 'ADM-2024-004', 'Sneha Nair', '2010-11-05', 'Female', '10-B',
      'Gopal Nair', '9876543213', 'gopal.nair@example.com', '21 Palm Enclave, Noida',
      '2024-04-01', 19, 20
    );
    const s5 = insertStudent.run(
      '12A-01', 'ADM-2022-005', 'Vikram Singh', '2008-06-18', 'Male', '12-A',
      'Harpreet Singh', '9876543214', 'harpreet.singh@example.com', '72 Ring Road, Delhi',
      '2022-04-01', 13, 20
    );
    const s6 = insertStudent.run(
      '12A-02', 'ADM-2022-006', 'Ananya Iyer', '2008-03-30', 'Female', '12-A',
      'Venkat Iyer', '9876543215', 'venkat.iyer@example.com', '109 Civil Lines, Delhi',
      '2022-04-01', 17, 20
    );

    // Seed historical attendance
    const insertAtt = db.prepare(`
      INSERT INTO attendance (student_id, date, status, period, marked_by)
      VALUES (?, ?, ?, 0, 'Admin')
    `);

    // Student 1 (Aarav): d4: Present, d3: Present, d2: Late, d1: Absent, today: Absent
    insertAtt.run(s1.lastInsertRowid, d4, 'Present');
    insertAtt.run(s1.lastInsertRowid, d3, 'Present');
    insertAtt.run(s1.lastInsertRowid, d2, 'Late');
    insertAtt.run(s1.lastInsertRowid, d1, 'Absent');
    insertAtt.run(s1.lastInsertRowid, todayStr, 'Absent');

    // Student 2 (Priya): All Present
    insertAtt.run(s2.lastInsertRowid, d4, 'Present');
    insertAtt.run(s2.lastInsertRowid, d3, 'Present');
    insertAtt.run(s2.lastInsertRowid, d2, 'Present');
    insertAtt.run(s2.lastInsertRowid, d1, 'Present');
    insertAtt.run(s2.lastInsertRowid, todayStr, 'Present');

    // Student 3 (Rohan): Absent streak
    insertAtt.run(s3.lastInsertRowid, d4, 'Absent');
    insertAtt.run(s3.lastInsertRowid, d3, 'Absent');
    insertAtt.run(s3.lastInsertRowid, d2, 'Late');
    insertAtt.run(s3.lastInsertRowid, d1, 'Absent');
    insertAtt.run(s3.lastInsertRowid, todayStr, 'Absent');

    // Student 4 (Sneha): All Present
    insertAtt.run(s4.lastInsertRowid, d4, 'Present');
    insertAtt.run(s4.lastInsertRowid, d3, 'Present');
    insertAtt.run(s4.lastInsertRowid, d2, 'Present');
    insertAtt.run(s4.lastInsertRowid, d1, 'Present');
    insertAtt.run(s4.lastInsertRowid, todayStr, 'Present');

    // Student 5 (Vikram): Present, Late, Absent, Present, Late
    insertAtt.run(s5.lastInsertRowid, d4, 'Present');
    insertAtt.run(s5.lastInsertRowid, d3, 'Late');
    insertAtt.run(s5.lastInsertRowid, d2, 'Absent');
    insertAtt.run(s5.lastInsertRowid, d1, 'Present');
    insertAtt.run(s5.lastInsertRowid, todayStr, 'Late');

    // Student 6 (Ananya): All Present
    insertAtt.run(s6.lastInsertRowid, d4, 'Present');
    insertAtt.run(s6.lastInsertRowid, d3, 'Present');
    insertAtt.run(s6.lastInsertRowid, d2, 'Present');
    insertAtt.run(s6.lastInsertRowid, d1, 'Present');
    insertAtt.run(s6.lastInsertRowid, todayStr, 'Present');
  }

  // Check if teachers exist
  const teacherCount = db.prepare('SELECT COUNT(*) as count FROM teachers').get().count;
  if (teacherCount === 0) {
    const insertTeacher = db.prepare(`
      INSERT INTO teachers (teacher_code, name, email, phone, subject, assigned_class, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Active')
    `);
    insertTeacher.run('TCH-101', 'Sunita Rao', 'sunita.rao@smartschool.edu', '9811122233', 'Mathematics', '10-A');
    insertTeacher.run('TCH-102', 'Amitabh Sen', 'amitabh.sen@smartschool.edu', '9822233344', 'Science', '10-B');
    insertTeacher.run('TCH-103', 'Meera Kapoor', 'meera.kapoor@smartschool.edu', '9833344455', 'English', '12-A');
  }

  // Check if users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, role, name, email, phone, linked_student_id, teacher_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const adminHash = bcrypt.hashSync('admin123', 10);
    const teacherHash = bcrypt.hashSync('teacher123', 10);
    const parentHash = bcrypt.hashSync('parent123', 10);

    // Admin
    insertUser.run('admin', adminHash, 'admin', 'System Administrator', 'admin@smartschool.edu', '9899999999', null, null);
    // Teacher assigned to 10-A
    insertUser.run('teacher', teacherHash, 'teacher', 'Sunita Rao', 'sunita.rao@smartschool.edu', '9811122233', null, 'TCH-101');
    // Parent linked to Student 1 (Aarav Sharma)
    insertUser.run('parent', parentHash, 'parent', 'Rajesh Sharma', 'rajesh.sharma@example.com', '9876543210', 1, null);
  }

  // Check if timetable exists
  const timetableCount = db.prepare('SELECT COUNT(*) as count FROM timetable').get().count;
  if (timetableCount === 0) {
    const insertTt = db.prepare(`
      INSERT INTO timetable (class_sec, day_of_week, period_number, start_time, end_time, subject, teacher_name, room)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = [
      { num: 1, start: '08:30', end: '09:15', sub: 'Mathematics', tch: 'Sunita Rao' },
      { num: 2, start: '09:15', end: '10:00', sub: 'Physics', tch: 'Amitabh Sen' },
      { num: 3, start: '10:15', end: '11:00', sub: 'Chemistry', tch: 'Amitabh Sen' },
      { num: 4, start: '11:00', end: '11:45', sub: 'English', tch: 'Meera Kapoor' },
      { num: 5, start: '12:30', end: '01:15', sub: 'Computer Science', tch: 'Sunita Rao' },
      { num: 6, start: '01:15', end: '02:00', sub: 'Physical Education', tch: 'Coach Rana' },
    ];

    ['10-A', '10-B', '12-A'].forEach(c => {
      days.forEach(day => {
        periods.forEach(p => {
          insertTt.run(c, day, p.num, p.start, p.end, p.sub, p.tch, `Room ${c}`);
        });
      });
    });
  }

  // Check if holidays exist
  const holidayCount = db.prepare('SELECT COUNT(*) as count FROM holidays').get().count;
  if (holidayCount === 0) {
    const insertHol = db.prepare('INSERT INTO holidays (date, name, type) VALUES (?, ?, ?)');
    insertHol.run('2026-01-26', 'Republic Day', 'National Holiday');
    insertHol.run('2026-03-25', 'Holi Festival', 'Festival Holiday');
    insertHol.run('2026-04-14', 'Ambedkar Jayanti', 'Gazetted Holiday');
    insertHol.run('2026-08-15', 'Independence Day', 'National Holiday');
    insertHol.run('2026-10-02', 'Gandhi Jayanti', 'National Holiday');
    insertHol.run('2026-11-12', 'Diwali Break', 'Festival Holiday');
    insertHol.run('2026-12-25', 'Christmas Day', 'Festival Holiday');
  }

  // Check if leave application exists
  const leaveCount = db.prepare('SELECT COUNT(*) as count FROM leave_applications').get().count;
  if (leaveCount === 0) {
    const insertLeave = db.prepare(`
      INSERT INTO leave_applications (student_id, applicant_role, applicant_name, start_date, end_date, reason, status, reviewed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const d = new Date();
    const fmt = (dt) => dt.toISOString().split('T')[0];
    const todayStr = fmt(d);
    insertLeave.run(1, 'parent', 'Rajesh Sharma', todayStr, todayStr, 'Severe viral fever and physician consultation', 'Pending', null);
  }

  // Check if notifications exist
  const notifCount = db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
  if (notifCount === 0) {
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, student_id, type, title, message, is_read)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertNotif.run(3, 1, 'defaulter', 'Low Attendance Alert', 'Aarav Sharma has attendance below 75%. Please ensure regular attendance.', 0);
    insertNotif.run(3, 1, 'absence', 'Student Marked Absent', 'Aarav Sharma was marked absent today.', 0);
  }

  // Check if master periods exist (Module 1)
  const periodCount = db.prepare('SELECT COUNT(*) as count FROM periods').get().count;
  if (periodCount === 0) {
    const insertPeriod = db.prepare(`
      INSERT INTO periods (period_number, name, start_time, end_time)
      VALUES (?, ?, ?, ?)
    `);
    insertPeriod.run(1, 'Period 1 — Morning', '08:30', '09:15');
    insertPeriod.run(2, 'Period 2 — Mid-Morning', '09:15', '10:00');
    insertPeriod.run(3, 'Period 3 — Core Theory', '10:15', '11:00');
    insertPeriod.run(4, 'Period 4 — Humanities', '11:00', '11:45');
    insertPeriod.run(5, 'Period 5 — Practical Lab', '12:30', '01:15');
    insertPeriod.run(6, 'Period 6 — Activity/Sports', '01:15', '02:00');
  }

  // Check if subjects exist (Module 1)
  const subjectCount = db.prepare('SELECT COUNT(*) as count FROM subjects').get().count;
  if (subjectCount === 0) {
    const insertSub = db.prepare(`
      INSERT INTO subjects (code, name, type, class_sec, teacher_code, min_attendance_pct)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const mathSub = insertSub.run('MATH-10A', 'Mathematics', 'Theory', '10-A', 'TCH-101', 75.0);
    const phySub = insertSub.run('PHYTH-10A', 'Physics Theory', 'Theory', '10-A', 'TCH-102', 75.0);
    const phyLabSub = insertSub.run('PHYLAB-10A', 'Physics Lab', 'Practical', '10-A', 'TCH-102', 80.0);
    const chemSub = insertSub.run('CHEM-10A', 'Chemistry', 'Theory', '10-A', 'TCH-102', 75.0);
    const engSub = insertSub.run('ENG-10A', 'English', 'Theory', '10-A', 'TCH-103', 75.0);
    const csSub = insertSub.run('CSLAB-10A', 'Computer Science Lab', 'Lab', '10-A', 'TCH-101', 80.0);

    // Enroll students of 10-A
    const class10AStudents = db.prepare("SELECT id FROM students WHERE class_sec = '10-A'").all();
    const enrollStmt = db.prepare('INSERT OR IGNORE INTO subject_enrollments (subject_id, student_id, enrolled_date) VALUES (?, ?, ?)');
    const subIds = [mathSub.lastInsertRowid, phySub.lastInsertRowid, phyLabSub.lastInsertRowid, chemSub.lastInsertRowid, engSub.lastInsertRowid, csSub.lastInsertRowid];

    class10AStudents.forEach(s => {
      subIds.forEach(subId => {
        enrollStmt.run(subId, s.id, '2026-04-01');
      });
    });

    // Seed mock attendance sessions & records for Student 1 (Aarav Sharma) and Student 2 (Priya Patel)
    // Example: Mathematics (35 conducted, Aarav 28 attended = 80%), Physics Theory (35 conducted, Aarav 24 = 68.57%), Physics Lab (18 conducted, Aarav 16 = 88.89%)
    const sessionStmt = db.prepare(`
      INSERT INTO attendance_sessions (academic_year, date, class_sec, subject_id, period_number, teacher_code, status, conducted_by)
      VALUES (?, ?, ?, ?, ?, ?, 'Completed', 'Teacher')
    `);
    const pAttStmt = db.prepare(`
      INSERT INTO period_attendance (session_id, student_id, status)
      VALUES (?, ?, ?)
    `);

    // Math: 35 sessions
    for (let i = 1; i <= 35; i++) {
      const d = new Date(Date.now() - (36 - i) * 86400000).toISOString().split('T')[0];
      const sess = sessionStmt.run('2026-2027', d, '10-A', mathSub.lastInsertRowid, 1, 'TCH-101');
      // Aarav attended 28 out of 35
      const aaravStatus = i <= 28 ? 'Present' : (i === 29 ? 'Late' : 'Absent');
      pAttStmt.run(sess.lastInsertRowid, 1, aaravStatus);
      pAttStmt.run(sess.lastInsertRowid, 2, 'Present');
    }

    // Physics Theory: 35 sessions (Aarav 24 attended)
    for (let i = 1; i <= 35; i++) {
      const d = new Date(Date.now() - (36 - i) * 86400000).toISOString().split('T')[0];
      const sess = sessionStmt.run('2026-2027', d, '10-A', phySub.lastInsertRowid, 2, 'TCH-102');
      const aaravStatus = i <= 24 ? 'Present' : 'Absent';
      pAttStmt.run(sess.lastInsertRowid, 1, aaravStatus);
      pAttStmt.run(sess.lastInsertRowid, 2, 'Present');
    }

    // Physics Lab: 18 sessions (Aarav 16 attended)
    for (let i = 1; i <= 18; i++) {
      const d = new Date(Date.now() - (20 - i) * 86400000 * 2).toISOString().split('T')[0];
      const sess = sessionStmt.run('2026-2027', d, '10-A', phyLabSub.lastInsertRowid, 5, 'TCH-102');
      const aaravStatus = i <= 16 ? 'Present' : 'Absent';
      pAttStmt.run(sess.lastInsertRowid, 1, aaravStatus);
      pAttStmt.run(sess.lastInsertRowid, 2, 'Present');
    }
  }

  // Communication settings seeds (Module 2)
  const commSettings = [
    { key: 'email_enabled', value: 'false' },
    { key: 'email_provider', value: 'smtp' },
    { key: 'smtp_host', value: 'smtp.gmail.com' },
    { key: 'smtp_port', value: '587' },
    { key: 'smtp_secure', value: 'false' },
    { key: 'smtp_user', value: 'notifications@smartschool.edu' },
    { key: 'smtp_pass', value: '' },
    { key: 'email_sender_name', value: 'Smart School Office' },
    { key: 'email_sender_address', value: 'notifications@smartschool.edu' },
    { key: 'sms_enabled', value: 'false' },
    { key: 'sms_provider', value: 'twilio' },
    { key: 'twilio_account_sid', value: '' },
    { key: 'twilio_auth_token', value: '' },
    { key: 'twilio_sender_number', value: '+15551234567' },
  ];
  const settingStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  commSettings.forEach(s => settingStmt.run(s.key, s.value));

  // Seed sample communication logs if empty
  const commLogCount = db.prepare('SELECT COUNT(*) as count FROM communication_logs').get().count;
  if (commLogCount === 0) {
    const insertLog = db.prepare(`
      INSERT INTO communication_logs (student_id, recipient, recipient_type, notification_type, subject, message, provider, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertLog.run(1, 'rajesh.sharma@example.com', 'email', 'absence_alert', 'Attendance Notice: Aarav Sharma', 'Student Aarav Sharma was marked absent in Period 2 (Physics Theory) on today.', 'nodemailer', 'Delivered');
    insertLog.run(1, '9876543210', 'sms', 'subject_defaulter', 'Low Attendance Alert', 'Notice: Aarav Sharma attendance in Physics Theory has dropped to 68.57% (Below 75%).', 'twilio', 'Sent');
  }
}

// Initialize tables and seed data
initDatabase();

module.exports = {
  db,
  initDatabase,
};

