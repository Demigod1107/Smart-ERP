# SMART SCHOOL — Automated Test Suite & Quality Assurance

This document details the test framework, test suites, coverage areas, and procedures for executing automated regression tests.

---

## 1. Test Architecture Overview

Smart School contains a comprehensive zero-dependency test harness built with native Node.js assertion libraries (`assert`) and asynchronous runners:

1. **Unit Test Suite (`test/test_suite.js`)**:
   - Tests business logic, mathematical recovery formulas, database constraints, hashing, and service methods in isolation.
   - Total Unit Tests: **23 tests**.
2. **REST API Integration Test Suite (`test/api_test.js`)**:
   - Starts an ephemeral HTTP test server instance on a dynamic port (`port: 0`), issues HTTP requests across all API routes, and asserts status codes, headers, and JSON payloads.
   - Total API Integration Tests: **21 tests**.
3. **Total Automated Tests**: **44 tests (100% Passing)**.

---

## 2. Running Automated Tests

To run the complete test suite:
```bash
npm test
```

### Running Test Suites Individually:
```bash
# Run Unit Tests only
node test/test_suite.js

# Run REST API Integration Tests only
node test/api_test.js
```

---

## 3. Test Cases Catalog

### Unit Tests (`test/test_suite.js`)

#### Module 1: Database & Seed Data Verification
- Validates pre-seeded classes (`10-A`, `10-B`, `12-A`).
- Validates pre-seeded student dossiers and roll numbers.
- Validates default administrative, teacher, and parent user credentials.

#### Module 2: Authentication & Password Security
- Validates bcrypt one-way salt verification for `admin` and `teacher`.
- Validates JWT token generation, expiration claims, and payload decoding.

#### Module 3: Attendance Calculations & 75% Advisor
- Validates percentage calculation with weighted late sessions:
  $$\text{Percentage} = \frac{\text{Present} + 0.5 \times \text{Late} + \text{Excused}}{\text{Total}} \times 100$$
- Validates minimum recovery session formula:
  $$x = \max\left(1, \left\lceil \frac{rT - P}{1 - r} \right\rceil\right)$$
- Validates idempotent attendance upsert and duplicate prevention.

#### Module 4: Student Directory & Uniqueness Constraints
- Validates SQLite rejection of duplicate admission numbers and duplicate roll numbers within the same class.

#### Module 5: Leave Management & Excused Status Synchronization
- Validates that approving a leave application automatically marks corresponding calendar dates as `Excused`.

#### Module 6: QR Code & Geolocation Boundaries
- Validates Haversine distance formula calculation for coordinate pairs within configured campus radius ($150\text{ m}$).

#### Module 7: AI Attendance Insights & Risk Scoring
- Validates streak absentee detection and explainable risk factor weighting.

#### Module 8: Subject-Wise & Period Attendance Calculations
- Validates distinct subject threshold requirements (e.g., Theory 75%, Practical Lab 80%).
- Validates recovery session planning for 75% and 80% targets with floating-point precision sanitization.
- Validates teacher subject authorization boundaries.
- Validates period attendance session uniqueness constraints.

#### Module 9: Communication Gateway, Masking & Logs
- Validates secret masking logic (`maskSecret`).
- Validates communication dispatch logging into `communication_logs` and retry mechanics.

#### Module 10: Database Backup, Validation & Pre-Restore Safety
- Validates SQL backup generation with complete schema and table dumps.
- Validates JSON backup export with metadata and table structures.
- Validates cryptographic SHA-256 integrity check and rejection of corrupted files.
- Validates automated generation of pre-restore safety snapshots prior to restore execution.

---

### REST API Integration Tests (`test/api_test.js`)

1. `POST /api/auth/login`: Authenticates admin and returns JWT token.
2. `GET /api/dashboard/stats`: Returns counted metrics from active database.
3. `GET /api/dashboard/charts`: Returns weekly trend curves and class comparisons.
4. `GET /api/attendance`: Returns class roll-call roster with 5-day streaks.
5. `POST /api/attendance/mark`: Records attendance with audit tracking.
6. `POST /api/attendance/mark-all`: Marks entire class present.
7. `GET /api/teachers`: Returns teacher faculty directory.
8. `GET /api/leaves` & `POST /api/leaves`: Handles leave application submissions.
9. `GET /api/ai/insights`: Returns trend analysis and recommendations.
10. `GET /api/ai/predictions`: Returns risk rankings and factor explanations.
11. `POST /api/qr/generate`: Generates time-bounded QR session.
12. `GET /api/reports/defaulters`: Identifies students below 75% threshold.
13. `GET /api/subjects` & `POST /api/subjects`: Creates and queries subjects with thresholds.
14. `POST /api/attendance/period-wise`: Records period attendance session.
15. `GET /api/attendance/student/:studentId/subjects`: Returns subject performance.
16. `GET /api/settings/communications`: Returns masked gateway settings.
17. `POST /api/settings/communications/test-email`: Tests SMTP gateway dispatch.
18. `GET /api/notifications/dispatch-logs`: Returns dispatch audit logs.
19. `POST /api/admin/backups`: Generates SQL and JSON database backups.
20. `POST /api/admin/backups/validate`: Verifies backup file integrity.
21. `POST /api/admin/backups/restore`: Restores database with pre-restore safety backup.

---

## 4. Test State Isolation & Idempotency

All tests are designed to be strictly idempotent:
- Tests clear temporary test marks before and after execution:
  ```javascript
  db.prepare("DELETE FROM attendance WHERE date IN ('2026-11-21', '2026-11-22')").run();
  db.prepare("DELETE FROM subjects WHERE code LIKE 'TEST-SUB-%'").run();
  ```
- No persistent mock test artifacts remain in the database after `npm test` finishes.

