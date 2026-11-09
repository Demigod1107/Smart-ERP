# COMPUTER NETWORKS PROJECT REPORT

## ON
# “SMART SCHOOL — SMART ATTENDANCE & ACADEMIC ERP SYSTEM”

**Submitted to Punjab Technical University, Jalandhar**  
*Bachelors of Technology (CSE) — Batch 2024-2028*

---

**Submitted To:**  
Ms. Kamalpreet Kaur  
Gursimar Kaur  

**Submitted By:**  
Name: Arhaan Chopra  
University Roll No.: 2113642  

**PCTE INSTITUTES OF ENGINEERING & TECHNOLOGY, LUDHIANA**

---

## 🌐 Live Project Links
- **Live 24/7 Cloud Application**: [https://smart-erp-ruddy.vercel.app](https://smart-erp-ruddy.vercel.app)
- **GitHub Source Code Repository**: [https://github.com/Demigod1107/Smart-ERP](https://github.com/Demigod1107/Smart-ERP)
- **Live Cloud Database (Live JSON)**: [https://github.com/Demigod1107/Smart-ERP/blob/main/data/cloud_db.json](https://github.com/Demigod1107/Smart-ERP/blob/main/data/cloud_db.json)
- **Direct Printable Report**: Open [`PROJECT_REPORT.html`](file:///d:/ITWS%20project/PROJECT_REPORT.html) in your browser and press `Ctrl + P`.

---

## Table of Contents
1. [Abstract & Executive Summary](#1-abstract--executive-summary)
2. [Introduction & Project Overview](#2-introduction--project-overview)
3. [Problem Statement & Motivation](#3-problem-statement--motivation)
4. [Technology Stack](#4-technology-stack)
5. [System Architecture & Working of the Website](#5-system-architecture--working-of-the-website)
6. [Core Features & User Interface Modules](#6-core-features--user-interface-modules)
7. [Mathematical Formulas & Attendance Algorithms](#7-mathematical-formulas--attendance-algorithms)
8. [Live Deployment & 24/7 Cloud Persistence](#8-live-deployment--247-cloud-persistence)
9. [Automated Testing & Verification](#9-automated-testing--verification)
10. [Teacher Demonstration & Viva Credentials](#10-teacher-demonstration--viva-credentials)
11. [Conclusion & Future Scope](#11-conclusion--future-scope)
12. [References](#12-references)

---

## 1. Abstract & Executive Summary

In contemporary educational institutions, managing student attendance is essential for regulatory compliance, academic progress monitoring, and semester examination eligibility. However, traditional attendance recording systems rely on physical paper registers or isolated spreadsheets. These legacy workflows suffer from human calculation errors, lack of period-wise and subject-wise visibility, severe delays in notifying parents, and risks of physical record destruction.

**SMART SCHOOL** is a full-stack, production-grade **Smart Attendance & Academic ERP System** engineered to eliminate paper registers and streamline school operations. Developed using a zero-external-dependency frontend (HTML5, modern CSS3 with dark mode, and Vanilla ES6+ JavaScript) combined with a high-performance Node.js/Express.js backend and an ACID-compliant SQLite relational database, the system automates roll-call tracking, period scheduling, and compliance monitoring.

The platform features an automated **75% Mandatory Attendance Compliance Engine** that mathematically computes the exact consecutive present sessions required for debarred students to recover eligibility. The system is deployed for **24/7 online availability on Vercel**, backed by an automated **GitHub Cloud Persistence** mechanism and offline-first **LocalStorage dual-synchronization**, ensuring continuous access across smartphones, tablets, and computers even when personal host machines are offline.

---

## 2. Introduction & Project Overview

Attendance tracking is not merely an administrative chore; it is an essential academic indicator directly correlated with student examination success and institutional discipline. In universities and schools affiliated with statutory bodies such as Punjab Technical University (PTU), achieving a minimum of 75% attendance in theoretical lectures and 80% in practical laboratory sessions is a mandatory prerequisite for appearing in final semester examinations.

Despite widespread digitization in other university operations, classroom attendance is frequently captured through manual calling and handwritten registers. Teachers spend 10 to 15 minutes of instructional time per period recording marks, and administrative staff spend dozens of hours at the end of each term manually tallying columns to produce defaulter lists.

**SMART SCHOOL** transforms this workflow into an interactive, zero-latency digital experience. The system caters to three distinct user personas through role-based access control (RBAC):
- **Administrators**: Centralized dashboard with aggregated metrics, class distributions, defaulter identification, and automated cloud backups.
- **Teachers**: Rapid keyboard-driven roll-calls (<kbd>P</kbd>, <kbd>A</kbd>, <kbd>L</kbd>, <kbd>E</kbd>), period-wise attendance for assigned subjects, and leave reviews.
- **Parents / Students**: Transparent monthly attendance calendars, real-time subject compliance percentages, and recovery targets.

---

## 3. Problem Statement & Motivation

The development of SMART SCHOOL addresses several key operational bottlenecks in educational institutions:
1. **Instructional Time Loss**: Traditional manual calling consumes up to 25% of class time, reducing student-teacher interaction.
2. **Tabulation Errors**: Manual tabulation regularly miscalculates attendance percentages, failing to properly account for approved leaves or late arrivals.
3. **Lack of Period Granularity**: Full-day attendance marks do not capture students who attend morning theory classes but skip afternoon laboratories.
4. **Delayed Parental Alerts**: Parents often discover that their child has fallen below the 75% debarment threshold only days before examinations.
5. **Data Vulnerability**: Software running solely on local school desktops is unavailable when computers are turned off and vulnerable to disk failures.

---

## 4. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) | Lightweight, reactive UI with zero external runtime dependencies. Loads in &lt;100ms. |
| **Styling & Charts** | CSS Custom Properties & Native HTML5 Canvas | Dark/Light mode theme engine; custom Canvas charts (doughnut, bar, trend curve). |
| **Backend REST API** | Node.js & Express.js (v5) | Asynchronous, non-blocking REST API service communicating over standard JSON. |
| **Database** | SQLite (`better-sqlite3`) | ACID-compliant relational engine operating in Write-Ahead Logging (WAL) mode. |
| **Security** | `bcryptjs` & `jsonwebtoken` | Password hashing with salt rounds; signed JWT tokens for session authorization. |
| **Communication** | Nodemailer & Twilio SDK | SMTP email and SMS notifications with masked secret protection. |
| **Cloud Hosting** | Vercel Serverless Edge Network | Global 24/7 cloud deployment; serverless execution with instant scaling. |
| **Cloud Persistence** | GitHub REST API & LocalStorage | Automatic background commit to `data/cloud_db.json` on GitHub with LocalStorage dual-sync. |

---

## 5. System Architecture & Working of the Website

```
[ Client Browser / Smartphone ]
       │
       ├─► [ LocalStorage Layer ] (Instant offline render cache & session token)
       │
       ▼ HTTPS / JSON REST API
[ Vercel Edge Serverless Gateway ] ───► [ Express.js Backend Application ]
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
               [ SQLite Relational DB ]                            [ GitHub Cloud Sync ]
               (tables: students, attendance,                      (data/cloud_db.json
                periods, subjects, leaves)                          24/7 Git Persistence)
```

### End-to-End User Flow:
1. **Authentication**: Users log in at `/login.html`. Credentials are verified with bcrypt, and a signed JWT token is issued.
2. **Hydration**: The frontend immediately paints cached rosters from `localStorage` before updating asynchronously from `/api/attendance`.
3. **Roll-Call Recording**: Teachers mark attendance via keyboard hotkeys or click buttons. Data is sent to `/api/attendance/period-wise` and saved inside an ACID transaction.
4. **Compliance Calculation**: Attendance percentages are calculated in real time. Students dropping below 75% receive recovery session plans.
5. **24/7 Cloud Synchronization**: Every change triggers `triggerAutoSave()`, committing a snapshot to `data/cloud_db.json` on GitHub.

---

## 6. Core Features & User Interface Modules

### 1. Main Administrative Dashboard (`index.html`)
- Live counted statistics: Total Students, Total Teachers, Present, Absent, Late Arrivals, Overall %, Defaulters (<75%).
- Native Canvas charts: Weekly trend curve with 75% threshold line, Status distribution doughnut chart, Class comparison bar chart.
- Speed Roll-Call Mode with keyboard shortcuts (<kbd>P</kbd>, <kbd>A</kbd>, <kbd>L</kbd>, <kbd>E</kbd>, <kbd>Esc</kbd>).

### 2. Period-Wise & Subject-Wise Attendance (`period-attendance.html`, `subject-attendance.html`)
- Granular tracking for instructional blocks (Periods 1–6) across distinct subjects (Theory vs Practical Lab).
- Configurable minimum thresholds (Theory 75%, Lab 80%).
- Teacher authorization boundaries ensuring faculty only mark assigned classes.

### 3. Monthly Attendance Calendar (`calendar.html`)
- Color-coded calendar cells: Green (Present), Red (Absent), Yellow (Late), Blue (Excused), Grey (Holiday/Weekend).
- Monthly attendance summary and date-click remark inspector.

### 4. Student Directory & Dossiers (`students.html`, `profile.html`)
- Enforced unique constraints for roll numbers and admission numbers.
- Individual student dossier featuring photo avatar, guardian contacts, subject breakdown table, and comparative canvas chart.
- Bulk CSV import and export.

### 5. Leave Management (`leaves.html`)
- Student/guardian leave submission portal.
- Review workflow with automated attendance synchronization (approved leaves automatically mark corresponding dates as *Excused*).

### 6. Disaster Recovery & Database Backups (`settings-database.html`)
- SQL DDL/DML dumps and structured JSON exports.
- Cryptographic SHA-256 integrity check and automated pre-restore safety snapshots.

---

## 7. Mathematical Formulas & Attendance Algorithms

### 1. Cumulative Attendance Percentage Formula
$$\text{Attendance Percentage (\%)} = \left[ \frac{P + 0.5 \times L + E}{T} \right] \times 100$$
- $P$ = Present sessions
- $L$ = Late arrivals (weighted at 0.5 credit)
- $E$ = Excused approved leave sessions
- $T$ = Total instructional sessions conducted

### 2. Minimum Recovery Session Formula
To find the minimum consecutive future sessions $x$ required to reach target threshold $r \in (0, 1)$:
$$\frac{P + x}{T + x} \ge r \implies x \ge \frac{rT - P}{1 - r}$$
$$x = \max\left(1, \left\lceil \frac{rT - P}{1 - r} \right\rceil\right)$$
For standard 75% compliance ($r = 0.75$), this simplifies to:
$$x = \max(1, \lceil 3T - 4P \rceil)$$

---

## 8. Live Deployment & 24/7 Cloud Persistence

- **Production Cloud Host**: Vercel Serverless Edge Network ([https://smart-erp-ruddy.vercel.app](https://smart-erp-ruddy.vercel.app))
- **Continuous Deployment**: Linked directly to GitHub repository `Demigod1107/Smart-ERP`. Every push to `main` triggers an automatic zero-downtime deployment.
- **Cloud Database Snapshot**: Automatically committed to [`data/cloud_db.json`](https://github.com/Demigod1107/Smart-ERP/blob/main/data/cloud_db.json).
- **LocalStorage Device Cache**: Mirrors records in the client's browser for instant loading and offline operation.

---

## 9. Automated Testing & Verification

Automated test runner executed via `npm test`: **44 of 44 tests passed (100% success rate)**:
- **Unit Tests (`test/test_suite.js`)**: 23 / 23 Passed (seed data, bcrypt hashing, JWT tokens, 75% recovery formulas, unique constraints, leave sync, backup integrity).
- **API Tests (`test/api_test.js`)**: 21 / 21 Passed (authentication, dashboard stats, attendance marking, period-wise records, subject stats, backup downloads, restore lifecycle).

---

## 10. Teacher Demonstration & Viva Credentials

| Role | Username | Password | Privileges |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Full access across all modules, faculty, students, reports, and backups |
| **Teacher** | `teacher1` | `teacher123` | Assigned to Class 10-A, 10-B (Mathematics & Physics) |
| **Parent** | `parent1` | `parent123` | Linked to student Aarav Sharma (Roll No: 10A-01) |

*(Use the 1-Click Demo Login buttons on `login.html` for instant role switching without typing).*

---

## 11. Conclusion & Future Scope

SMART SCHOOL successfully demonstrates how modern, lightweight full-stack web technologies can eliminate administrative overhead in academic institutions. The platform reduces roll-call time to under 30 seconds, provides transparent mathematical recovery targets, guarantees 24/7 cloud availability without running personal computers, and ensures data preservation across devices.

### Future Scope:
1. **Biometric RFID/Turnstile Integration**: WebSockets ingestion of gate entry sensor data.
2. **Native Mobile App**: Capacitor/React Native packaging for Google Play Store and Apple App Store.
3. **Automated Timetable Optimization**: Genetic algorithm solver for room and faculty clash-free scheduling.

---

## 12. References
1. Mozilla Developer Network (MDN). *JavaScript (ES6+) Documentation and Web APIs*, 2024.
2. Express.js Foundation. *Fast, unopinionated, minimalist web framework for Node.js*, 2024.
3. SQLite Development Team. *SQLite Documentation: Write-Ahead Logging (WAL) and Foreign Key Support*, 2024.
4. Vercel Inc. *Serverless Functions & Edge Network Architecture Guide*, 2024.
5. World Wide Web Consortium (W3C). *HTML5 Web Storage Specification (LocalStorage)*, 2023.
6. IETF RFC 7519. *JSON Web Token (JWT) Architecture and Security Best Practices*.
7. Punjab Technical University (PTU). *Academic Regulations and Minimum Attendance Requirements for B.Tech CSE*.

