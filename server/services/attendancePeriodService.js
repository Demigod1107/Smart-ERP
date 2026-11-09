const { db } = require('../db');

/**
 * Calculate subject-wise attendance statistics and recovery requirements for a student
 * Formula:
 * Attendance Pct = (P / T) * 100
 * Minimum future consecutive present sessions x needed to reach r (where r = minPct / 100):
 * (P + x) / (T + x) >= r => x >= (r*T - P) / (1 - r)
 * x = Math.max(1, Math.ceil((r * T - P) / (1 - r)))
 */
function getStudentSubjectStats(studentId, subjectId) {
  const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) return null;

  const minPct = subject.min_attendance_pct || 75.0;
  const r = minPct / 100.0;

  // Conducted sessions for this subject
  const sessions = db.prepare(`
    SELECT s.id, s.date, s.period_number, s.status as session_status,
           pa.status as attendance_status, pa.remarks
    FROM attendance_sessions s
    LEFT JOIN period_attendance pa ON pa.session_id = s.id AND pa.student_id = ?
    WHERE s.subject_id = ? AND s.status != 'Cancelled'
    ORDER BY s.date ASC, s.period_number ASC
  `).all(studentId, subjectId);

  let conducted = 0;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  sessions.forEach(sess => {
    // Cancelled or unscheduled sessions are excluded
    conducted++;
    const st = sess.attendance_status || 'Unmarked';
    if (st === 'Present') {
      presentCount += 1;
    } else if (st === 'Late') {
      lateCount += 1;
      presentCount += 0.5; // Institutional late weight
    } else if (st === 'Excused') {
      excusedCount += 1;
      presentCount += 1; // Approved excused leave counts toward attendance
    } else if (st === 'Absent') {
      absentCount += 1;
    }
  });

  const percentage = conducted > 0 ? parseFloat(((presentCount / conducted) * 100).toFixed(2)) : 100.0;
  const isEligible = percentage >= minPct;

  let recoverySessions = 0;
  let safeSessionsToMiss = 0;

  if (!isEligible) {
    // x = ceil((r * T - P) / (1 - r))
    const deficitNumerator = (r * conducted) - presentCount;
    const rawRecovery = deficitNumerator / (1.0 - r);
    recoverySessions = Math.max(1, Math.ceil(parseFloat(rawRecovery.toFixed(6))));
  } else if (conducted > 0) {
    // y = floor((P - r * T) / r)
    const rawSafe = (presentCount - (r * conducted)) / r;
    safeSessionsToMiss = Math.max(0, Math.floor(parseFloat(rawSafe.toFixed(6))));
  }

  return {
    subjectId: subject.id,
    subjectCode: subject.code,
    subjectName: subject.name,
    subjectType: subject.type,
    classSec: subject.class_sec,
    minAttendancePct: minPct,
    conducted,
    attended: presentCount,
    absent: absentCount,
    late: lateCount,
    excused: excusedCount,
    percentage,
    isEligible,
    eligibilityStatus: isEligible ? 'Eligible' : 'Defaulter',
    recoverySessions,
    safeSessionsToMiss,
    recentSessions: sessions.slice(-10),
  };
}

/**
 * Get all subject-wise attendance performance records for a student
 */
function getAllSubjectsForStudent(studentId) {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return null;

  // Subjects student is enrolled in, or subjects belonging to student's class
  const subjects = db.prepare(`
    SELECT DISTINCT s.* 
    FROM subjects s
    LEFT JOIN subject_enrollments se ON se.subject_id = s.id AND se.student_id = ?
    WHERE s.class_sec = ? OR se.student_id = ?
    ORDER BY s.code ASC
  `).all(studentId, student.class_sec, studentId);

  const statsList = subjects.map(sub => getStudentSubjectStats(studentId, sub.id));

  return {
    student,
    subjects: statsList,
    totalSubjects: statsList.length,
    eligibleSubjectsCount: statsList.filter(s => s.isEligible).length,
    defaulterSubjectsCount: statsList.filter(s => !s.isEligible).length,
  };
}

/**
 * Record or update period-wise attendance for a session with transactions
 */
function recordPeriodAttendance(sessionId, records, conductedBy = 'Teacher') {
  const session = db.prepare('SELECT * FROM attendance_sessions WHERE id = ?').get(sessionId);
  if (!session) throw new Error('Attendance session not found');

  const upsertStmt = db.prepare(`
    INSERT INTO period_attendance (session_id, student_id, status, remarks, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(session_id, student_id) DO UPDATE SET
      status = excluded.status,
      remarks = excluded.remarks,
      updated_at = CURRENT_TIMESTAMP
  `);

  const saveAll = db.transaction((list) => {
    for (const item of list) {
      upsertStmt.run(sessionId, item.studentId, item.status, item.remarks || null);
    }
    db.prepare("UPDATE attendance_sessions SET status = 'Completed', conducted_by = ? WHERE id = ?")
      .run(conductedBy, sessionId);
  });

  saveAll(records);
  return { success: true, count: records.length, sessionId };
}

/**
 * Check if a teacher is authorized to mark attendance for a class & subject
 */
function isTeacherAuthorized(user, classSec, subjectId, teacherCode) {
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;

  // Check assigned teacher
  const subject = db.prepare('SELECT teacher_code, class_sec FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) return false;

  const userTeacherId = user.teacher_id;
  if (userTeacherId && (userTeacherId === subject.teacher_code || userTeacherId === teacherCode)) {
    return true;
  }
  // Check assigned class
  if (user.assigned_class && user.assigned_class === classSec) {
    return true;
  }

  return false;
}

module.exports = {
  getStudentSubjectStats,
  getAllSubjectsForStudent,
  recordPeriodAttendance,
  isTeacherAuthorized,
};
