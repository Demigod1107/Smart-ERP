# SMART SCHOOL — Security & Compliance Architecture

This document describes the security policies, defense-in-depth safeguards, and data protection mechanisms implemented across Smart School.

---

## 1. Authentication & Password Security

### Password Hashing
- All user passwords stored in the `users` table are hashed using **`bcryptjs`** with work factor cost salt rounds ($2^{10}$ iterations).
- Plaintext passwords are never stored in the database, logged to the console, or returned via any API response.
- Password comparison is performed using constant-time string comparison in `bcrypt.compareSync()`.

### JSON Web Tokens (JWT)
- Sessions are managed through signed JWT tokens (`jsonwebtoken`).
- Tokens contain signed claims: `{ id, username, role, linkedId }`.
- Tokens expire after 24 hours.
- Verified on protected routes via the `authenticateToken` middleware.

---

## 2. Role-Based Access Control (RBAC)

Authorization is strictly enforced on the server-side, not merely hidden in the frontend navigation:

| Capability | Admin | Teacher | Parent |
|---|:---:|:---:|:---:|
| System Dashboard & Global Analytics | ✅ | ✅ (Class Filtered) | ❌ |
| Subject & Period Attendance Marking | ✅ | ✅ (Assigned Subjects Only) | ❌ |
| Teacher / Faculty Directory Management | ✅ | ❌ | ❌ |
| Student Directory Management (Add/Edit) | ✅ | ❌ | ❌ |
| Leave Approval / Rejection Workflow | ✅ | ❌ | ❌ |
| Leave Submission for Ward | ❌ | ❌ | ✅ |
| Communication Gateway Settings (SMTP/Twilio) | ✅ | ❌ | ❌ |
| Communication Dispatch Logs & Retry | ✅ | ❌ | ❌ |
| Database Backup & Restore Operations | ✅ | ❌ | ❌ |
| Student Personal Profile & Academic Report | ✅ | ✅ | ✅ (Own Child Only) |

### Teacher Subject Boundary Enforcement:
When a teacher submits period attendance (`POST /api/attendance/period-wise`), the backend verifies via `attendancePeriodService.isTeacherAuthorizedForSubject()` that the teacher's profile explicitly includes the target class and subject.

---

## 3. Communication Secrets Masking

To prevent credential leakage during screen sharing, screenshots, or accidental API exposure:
- All sensitive communication settings (`smtp_pass`, `twilio_auth_token`, `twilio_account_sid`) are filtered through `maskSecret()` before transmission over HTTP.
- Frontends receive masked strings (e.g. `••••••••` or `AC••••••••••••••••3a1f`).
- Updates only overwrite passwords if a new, unmasked string is explicitly supplied.

---

## 4. SQL Injection Protection

- All database queries in `server/db.js`, `server/server.js`, and services utilize parameterized prepared statements via `better-sqlite3`.
- Raw string concatenation into SQL clauses is strictly prohibited.
- Example:
  ```javascript
  // Secure: Parameterized prepared statement
  const stmt = db.prepare('SELECT * FROM students WHERE class_sec = ? AND status = ?');
  const rows = stmt.all(classSec, 'Active');
  ```

---

## 5. Database Resilience & Pre-Restore Protection

- **Atomic Transactions**: All multi-step write operations (e.g., period attendance recording, database restoration) execute inside SQLite ACID transactions (`db.transaction(...)`).
- **Automated Pre-Restore Safety Snapshot**: Before any database restore is initiated, the system automatically writes an unalterable snapshot of the active database to `backups/pre_restore_safety_backup_*.json`. If a restore fails midway, the original database is preserved.
- **Write-Ahead Logging (`WAL`)**: Enabled on SQLite to allow concurrent read operations without blocking write transactions.

---

## 6. Input Validation & Data Sanitization

- **Attendance Statuses**: Enforced enum validation (`Present`, `Absent`, `Late`, `Excused`). Arbitrary strings are rejected with `400 Bad Request`.
- **Threshold Ranges**: Minimum attendance percentage inputs are validated between `0.0` and `100.0`.
- **Unique Constraints**: Unique indices in the database enforce uniqueness of `roll_no` per class, `admission_no`, `teacher_id`, and `(student_id, date, period_number)`.

