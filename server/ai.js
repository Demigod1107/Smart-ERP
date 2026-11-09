const { db } = require('./db');

function getStudentAttendanceStats(studentId) {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId);
  if (!student) return null;

  const records = db.prepare(`
    SELECT date, status, period FROM attendance 
    WHERE student_id = ? AND period = 0 
    ORDER BY date ASC
  `).all(studentId);

  let presentCount = student.base_present || 0;
  let totalCount = student.base_total || 0;

  records.forEach(r => {
    totalCount += 1;
    if (r.status === 'Present') presentCount += 1;
    else if (r.status === 'Late') presentCount += 0.5;
    else if (r.status === 'Excused') {
      // Excused does not penalize attendance percentage (or counts toward approved leave)
      presentCount += 1;
    }
  });

  const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
  return { student, records, presentCount, totalCount, pct };
}

// Module M: AI Attendance Insights
function generateAttendanceInsights(classSec = 'All') {
  let query = "SELECT * FROM students WHERE status = 'Active'";
  let params = [];
  if (classSec !== 'All') {
    query += ' AND class_sec = ?';
    params.push(classSec);
  }
  const students = db.prepare(query).all(...params);

  const decliningStudents = [];
  const streakAbsentees = [];
  const perfectStudents = [];
  let totalPctSum = 0;

  students.forEach(s => {
    const stats = getStudentAttendanceStats(s.id);
    if (!stats) return;

    totalPctSum += stats.pct;

    // Check last 5 records
    const recent = stats.records.slice(-5);
    const recentAbsences = recent.filter(r => r.status === 'Absent').length;
    const recentLates = recent.filter(r => r.status === 'Late').length;

    // Consecutive absences at the tail
    let consecutiveAbsents = 0;
    for (let i = stats.records.length - 1; i >= 0; i--) {
      if (stats.records[i].status === 'Absent') {
        consecutiveAbsents++;
      } else {
        break;
      }
    }

    if (consecutiveAbsents >= 2) {
      streakAbsentees.push({
        student: s,
        consecutiveAbsents,
        pct: stats.pct,
        recommendation: `Immediate parental phone outreach recommended. ${consecutiveAbsents} consecutive missed days.`,
      });
    }

    if (recentAbsences >= 2 || stats.pct < 75) {
      decliningStudents.push({
        student: s,
        pct: stats.pct,
        recentAbsences,
        recentLates,
        reason: `${recentAbsences} absences in last 5 sessions; current cumulative attendance is ${stats.pct}%.`,
        recommendation: stats.pct < 75 
          ? 'Initiate remedial academic counseling & mandatory guardian meeting.' 
          : 'Early warning: Student slipping towards defaulter threshold.',
      });
    }

    if (stats.pct >= 95) {
      perfectStudents.push({
        student: s,
        pct: stats.pct,
      });
    }
  });

  const avgClassPct = students.length > 0 ? Math.round(totalPctSum / students.length) : 0;

  return {
    summary: {
      totalAnalyzed: students.length,
      averageAttendanceRate: avgClassPct,
      atRiskCount: decliningStudents.length,
      criticalStreakCount: streakAbsentees.length,
      highAchieversCount: perfectStudents.length,
    },
    decliningStudents,
    streakAbsentees,
    insights: [
      {
        type: avgClassPct >= 80 ? 'positive' : 'warning',
        title: 'Cohort Engagement Level',
        text: `Class overall attendance is sitting at ${avgClassPct}%. ${decliningStudents.length} of ${students.length} students exhibit downward attendance trends.`,
      },
      {
        type: streakAbsentees.length > 0 ? 'alert' : 'info',
        title: 'Consecutive Absence Warning',
        text: streakAbsentees.length > 0
          ? `${streakAbsentees.length} student(s) have consecutive unexplained absences requiring welfare check-in.`
          : 'No critical consecutive unexcused absence streaks detected today.',
      },
      {
        type: 'intervention',
        title: 'Recommended Automated Action',
        text: decliningStudents.length > 0 
          ? `Issue batch SMS/WhatsApp attendance advisories to the ${decliningStudents.length} parents with children below 75% threshold.`
          : 'Attendance patterns are stable across sections.',
      }
    ]
  };
}

// Module M: Predictive Risk Model
function calculateAttendancePrediction(classSec = 'All') {
  let query = "SELECT * FROM students WHERE status = 'Active'";
  let params = [];
  if (classSec !== 'All') {
    query += ' AND class_sec = ?';
    params.push(classSec);
  }
  const students = db.prepare(query).all(...params);

  const predictions = students.map(s => {
    const stats = getStudentAttendanceStats(s.id);
    const { presentCount, totalCount, pct } = stats;

    // Mathematical projection for reaching 75%
    // Formula: (presentCount + x) / (totalCount + x) >= 0.75
    // => presentCount + x >= 0.75 * totalCount + 0.75 * x
    // => 0.25 * x >= 0.75 * totalCount - presentCount
    // => x >= (3 * totalCount - 4 * presentCount)
    let requiredClasses = 0;
    if (pct < 75) {
      requiredClasses = Math.max(1, Math.ceil(3 * totalCount - 4 * presentCount));
    }

    let safeClassesToMiss = 0;
    if (pct >= 75 && totalCount > 0) {
      // (presentCount) / (totalCount + y) >= 0.75 => 4*presentCount >= 3*(totalCount + y)
      // 3*y <= 4*presentCount - 3*totalCount => y <= (4*presentCount - 3*totalCount) / 3
      safeClassesToMiss = Math.max(0, Math.floor((4 * presentCount - 3 * totalCount) / 3));
    }

    // Risk factors & transparent scoring (0 to 100 Risk Score)
    const recent = stats.records.slice(-5);
    const recentAbsentCount = recent.filter(r => r.status === 'Absent').length;
    const recentLateCount = recent.filter(r => r.status === 'Late').length;

    let riskScore = 0;
    const riskFactors = [];

    if (pct < 75) {
      const deficit = 75 - pct;
      const baseRisk = Math.min(60, deficit * 3);
      riskScore += baseRisk;
      riskFactors.push(`Below 75% threshold (${pct}%): +${baseRisk} risk points`);
    } else if (pct < 80) {
      riskScore += 20;
      riskFactors.push(`Borderline buffer (<80%): +20 risk points`);
    }

    if (recentAbsentCount >= 2) {
      const add = recentAbsentCount * 12;
      riskScore += add;
      riskFactors.push(`Recent unexcused absences (${recentAbsentCount} in last 5 days): +${add} risk points`);
    }

    if (recentLateCount >= 2) {
      riskScore += 10;
      riskFactors.push(`Chronic tardiness pattern (${recentLateCount} late arrivals): +10 risk points`);
    }

    // Cap at 99% max unless already 0%
    riskScore = Math.min(99, Math.max(5, riskScore));

    let riskCategory = 'Low Risk';
    if (riskScore >= 70) riskCategory = 'High Risk (Defaulter)';
    else if (riskScore >= 40) riskCategory = 'Moderate Risk';

    return {
      studentId: s.id,
      roll: s.roll,
      name: s.name,
      classSec: s.class_sec,
      phone: s.parent_phone,
      currentPct: pct,
      presentSessions: presentCount,
      totalSessions: totalCount,
      requiredClassesToRecover: requiredClasses,
      safeClassesToMiss,
      riskScore,
      riskCategory,
      riskFactors,
    };
  });

  // Sort descending by risk score
  predictions.sort((a, b) => b.riskScore - a.riskScore);
  return predictions;
}

module.exports = {
  getStudentAttendanceStats,
  generateAttendanceInsights,
  calculateAttendancePrediction,
};
