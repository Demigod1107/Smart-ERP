# SMART SCHOOL — Communication Gateway Setup (Email & SMS)

Smart School includes a carrier-grade messaging gateway supporting **Email (Nodemailer, SMTP, Gmail App Password, SendGrid)** and **SMS (Twilio API)**. This guide explains how to configure providers, verify connections, and monitor delivery dispatches.

---

## 1. Security Architecture & Secret Masking

To prevent exposure of production credentials:
- **Masked View**: All API endpoints returning communication configurations (`GET /api/settings/communications`) mask sensitive fields (`pass`, `authToken`, `accountSid`).
- **In-Memory & Encrypted State**: Only the running backend maintains active credentials to initialize the Nodemailer transporter and Twilio client.
- **Mock Simulation Mode**: If credentials are not configured, the communication service gracefully records dispatches in **Simulated Delivery** mode with detailed logs, allowing testing without incurring API fees or failures.

---

## 2. Email Gateway Setup

Open the web interface at **Administration** -> **Communication Gateway** (`settings-communication.html`) or edit your `.env` file.

### Option A: Standard Custom SMTP (e.g. Mailgun, Postmark, Amazon SES)
```env
SMTP_PROVIDER=smtp
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-school-domain.com
SMTP_PASS=your-smtp-token-or-password
SMTP_FROM="Smart School Notifications <notifications@your-school-domain.com>"
```

### Option B: Google Gmail (Using 16-Character App Password)
> [!NOTE]
> Standard Gmail account passwords will be blocked by Google security. You must generate a dedicated **App Password**.

1. Go to your Google Account -> **Security** -> **2-Step Verification**.
2. Scroll to the bottom and select **App Passwords**.
3. Generate a password for "Smart School". Google will show a 16-character code (e.g. `abcd efgh ijkl mnop`).
4. Enter credentials in `settings-communication.html` or `.env`:
   ```env
   SMTP_PROVIDER=gmail
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=school.admin@gmail.com
   SMTP_PASS=abcdefghijklmnop
   SMTP_FROM="Smart School <school.admin@gmail.com>"
   ```

### Option C: SendGrid (SMTP Relay)
```env
SMTP_PROVIDER=sendgrid
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_api_key_here
SMTP_FROM="Smart School Alerts <verified-sender@your-school.com>"
```

---

## 3. SMS Gateway Setup (Twilio)

1. Sign up for a [Twilio Account](https://www.twilio.com).
2. Retrieve your **Account SID** and **Auth Token** from the Twilio Console dashboard.
3. Purchase or configure an SMS-enabled Twilio phone number.
4. Enter credentials in `settings-communication.html`:
   - **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token**: `your_twilio_auth_token`
   - **Twilio Phone Number**: `+1234567890` (E.164 format with leading `+`)

---

## 4. Testing Gateway Connections

Always verify gateway connectivity using the built-in diagnostic test modals:

### Email Diagnostics:
1. Navigate to **Administration** -> **Communication Gateway** (`settings-communication.html`).
2. Click **Test Email Gateway**.
3. Enter your personal recipient email address (e.g. `admin@myschool.org`).
4. Click **Send Test Email**.
5. The system initiates an SMTP handshake and dispatches a branded verification message.

### SMS Diagnostics:
1. Click **Test SMS Gateway**.
2. Enter a phone number in E.164 international format (e.g. `+919876543210`).
3. Click **Send Test SMS**.
4. The system sends a verification SMS through the Twilio client.

---

## 5. Automated System Triggers

Notifications are automatically dispatched on high-priority academic events:
1. **Unexcused Absence Alert**: When a student is marked *Absent* during daily roll-call or a period session, an automated SMS/email alert is dispatched to the registered guardian:
   > *"Alert: Aarav Sharma was marked Absent for Period 1 (Mathematics Theory) on 2026-11-09. Please contact the school office if this was in error."*
2. **Subject Defaulter Warning**: When a student's attendance in any subject drops below the configured threshold (e.g. 75% for Theory, 80% for Lab), an email is generated containing the exact recovery session requirements.
3. **Leave Application Updates**: When an administrator approves or rejects a leave request, an instant status alert is sent to the parent.

---

## 6. Communication Dispatch History & Retries

All outgoing communications are tracked in the `communication_logs` table and visible under **Communication** -> **Dispatch History** (`communication-dispatch.html`):
- Filter by channel: **All**, **Email**, or **SMS**.
- Filter by status: **Delivered**, **Sent**, or **Failed**.
- **Retry Failed Dispatches**: Click the **Retry** button (↺) next to any failed delivery to immediately re-attempt transmission.

