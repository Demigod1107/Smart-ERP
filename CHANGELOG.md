# CHANGELOG — Smart School Attendance Management System

All notable changes to this project are documented in this file.

---

## [Version 4.5.0] — 2026-11-09

### Major Upgrade: Advanced Academic Attendance, Carrier Communications & Database Administration

#### Added — Module 1: Subject-Wise & Period-Wise Attendance Tracking
- **Academic Periods & Schedule**:
  - Created `periods` table with seed data for 6 instructional blocks.
  - Created `subjects` table supporting granular threshold percentages (e.g. 75% Theory, 80% Practical Lab).
  - Created `subject_enrollments` table mapping students to specific subjects.
  - Created `attendance_sessions` and `period_attendance` tables with composite unique constraints preventing duplicate session submissions.
- **Period Attendance UI (`period-attendance.html`)**:
  - Filterable by Academic Year, Class, Section, Subject, Period, and Date.
  - Roll-call table supporting **Present**, **Absent**, **Late**, and **Excused** marks with individual remark inputs.
  - "Mark All Present" batch action, search filter, roll number sorting, and submission confirmation modal.
  - Interactive submission summary drawer.
- **Subject Attendance & Configurable Thresholds (`subject-attendance.html`)**:
  - Editable threshold inputs per subject with instant database persistence (`PUT /api/subjects/:id/threshold`).
  - Class-wide subject roster displaying Attended, Conducted, Percentage, Eligibility Status, and Recovery Sessions.
- **Mathematical Recovery Formula**:
  - Implemented exact formula with IEEE 754 precision correction:
    $$x = \max\left(1, \left\lceil \frac{rT - P}{1 - r} \right\rceil\right)$$
- **Student Profile Integration (`profile.html`)**:
  - Added "Subject-Wise Attendance Performance" section to individual student dossiers.
  - Responsive table showing subject attendance breakdowns and compliance badges.
  - Native HTML5 Canvas bar chart comparing student attendance percentages against individual subject thresholds.
- **Teacher Authorization**:
  - Enforced teacher subject and class boundaries in backend service (`attendancePeriodService.js`).

#### Added — Module 2: Email & SMS Carrier Communication Gateway
- **Nodemailer Integration**:
  - Implemented multi-provider transporter in `communicationService.js` supporting standard SMTP, Gmail (App Passwords), and SendGrid relay.
- **Twilio SMS Client**:
  - Direct SMS dispatch integration for automated emergency alerts and parental attendance notices.
- **Masked Secrets Management**:
  - Added secret masking (`maskSecret`) on all communication settings endpoints to ensure passwords and API tokens are never exposed in UI or logs.
- **Diagnostic Testing Modals**:
  - Interactive "Test Email Gateway" and "Test SMS Gateway" modals in `settings-communication.html` for real-time provider verification.
- **Automated Event Triggers**:
  - Automatic dispatch of email and SMS alerts upon period absence marking or falling below subject eligibility thresholds.
- **Dispatch History & Retry Log (`communication-dispatch.html`)**:
  - Persistent tracking table `communication_logs` recording channel, recipient, subject, provider, timestamp, status, and error messages.
  - One-click retry action for failed dispatches.

#### Added — Module 3: Database Administration, Backup & Restore
- **Dual Export Engines**:
  - Implemented SQL dump (`.sql`) with full schema DDL and table insert DML wrapped in transactional blocks.
  - Implemented structured JSON (`.json`) with metadata and full relational table documents.
- **SHA-256 Cryptographic Verification**:
  - Automated hash generation and validation verifying file integrity before restoration.
- **Automated Pre-Restore Safety Snapshot**:
  - Restore operations automatically write a safety snapshot before modifying active tables to ensure zero data loss.
- **Database Management UI (`settings-database.html`)**:
  - On-demand backup generation buttons, backup download links, integrity indicators, safety confirmation modals, and historical restore audits.

#### Enhanced — Core UI & Navigation
- **Categorized Sidebar Navigation**:
  - Reorganized sidebar across all 11 HTML pages into clean functional groups:
    - **ATTENDANCE**: Daily Attendance, Period-Wise, Subject-Wise, Calendar, Timetable.
    - **DIRECTORY**: Students, Teachers.
    - **COMMUNICATION**: Gateway Settings, Dispatch History.
    - **ADMINISTRATION**: Reports & Defaulters, Leaves, Database & Backup.
- **Dashboard Operational Cards (`index.html`)**:
  - Added 4 live operational stat cards: Today's Period Sessions, Subject Defaulters, Gateway Alerts, and Database Backup Health.
- **Progressive Web App Offline Support**:
  - Updated `sw.js` cache manifest to version `smart-school-cache-v4.5` caching all new views.

#### Added — Quality Assurance & Testing
- Zero-dependency automated test runner (`npm test`) passing **44 of 44 tests (100%)**:
  - 23 Unit Tests (`test/test_suite.js`)
  - 21 REST API Integration Tests (`test/api_test.js`)
- Full documentation suite:
  - `README.md`, `API_DOCUMENTATION.md`, `DATABASE_SCHEMA.md`, `BACKUP_AND_RESTORE.md`, `COMMUNICATION_SETUP.md`, `INSTALLATION.md`, `SECURITY.md`, `TESTING.md`, `.env.example`.

---

## [Version 4.0.0] — 2026-11-08
- Initial full-day relational architecture with daily attendance, student directory, teacher portal, leaves, and 75% defaulter advisor.

