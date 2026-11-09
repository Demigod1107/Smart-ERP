# SMART SCHOOL — REST API Documentation

This document provides a comprehensive specification for the Smart School REST API. All endpoints communicate over JSON, utilize HTTP status codes, and support token-based authentication via `Authorization: Bearer <token>`.

---

## 1. Authentication & Session APIs

### `POST /api/auth/login`
Authenticates an administrator, teacher, or parent.
- **Request Body**:
  ```json
  {
    "username": "admin",
    "password": "password123"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "fullName": "Administrator"
    }
  }
  ```

### `GET /api/auth/me`
Fetches current session claims.
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: User profile object.

---

## 2. Dashboard & Analytical Metrics

### `GET /api/dashboard/stats`
Returns aggregated real-time counts from the database.
- **Query Parameters**:
  - `class` (optional, e.g. `10-A` or `All`)
  - `date` (optional, `YYYY-MM-DD`, defaults to today)
- **Response (200 OK)**:
  ```json
  {
    "totalStudents": 45,
    "presentToday": 38,
    "absentToday": 4,
    "lateToday": 3,
    "attendancePercentage": 84.4,
    "defaultersCount": 2,
    "todayPeriodAttendanceCount": 6,
    "subjectDefaultersCount": 1,
    "pendingCommAlertsCount": 0,
    "failedCommCount": 0,
    "lastBackup": "2026-11-09 17:30:00",
    "backupHealth": "Healthy"
  }
  ```

### `GET /api/dashboard/charts`
Returns 7-day trend series, status distributions, and class comparisons.

---

## 3. Daily & Period-Wise Attendance APIs

### `GET /api/attendance`
Retrieves daily roll-call roster for a class and date with 5-day streak trends.
- **Query Parameters**: `class` (required), `date` (required)

### `POST /api/attendance/mark`
Records individual attendance status with audit tracking.
- **Request Body**:
  ```json
  {
    "studentId": 1,
    "date": "2026-11-09",
    "status": "Present",
    "remarks": "On time",
    "markedBy": "Sunita Rao"
  }
  ```

### `POST /api/attendance/mark-all`
Marks all enrolled students in a class with a single status (e.g., "Present").
- **Request Body**:
  ```json
  {
    "classSec": "10-A",
    "date": "2026-11-09",
    "status": "Present",
    "markedBy": "Sunita Rao"
  }
  ```

### `GET /api/periods`
Retrieves configured period timetable definitions.
- **Response (200 OK)**: Array of periods (Period number, name, start/end time, type).

### `GET /api/subjects`
Retrieves subject catalog with configured attendance thresholds.
- **Query Parameters**: `class` (optional)
- **Response (200 OK)**:
  ```json
  {
    "subjects": [
      {
        "id": 1,
        "code": "MATH-10A",
        "name": "Mathematics Theory",
        "type": "Theory",
        "class_sec": "10-A",
        "min_attendance_pct": 75.0,
        "enrolledStudents": 24
      }
    ]
  }
  ```

### `POST /api/subjects`
Creates a new subject with a custom threshold requirement.
- **Request Body**:
  ```json
  {
    "code": "CSLAB-10A",
    "name": "Computer Science Practical",
    "type": "Practical",
    "class_sec": "10-A",
    "min_attendance_pct": 80.0
  }
  ```

### `PUT /api/subjects/:id/threshold`
Updates attendance eligibility threshold for a subject.
- **Request Body**:
  ```json
  {
    "threshold": 80.0
  }
  ```

### `GET /api/attendance/sessions`
Queries past period attendance sessions.
- **Query Parameters**: `classSec`, `subjectId`, `date`, `periodNumber`

### `POST /api/attendance/period-wise`
Submits attendance for an academic subject period.
- **Request Body**:
  ```json
  {
    "date": "2026-11-09",
    "classSec": "10-A",
    "subjectId": 1,
    "periodNumber": 1,
    "conductedBy": "Sunita Rao",
    "records": [
      { "studentId": 1, "status": "Present", "remarks": "Participated" },
      { "studentId": 2, "status": "Absent", "remarks": "Unexcused" }
    ]
  }
  ```

### `GET /api/attendance/student/:studentId/subjects`
Calculates comprehensive subject-wise attendance performance for a student, including minimum recovery sessions required to regain compliance.
- **Response (200 OK)**:
  ```json
  {
    "studentId": 1,
    "studentName": "Aarav Sharma",
    "rollNo": "10A-01",
    "classSec": "10-A",
    "subjects": [
      {
        "subjectId": 1,
        "subjectName": "Mathematics Theory",
        "subjectCode": "MATH-10A",
        "type": "Theory",
        "attended": 28,
        "conducted": 35,
        "late": 0,
        "excused": 0,
        "percentage": 80.0,
        "requiredPercentage": 75.0,
        "isEligible": true,
        "recoverySessions": 0
      }
    ]
  }
  ```

---

## 4. Communication Gateway & Dispatch APIs

### `GET /api/settings/communications`
Returns active email and SMS provider configurations with **passwords, tokens, and Auth SIDs masked**.
- **Response (200 OK)**:
  ```json
  {
    "config": {
      "email": {
        "provider": "smtp",
        "host": "smtp.mailgun.org",
        "port": 587,
        "secure": false,
        "user": "postmaster@...",
        "pass": "••••••••",
        "from": "Smart School Notifications <notifications@school.edu>"
      },
      "sms": {
        "provider": "twilio",
        "accountSid": "AC••••••••••••••••",
        "authToken": "••••••••",
        "fromPhone": "+1234567890"
      }
    }
  }
  ```

### `POST /api/settings/communications/email`
Updates SMTP / Gmail / SendGrid gateway credentials.

### `POST /api/settings/communications/sms`
Updates Twilio SMS configuration.

### `POST /api/settings/communications/test-email`
Sends a test diagnostic email to verify SMTP gateway credentials.
- **Request Body**: `{"testEmail": "admin@school.edu"}`

### `POST /api/settings/communications/test-sms`
Sends a test diagnostic SMS message to verify Twilio connectivity.
- **Request Body**: `{"testPhone": "+15551234567"}`

### `GET /api/notifications/dispatch-logs`
Returns the persistent dispatch log table with filter options.
- **Query Parameters**: `channel` (email|sms), `status` (delivered|sent|failed), `limit`
- **Response (200 OK)**: Array of communication records with timestamps, recipients, subjects, providers, statuses, and error notes.

### `POST /api/notifications/:id/retry`
Retries sending a previously failed email or SMS notification.

---

## 5. Database Backup, Integrity & Restore APIs

### `GET /api/admin/backups`
Lists all available backup files stored in the `backups/` directory with size, checksum, and format.

### `POST /api/admin/backups`
Creates an on-demand database snapshot.
- **Request Body**:
  ```json
  {
    "format": "sql" // or "json"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "fileName": "backup_2026-11-09T18-00-00-000Z.sql",
    "sizeBytes": 145890,
    "sha256": "4b68e...",
    "format": "sql"
  }
  ```

### `GET /api/admin/backups/:id/download`
Downloads the requested `.sql` or `.json` backup file with appropriate attachment headers.

### `POST /api/admin/backups/validate`
Validates the cryptographic and structural integrity of a backup file without modifying the active database.
- **Request Body**: `{"backupId": "backup_2026-11-09T18-00-00-000Z.json", "format": "json"}`
- **Response (200 OK)**:
  ```json
  {
    "valid": true,
    "message": "Backup verified intact. All required tables present."
  }
  ```

### `POST /api/admin/backups/restore`
Executes an atomic restore. Automatically creates a safety snapshot before modifying the active database.
- **Request Body**:
  ```json
  {
    "backupId": "backup_2026-11-09T18-00-00-000Z.json",
    "restoredBy": "admin"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "preRestoreBackup": "pre_restore_safety_backup_2026-11-09T18-05-00-000Z.json",
    "message": "Database restored successfully."
  }
  ```

### `GET /api/admin/backups/restore-history`
Lists all historical restore events with operator names, source backups, and statuses.

### `DELETE /api/admin/backups/:id`
Deletes an old backup archive file.

---

## 6. Student & Teacher Management APIs

- `GET /api/students`: Lists students filtered by class or search query.
- `POST /api/students`: Registers a new student with uniqueness validation.
- `GET /api/students/:id`: Returns full student dossier and guardian info.
- `PUT /api/students/:id`: Updates student details.
- `DELETE /api/students/:id`: Soft-archives or removes student record.
- `POST /api/students/import-csv`: Batch-inserts student records from CSV.
- `GET /api/teachers`: Returns teacher faculty directory.
- `POST /api/teachers`: Enrolls a new faculty member with subject allocations.

---

## 7. Leave & Geolocation APIs

- `GET /api/leaves`: Fetches submitted leave applications.
- `POST /api/leaves`: Submits a guardian or student leave request.
- `PUT /api/leaves/:id`: Approves or rejects leave with automatic attendance sync.

