# SMART SCHOOL — Installation & Setup Guide

This guide describes how to install, configure, and start the Smart School Attendance Management System on Windows, macOS, or Linux.

---

## 1. Prerequisites

Before installing, ensure your environment has:
- **Node.js**: v18.0.0 or higher (LTS recommended)
- **npm**: v9.0.0 or higher
- **Web Browser**: Chrome, Edge, Firefox, or Safari with JavaScript enabled

Verify your installations:
```bash
node -v
npm -v
```

---

## 2. Step-by-Step Installation

### Step 1: Clone or Navigate to the Project Root
```bash
cd "d:\ITWS project"
```

### Step 2: Install Node Dependencies
Install all required production packages:
```bash
npm install
```
Key packages installed:
- `express`: Fast, unopinionated REST API framework
- `better-sqlite3`: High-performance SQLite engine with synchronous execution and ACID transactions
- `bcryptjs`: Secure one-way salt hashing for user credentials
- `jsonwebtoken`: Stateless, tamper-proof session tokens
- `nodemailer`: Enterprise email gateway support
- `cors`: Cross-Origin Resource Sharing middleware

### Step 3: Environment Setup
Copy the configuration template:
```bash
cp .env.example .env
```
*(On Windows PowerShell, use `Copy-Item .env.example .env`)*

Review `.env` and configure your desired `PORT` (defaults to `3000`) and communication provider credentials.

### Step 4: Database Initialization
The database initializes automatically when the application starts. The system creates the file `server/smart_school.db`, configures WAL mode, applies all schema tables, and populates initial seed records (classes, default faculty, sample students, subjects, periods, and credentials).

To manually initialize or inspect the database without starting the HTTP server:
```bash
node -e "require('./server/db')"
```

---

## 3. Running the Application

### Development / Production Start:
```bash
npm start
```

You should see:
```
=========================================================
  SMART SCHOOL — Smart Attendance Management System
  Version: 4.5.0
  Mode: production
  Server running at: http://localhost:3000
=========================================================
```

### Accessing the Web Application:
Open your browser and navigate to:
[http://localhost:3000](http://localhost:3000)

---

## 4. Pre-Configured Test Credentials

For evaluation and testing, the database includes pre-seeded accounts:

| Role | Username | Password | Access Scope |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Complete administrative access to all modules, backups, settings, faculty, and reports |
| **Teacher** | `teacher1` | `teacher123` | Assigned to Class 10-A, 10-B (Mathematics & Physics) |
| **Parent** | `parent1` | `parent123` | Linked to student Aarav Sharma (Roll No: 10A-01) |

> [!TIP]
> Use the **1-Click Demo Login** buttons on the login screen (`login.html`) to quickly switch between roles without manually typing credentials.

---

## 5. Verification & Testing

Execute the automated test suite to ensure your environment is fully operational:
```bash
npm test
```
All 44 automated tests (23 unit tests and 21 REST API tests) should pass with 100% success.

