const nodemailer = require('nodemailer');
const { db } = require('../db');

/**
 * Helper to fetch a setting value
 */
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

/**
 * Mask sensitive credentials for safe API return
 */
function maskSecret(val) {
  if (!val || val.length <= 4) return '••••••••';
  return val.slice(0, 2) + '••••••••' + val.slice(-2);
}

/**
 * Get communication settings with masked credentials for UI
 */
function getCommunicationConfig() {
  return {
    email: {
      enabled: getSetting('email_enabled', 'false') === 'true',
      provider: getSetting('email_provider', 'smtp'),
      smtp_host: getSetting('smtp_host', 'smtp.gmail.com'),
      smtp_port: parseInt(getSetting('smtp_port', '587'), 10),
      smtp_secure: getSetting('smtp_secure', 'false') === 'true',
      smtp_user: getSetting('smtp_user', ''),
      smtp_pass_masked: getSetting('smtp_pass') ? maskSecret(getSetting('smtp_pass')) : '',
      sender_name: getSetting('email_sender_name', 'Smart School Office'),
      sender_address: getSetting('email_sender_address', 'notifications@smartschool.edu'),
    },
    sms: {
      enabled: getSetting('sms_enabled', 'false') === 'true',
      provider: getSetting('sms_provider', 'twilio'),
      twilio_account_sid_masked: getSetting('twilio_account_sid') ? maskSecret(getSetting('twilio_account_sid')) : '',
      twilio_auth_token_masked: getSetting('twilio_auth_token') ? maskSecret(getSetting('twilio_auth_token')) : '',
      twilio_sender_number: getSetting('twilio_sender_number', '+15551234567'),
    }
  };
}

/**
 * Build Nodemailer transporter from current settings
 */
function createTransporter() {
  const host = getSetting('smtp_host', 'smtp.gmail.com');
  const port = parseInt(getSetting('smtp_port', '587'), 10);
  const secure = getSetting('smtp_secure', 'false') === 'true';
  const user = getSetting('smtp_user', '');
  const pass = getSetting('smtp_pass', '');

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
}

/**
 * Log communication event to database
 */
function logCommunication(data) {
  const stmt = db.prepare(`
    INSERT INTO communication_logs (
      student_id, recipient, recipient_type, notification_type,
      subject, message, provider, status, failure_reason, retry_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const res = stmt.run(
    data.studentId || null,
    data.recipient,
    data.recipientType, // 'email' or 'sms'
    data.notificationType,
    data.subject || null,
    data.message,
    data.provider,
    data.status, // 'Queued', 'Sent', 'Delivered', 'Failed'
    data.failureReason || null
  );

  return res.lastInsertRowid;
}

/**
 * Send an email notification (asynchronous, non-blocking)
 */
async function sendEmailNotification({ studentId, toEmail, subject, text, html, notificationType = 'general' }) {
  const emailEnabled = getSetting('email_enabled', 'false') === 'true';
  const senderName = getSetting('email_sender_name', 'Smart School Office');
  const senderAddress = getSetting('email_sender_address', 'notifications@smartschool.edu');
  const from = `"${senderName}" <${senderAddress}>`;

  if (!toEmail) {
    logCommunication({
      studentId,
      recipient: 'No Email Provided',
      recipientType: 'email',
      notificationType,
      subject,
      message: text,
      provider: 'none',
      status: 'Failed',
      failureReason: 'Missing recipient email address',
    });
    return { success: false, error: 'Missing recipient email' };
  }

  // If email gateway disabled or credentials missing, log simulated test dispatch
  const transporter = createTransporter();
  if (!emailEnabled || !transporter) {
    const logId = logCommunication({
      studentId,
      recipient: toEmail,
      recipientType: 'email',
      notificationType,
      subject,
      message: text,
      provider: 'mock_smtp',
      status: 'Sent',
      failureReason: null,
    });
    return { success: true, logId, provider: 'mock_smtp', note: 'Logged via offline/mock gateway (credentials unconfigured)' };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
      html: html || `<p>${text.replace(/\n/g, '<br/>')}</p>`,
    });

    const logId = logCommunication({
      studentId,
      recipient: toEmail,
      recipientType: 'email',
      notificationType,
      subject,
      message: text,
      provider: 'nodemailer',
      status: 'Delivered',
      failureReason: null,
    });

    return { success: true, logId, messageId: info.messageId };
  } catch (err) {
    const logId = logCommunication({
      studentId,
      recipient: toEmail,
      recipientType: 'email',
      notificationType,
      subject,
      message: text,
      provider: 'nodemailer',
      status: 'Failed',
      failureReason: err.message,
    });

    return { success: false, error: err.message, logId };
  }
}

/**
 * Send an SMS notification (asynchronous, non-blocking)
 */
async function sendSmsNotification({ studentId, toPhone, message, notificationType = 'general' }) {
  const smsEnabled = getSetting('sms_enabled', 'false') === 'true';
  const accountSid = getSetting('twilio_account_sid', '');
  const authToken = getSetting('twilio_auth_token', '');
  const fromNumber = getSetting('twilio_sender_number', '+15551234567');

  if (!toPhone) {
    logCommunication({
      studentId,
      recipient: 'No Phone Provided',
      recipientType: 'sms',
      notificationType,
      subject: 'SMS Alert',
      message,
      provider: 'none',
      status: 'Failed',
      failureReason: 'Missing parent phone number',
    });
    return { success: false, error: 'Missing recipient phone' };
  }

  if (!smsEnabled || !accountSid || !authToken) {
    // Log simulated delivery
    const logId = logCommunication({
      studentId,
      recipient: toPhone,
      recipientType: 'sms',
      notificationType,
      subject: 'SMS Alert',
      message,
      provider: 'mock_twilio',
      status: 'Sent',
      failureReason: null,
    });
    return { success: true, logId, provider: 'mock_twilio', note: 'Logged via offline/mock SMS gateway' };
  }

  try {
    // Basic Twilio HTTP REST client via fetch without extra dependency
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({
      To: toPhone.startsWith('+') ? toPhone : '+91' + toPhone,
      From: fromNumber,
      Body: message
    });

    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Twilio SMS failed');

    const logId = logCommunication({
      studentId,
      recipient: toPhone,
      recipientType: 'sms',
      notificationType,
      subject: 'SMS Alert',
      message,
      provider: 'twilio',
      status: data.status === 'delivered' ? 'Delivered' : 'Sent',
      failureReason: null,
    });

    return { success: true, logId, sid: data.sid };
  } catch (err) {
    const logId = logCommunication({
      studentId,
      recipient: toPhone,
      recipientType: 'sms',
      notificationType,
      subject: 'SMS Alert',
      message,
      provider: 'twilio',
      status: 'Failed',
      failureReason: err.message,
    });

    return { success: false, error: err.message, logId };
  }
}

/**
 * Automated trigger: Student marked absent in period-wise attendance
 */
async function triggerPeriodAbsenceAlert({ studentId, subjectName, periodNumber, date, currentPct }) {
  const student = db.prepare('SELECT name, roll, parent_email, parent_phone FROM students WHERE id = ?').get(studentId);
  if (!student) return;

  const emailSubject = `Attendance Alert: ${student.name} — Absence in Period ${periodNumber}`;
  const textBody = `Dear Parent/Guardian,\n\nThis is an automated notification from Smart School Administration.\n\nYour child ${student.name} (Roll Number: ${student.roll}) was marked ABSENT in:\n- Subject: ${subjectName}\n- Period: ${periodNumber}\n- Date: ${date}\n- Current Subject Attendance: ${currentPct}%\n\nPlease contact the school administration if you require further information.\n\nRegards,\nSmart School Administration`;

  const smsBody = `Smart School Alert: ${student.name} (${student.roll}) was marked Absent in Period ${periodNumber} (${subjectName}) on ${date}. Current subject attendance: ${currentPct}%.`;

  // Asynchronous dispatches
  sendEmailNotification({
    studentId,
    toEmail: student.parent_email,
    subject: emailSubject,
    text: textBody,
    notificationType: 'absence_alert'
  }).catch(() => {});

  sendSmsNotification({
    studentId,
    toPhone: student.parent_phone,
    message: smsBody,
    notificationType: 'absence_alert'
  }).catch(() => {});
}

/**
 * Automated trigger: Subject attendance falls below subject minimum threshold
 */
async function triggerSubjectDefaulterAlert({ studentId, subjectName, currentPct, minPct, neededSessions }) {
  const student = db.prepare('SELECT name, roll, parent_email, parent_phone FROM students WHERE id = ?').get(studentId);
  if (!student) return;

  const emailSubject = `⚠️ Subject Defaulter Warning: ${student.name} in ${subjectName}`;
  const textBody = `Dear Parent/Guardian,\n\nOfficial attendance audit advisory regarding ${student.name} (Roll: ${student.roll}).\n\nAttendance in ${subjectName} has fallen to ${currentPct}%, below the mandatory subject threshold of ${minPct}%.\n\nRecovery Plan: The student must attend the next ${neededSessions} consecutive class sessions without missing to restore eligibility.\n\nRegards,\nAcademic Dean & Attendance Office`;

  const smsBody = `Attendance Warning: ${student.name} attendance in ${subjectName} is ${currentPct}% (Below required ${minPct}%). Next ${neededSessions} consecutive sessions required for exam clearance.`;

  sendEmailNotification({
    studentId,
    toEmail: student.parent_email,
    subject: emailSubject,
    text: textBody,
    notificationType: 'subject_defaulter'
  }).catch(() => {});

  sendSmsNotification({
    studentId,
    toPhone: student.parent_phone,
    message: smsBody,
    notificationType: 'subject_defaulter'
  }).catch(() => {});
}

/**
 * Retry a failed communication dispatch log
 */
async function retryDispatch(logId) {
  const log = db.prepare('SELECT * FROM communication_logs WHERE id = ?').get(logId);
  if (!log) throw new Error('Dispatch log not found');

  db.prepare("UPDATE communication_logs SET status = 'Retrying', retry_count = retry_count + 1 WHERE id = ?").run(logId);

  let result = null;
  if (log.recipient_type === 'email') {
    result = await sendEmailNotification({
      studentId: log.student_id,
      toEmail: log.recipient,
      subject: log.subject || 'School Notice',
      text: log.message,
      notificationType: log.notification_type,
    });
  } else {
    result = await sendSmsNotification({
      studentId: log.student_id,
      toPhone: log.recipient,
      message: log.message,
      notificationType: log.notification_type,
    });
  }

  const finalStatus = result.success ? 'Delivered' : 'Failed';
  db.prepare('UPDATE communication_logs SET status = ?, failure_reason = ? WHERE id = ?')
    .run(finalStatus, result.error || null, logId);

  return { success: result.success, logId, status: finalStatus };
}

module.exports = {
  getCommunicationConfig,
  sendEmailNotification,
  sendSmsNotification,
  triggerPeriodAbsenceAlert,
  triggerSubjectDefaulterAlert,
  retryDispatch,
  logCommunication,
};

