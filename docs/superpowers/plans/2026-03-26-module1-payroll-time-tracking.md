# Module 1: Payroll & Time Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation infrastructure (database, Express API, Twilio WhatsApp) and Module 1 — a WhatsApp-based check-in/out system with payroll calculations, sick leave/vacation management, anomaly detection, admin dashboard, and PDF report generation for the Steuerberater.

**Architecture:** Node.js + Express backend with PostgreSQL database. Workers interact via Twilio WhatsApp Business API (button-based menus). Halil manages everything through a React PWA admin dashboard. PDF reports generated with pdfkit. Cron jobs handle missing checkout reminders and monthly report generation.

**Tech Stack:** Node.js 20+, Express 4, PostgreSQL 16, node-postgres (pg), Twilio WhatsApp API, React 18, Vite, pdfkit, node-cron, bcrypt, jsonwebtoken, vitest

---

## File Structure

```
bal-hausmeisterservice/
├── package.json
├── .env.example
├── .gitignore
├── docker-compose.yml
├── vitest.config.js
├── src/
│   ├── index.js
│   ├── app.js
│   ├── config.js
│   ├── db/
│   │   ├── pool.js
│   │   ├── migrate.js
│   │   └── migrations/
│   │       └── 001-initial-schema.sql
│   ├── routes/
│   │   ├── auth.js
│   │   ├── workers.js
│   │   ├── timeEntries.js
│   │   ├── sickLeave.js
│   │   ├── vacation.js
│   │   ├── reports.js
│   │   └── webhook.js
│   ├── services/
│   │   ├── whatsapp.js
│   │   ├── bot.js
│   │   ├── checkin.js
│   │   ├── timeCalculation.js
│   │   ├── sickLeave.js
│   │   ├── vacation.js
│   │   ├── anomaly.js
│   │   ├── notifications.js
│   │   ├── pdfReport.js
│   │   └── scheduler.js
│   └── middleware/
│       └── auth.js
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   └── logo.png
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api/
│       │   └── client.js
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Workers.jsx
│       │   ├── TimeEntries.jsx
│       │   ├── SickLeave.jsx
│       │   ├── Vacation.jsx
│       │   └── Reports.jsx
│       └── components/
│           ├── Layout.jsx
│           ├── WorkerForm.jsx
│           ├── TimeEntryTable.jsx
│           ├── FlagBadge.jsx
│           └── MonthPicker.jsx
└── tests/
    ├── setup.js
    ├── helpers.js
    ├── services/
    │   ├── checkin.test.js
    │   ├── timeCalculation.test.js
    │   ├── sickLeave.test.js
    │   ├── vacation.test.js
    │   ├── bot.test.js
    │   └── anomaly.test.js
    └── routes/
        ├── workers.test.js
        ├── timeEntries.test.js
        └── webhook.test.js
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `docker-compose.yml`
- Create: `vitest.config.js`
- Create: `src/index.js`
- Create: `src/app.js`
- Create: `src/config.js`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice"
npm init -y
npm install express pg dotenv twilio bcrypt jsonwebtoken node-cron pdfkit cors helmet
npm install -D vitest supertest
```

- [ ] **Step 2: Create .gitignore**

```gitignore
node_modules/
.env
client/node_modules/
client/dist/
uploads/
*.pdf
```

- [ ] **Step 3: Create .env.example**

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bal_hms
JWT_SECRET=change-me-in-production
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
HALIL_WHATSAPP_NUMBER=whatsapp:+49XXXXXXXXXXX
ADMIN_USERNAME=halil
ADMIN_PASSWORD_HASH=will-be-generated
MISSING_CHECKOUT_REMINDER_HOURS=10
```

- [ ] **Step 4: Create docker-compose.yml for local PostgreSQL**

```yaml
version: '3.8'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bal_hms
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 5: Create src/config.js**

```js
import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  halilWhatsappNumber: process.env.HALIL_WHATSAPP_NUMBER,
  adminUsername: process.env.ADMIN_USERNAME || 'halil',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  missingCheckoutReminderHours: parseInt(
    process.env.MISSING_CHECKOUT_REMINDER_HOURS || '10',
    10
  ),
};
```

- [ ] **Step 6: Create src/app.js (Express app without listen)**

```js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

export default app;
```

- [ ] **Step 7: Create src/index.js (server entry)**

```js
import app from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
```

- [ ] **Step 8: Add "type": "module" and scripts to package.json**

Add to package.json:
```json
{
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "node src/db/migrate.js"
  }
}
```

- [ ] **Step 9: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
  },
});
```

- [ ] **Step 10: Create tests/setup.js and tests/helpers.js**

`tests/setup.js`:
```js
import { pool } from '../src/db/pool.js';

afterAll(async () => {
  await pool.end();
});
```

`tests/helpers.js`:
```js
import { pool } from '../src/db/pool.js';

export async function cleanDb() {
  await pool.query(`
    DELETE FROM monthly_reports;
    DELETE FROM sick_leave;
    DELETE FROM time_entries;
    DELETE FROM vacation_balances;
    DELETE FROM workers;
  `);
}

export async function createTestWorker(overrides = {}) {
  const defaults = {
    name: 'Test Worker',
    phone_number: '+4917612345678',
    worker_type: 'fulltime',
    hourly_rate: 14.0,
    monthly_salary: null,
    registration_date: '2025-01-01',
    vacation_entitlement: 26,
  };
  const w = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [w.name, w.phone_number, w.worker_type, w.hourly_rate, w.monthly_salary, w.registration_date, w.vacation_entitlement]
  );
  return result.rows[0];
}
```

- [ ] **Step 11: Start PostgreSQL and verify server starts**

```bash
docker compose up -d
npm run dev
# Visit http://localhost:3000/health — expect {"status":"ok"}
```

- [ ] **Step 12: Commit**

```bash
git init
git add -A
git commit -m "feat: project scaffolding with Express, PostgreSQL, Twilio config"
```

---

## Task 2: Database Schema

**Files:**
- Create: `src/db/pool.js`
- Create: `src/db/migrate.js`
- Create: `src/db/migrations/001-initial-schema.sql`

- [ ] **Step 1: Create src/db/pool.js**

```js
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});
```

- [ ] **Step 2: Create src/db/migrations/001-initial-schema.sql**

```sql
CREATE TABLE IF NOT EXISTS workers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  worker_type VARCHAR(10) NOT NULL CHECK (worker_type IN ('fulltime', 'minijob')),
  hourly_rate NUMERIC(6,2),
  monthly_salary NUMERIC(8,2),
  registration_date DATE NOT NULL,
  vacation_entitlement INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason VARCHAR(255),
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, date)
);

CREATE TABLE IF NOT EXISTS sick_leave (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  start_date DATE NOT NULL,
  declared_days INTEGER NOT NULL,
  aok_approved_days INTEGER,
  vacation_deducted_days INTEGER NOT NULL DEFAULT 0,
  unpaid_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'overridden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vacation_balances (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  year INTEGER NOT NULL,
  entitlement_days INTEGER NOT NULL,
  used_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, year)
);

CREATE TABLE IF NOT EXISTS monthly_reports (
  id SERIAL PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  generated_at TIMESTAMPTZ,
  pdf_path VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'sent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(month, year)
);
```

- [ ] **Step 3: Create src/db/migrate.js**

```js
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    console.log(`Applying migration: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Run migration**

```bash
npm run migrate
```
Expected: "Applying migration: 001-initial-schema.sql" then "Migrations complete."

- [ ] **Step 5: Commit**

```bash
git add src/db/
git commit -m "feat: database schema with workers, time_entries, sick_leave, vacation, reports"
```

---

## Task 3: Worker Management API

**Files:**
- Create: `src/routes/workers.js`
- Create: `tests/routes/workers.test.js`
- Modify: `src/app.js` — register route

- [ ] **Step 1: Write the failing test**

`tests/routes/workers.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { cleanDb } from '../helpers.js';

describe('GET /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns empty array when no workers exist', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a new worker', async () => {
    const res = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ertugrul Bal');
    expect(res.body.phone_number).toBe('+4917612345678');
    expect(res.body.worker_type).toBe('fulltime');
  });

  it('rejects duplicate phone number', async () => {
    const worker = {
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    };
    await request(app).post('/api/workers').send(worker);
    const res = await request(app).post('/api/workers').send(worker);
    expect(res.status).toBe(409);
  });

  it('rejects invalid worker_type', async () => {
    const res = await request(app).post('/api/workers').send({
      name: 'Test',
      phone_number: '+4917600000000',
      worker_type: 'invalid',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/workers/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('updates a worker', async () => {
    const create = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    const res = await request(app)
      .put(`/api/workers/${create.body.id}`)
      .send({ hourly_rate: 15.0 });
    expect(res.status).toBe(200);
    expect(Number(res.body.hourly_rate)).toBe(15.0);
  });
});

describe('DELETE /api/workers/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('soft-deletes a worker (sets is_active = false)', async () => {
    const create = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    const res = await request(app).delete(`/api/workers/${create.body.id}`);
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/workers');
    expect(list.body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/routes/workers.test.js
```
Expected: FAIL — routes not registered yet.

- [ ] **Step 3: Implement src/routes/workers.js**

```js
import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM workers WHERE is_active = true ORDER BY name'
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM workers WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const { name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement } = req.body;

  if (!['fulltime', 'minijob'].includes(worker_type)) {
    return res.status(400).json({ error: 'worker_type must be fulltime or minijob' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, phone_number, worker_type, hourly_rate, monthly_salary || null, registration_date, vacation_entitlement || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone number already exists' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(req.body[field]);
      paramIndex++;
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE workers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    'UPDATE workers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

export default router;
```

- [ ] **Step 4: Register route in src/app.js**

Add to `src/app.js`:
```js
import workersRouter from './routes/workers.js';

// after app.use(express.urlencoded...)
app.use('/api/workers', workersRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/routes/workers.test.js
```
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/workers.js src/app.js tests/routes/workers.test.js
git commit -m "feat: worker management CRUD API with tests"
```

---

## Task 4: WhatsApp Webhook + Bot Core

**Files:**
- Create: `src/services/whatsapp.js`
- Create: `src/services/bot.js`
- Create: `src/routes/webhook.js`
- Create: `tests/services/bot.test.js`
- Modify: `src/app.js` — register webhook route

- [ ] **Step 1: Create src/services/whatsapp.js (Twilio client wrapper)**

```js
import twilio from 'twilio';
import { config } from '../config.js';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

export async function sendWhatsAppMessage(to, body) {
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body,
  });
}

export async function sendWhatsAppButtons(to, body, buttons) {
  // Twilio interactive message with quick reply buttons
  const actions = buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }));

  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    contentSid: undefined, // using persistent menus below
    body,
    persistentAction: actions.map(a => a.reply.title),
  });
}

export async function sendInteractiveButtons(to, bodyText, buttons) {
  // For Twilio Content API interactive messages
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body: bodyText + '\n\n' + buttons.map(b => `> ${b.title}`).join('\n'),
  });
}
```

- [ ] **Step 2: Write the failing test for bot message routing**

`tests/services/bot.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleIncomingMessage } from '../../src/services/bot.js';
import { cleanDb, createTestWorker } from '../helpers.js';

// Mock whatsapp service
vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendInteractiveButtons: vi.fn().mockResolvedValue({}),
}));

describe('handleIncomingMessage', () => {
  beforeEach(async () => { await cleanDb(); });

  it('rejects unregistered phone numbers', async () => {
    const result = await handleIncomingMessage('+4900000000000', 'hello');
    expect(result.response).toContain('nicht registriert');
  });

  it('shows main menu for registered worker sending free text', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Hallo wie gehts');
    expect(result.type).toBe('menu');
    expect(result.response).toContain('Ich kann nur diese Aktionen');
  });

  it('processes Einchecken button press', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Einchecken');
    expect(result.type).toBe('checkin');
    expect(result.response).toContain('Eingecheckt um');
  });

  it('processes Auschecken button press', async () => {
    const worker = await createTestWorker({ phone_number: '+4917612345678' });
    // First check in
    await handleIncomingMessage('+4917612345678', 'Einchecken');
    // Then check out
    const result = await handleIncomingMessage('+4917612345678', 'Auschecken');
    expect(result.type).toBe('checkout');
    expect(result.response).toContain('Ausgecheckt um');
  });

  it('prevents double check-in', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await handleIncomingMessage('+4917612345678', 'Einchecken');
    const result = await handleIncomingMessage('+4917612345678', 'Einchecken');
    expect(result.response).toContain('bereits eingecheckt');
  });

  it('prevents checkout without check-in', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Auschecken');
    expect(result.response).toContain('nicht eingecheckt');
  });

  it('processes Krank melden with day count', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Krank melden');
    expect(result.type).toBe('sick_prompt');
    expect(result.response).toContain('Wie viele Tage');
  });

  it('records sick leave when day count received after Krank melden', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await handleIncomingMessage('+4917612345678', 'Krank melden');
    const result = await handleIncomingMessage('+4917612345678', '3');
    expect(result.type).toBe('sick_recorded');
    expect(result.response).toContain('3 Tage');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/services/bot.test.js
```
Expected: FAIL — bot.js doesn't exist yet.

- [ ] **Step 4: Implement src/services/bot.js**

```js
import { pool } from '../db/pool.js';

// In-memory state for multi-step conversations (sick day count prompt)
const conversationState = new Map();

export async function handleIncomingMessage(phoneNumber, messageBody) {
  // Normalize phone number (remove whatsapp: prefix if present)
  const phone = phoneNumber.replace('whatsapp:', '');

  // Look up worker
  const workerResult = await pool.query(
    'SELECT * FROM workers WHERE phone_number = $1 AND is_active = true',
    [phone]
  );

  if (workerResult.rows.length === 0) {
    return {
      type: 'unregistered',
      response: 'Diese Nummer ist nicht registriert. Bitte kontaktiere Halil.',
    };
  }

  const worker = workerResult.rows[0];
  const text = messageBody.trim();

  // Check if we're waiting for sick day count
  const state = conversationState.get(phone);
  if (state === 'awaiting_sick_days') {
    return handleSickDayCount(worker, text);
  }

  // Route known button presses
  const command = text.toLowerCase();

  if (command === 'einchecken') {
    return handleCheckIn(worker);
  }

  if (command === 'auschecken') {
    return handleCheckOut(worker);
  }

  if (command === 'krank melden') {
    conversationState.set(phone, 'awaiting_sick_days');
    return {
      type: 'sick_prompt',
      response: 'Wie viele Tage wirst du krank sein?\n\n> 1\n> 2\n> 3\n> 4\n> 5\n> Mehr',
    };
  }

  // Free text — show menu
  return {
    type: 'menu',
    response:
      'Ich kann nur diese Aktionen ausfuehren:\n\n> Einchecken\n> Auschecken\n> Krank melden\n\nFuer alles andere bitte direkt Halil kontaktieren.',
  };
}

async function handleCheckIn(worker) {
  const today = new Date().toISOString().split('T')[0];

  // Check for existing check-in today
  const existing = await pool.query(
    'SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  if (existing.rows.length > 0 && existing.rows[0].check_in) {
    const checkInTime = new Date(existing.rows[0].check_in).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    return {
      type: 'already_checked_in',
      response: `Du bist bereits eingecheckt seit ${checkInTime}.`,
    };
  }

  const now = new Date();
  await pool.query(
    `INSERT INTO time_entries (worker_id, date, check_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, date) DO UPDATE SET check_in = $3, updated_at = NOW()`,
    [worker.id, today, now]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return {
    type: 'checkin',
    response: `Eingecheckt um ${timeStr}. Guten Arbeitstag!`,
  };
}

async function handleCheckOut(worker) {
  const today = new Date().toISOString().split('T')[0];

  const existing = await pool.query(
    'SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  if (existing.rows.length === 0 || !existing.rows[0].check_in) {
    return {
      type: 'not_checked_in',
      response: 'Du bist heute nicht eingecheckt.',
    };
  }

  if (existing.rows[0].check_out) {
    return {
      type: 'already_checked_out',
      response: 'Du bist heute bereits ausgecheckt.',
    };
  }

  const now = new Date();
  await pool.query(
    'UPDATE time_entries SET check_out = $1, updated_at = NOW() WHERE id = $2',
    [now, existing.rows[0].id]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return {
    type: 'checkout',
    response: `Ausgecheckt um ${timeStr}. Bis morgen!`,
  };
}

async function handleSickDayCount(worker, text) {
  conversationState.delete(worker.phone_number);

  let days;
  if (text.toLowerCase() === 'mehr') {
    days = null; // Will be set by Halil
  } else {
    days = parseInt(text, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      return {
        type: 'menu',
        response: 'Ungueltige Eingabe. Bitte waehle eine Option:\n\n> 1\n> 2\n> 3\n> 4\n> 5\n> Mehr',
      };
    }
  }

  const today = new Date().toISOString().split('T')[0];

  await pool.query(
    `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
     VALUES ($1, $2, $3, 'pending')`,
    [worker.id, today, days || 0]
  );

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return {
    type: 'sick_recorded',
    response: `Krankmeldung fuer ${dayText} wurde erfasst. Halil wird benachrichtigt. Gute Besserung!`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/services/bot.test.js
```
Expected: All 8 tests PASS.

- [ ] **Step 6: Create src/routes/webhook.js**

```js
import { Router } from 'express';
import { handleIncomingMessage } from '../services/bot.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = Router();

// Twilio sends POST to this endpoint when a WhatsApp message arrives
router.post('/', async (req, res) => {
  const { From, Body } = req.body;

  if (!From || Body === undefined) {
    return res.status(400).send('Missing From or Body');
  }

  const result = await handleIncomingMessage(From, Body);

  // Send response back via WhatsApp
  await sendWhatsAppMessage(From, result.response);

  // Twilio expects a TwiML response or 200
  res.status(200).send('<Response></Response>');
});

export default router;
```

- [ ] **Step 7: Register webhook in src/app.js**

Add to `src/app.js`:
```js
import webhookRouter from './routes/webhook.js';

app.use('/api/webhook', webhookRouter);
```

- [ ] **Step 8: Commit**

```bash
git add src/services/whatsapp.js src/services/bot.js src/routes/webhook.js tests/services/bot.test.js src/app.js
git commit -m "feat: WhatsApp webhook + bot with check-in/out, sick declaration, free text handling"
```

---

## Task 5: Time Calculation Service

**Files:**
- Create: `src/services/timeCalculation.js`
- Create: `tests/services/timeCalculation.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/services/timeCalculation.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  calculateDailyHours,
  calculateMonthlyHours,
  calculateHarcirah,
  splitOfficialAndUnofficial,
} from '../../src/services/timeCalculation.js';

describe('calculateDailyHours', () => {
  it('calculates hours between check-in and check-out', () => {
    const checkIn = new Date('2026-01-05T06:00:00');
    const checkOut = new Date('2026-01-05T14:30:00');
    expect(calculateDailyHours(checkIn, checkOut)).toBe(8.5);
  });

  it('returns 0 if check-out is missing', () => {
    const checkIn = new Date('2026-01-05T06:00:00');
    expect(calculateDailyHours(checkIn, null)).toBe(0);
  });
});

describe('calculateHarcirah', () => {
  it('returns 14 EUR if daily hours exceed 8.5', () => {
    expect(calculateHarcirah(9.0)).toBe(14);
  });

  it('returns 14 EUR if daily hours equal 8.5', () => {
    expect(calculateHarcirah(8.5)).toBe(14);
  });

  it('returns 0 if daily hours are below 8.5', () => {
    expect(calculateHarcirah(8.0)).toBe(0);
  });
});

describe('calculateMonthlyHours', () => {
  it('sums daily hours for all entries in a month', () => {
    const entries = [
      { check_in: new Date('2026-01-05T06:00:00'), check_out: new Date('2026-01-05T14:00:00') },
      { check_in: new Date('2026-01-06T06:00:00'), check_out: new Date('2026-01-06T15:00:00') },
    ];
    expect(calculateMonthlyHours(entries)).toBe(17); // 8 + 9
  });

  it('skips entries with missing check-out', () => {
    const entries = [
      { check_in: new Date('2026-01-05T06:00:00'), check_out: new Date('2026-01-05T14:00:00') },
      { check_in: new Date('2026-01-06T06:00:00'), check_out: null },
    ];
    expect(calculateMonthlyHours(entries)).toBe(8);
  });
});

describe('splitOfficialAndUnofficial', () => {
  it('caps official hours at monthly max for fulltime (173.2)', () => {
    const result = splitOfficialAndUnofficial(180, 'fulltime');
    expect(result.official).toBe(173.2);
    expect(result.unofficial).toBeCloseTo(6.8);
  });

  it('returns actual hours as official if below cap', () => {
    const result = splitOfficialAndUnofficial(160, 'fulltime');
    expect(result.official).toBe(160);
    expect(result.unofficial).toBe(0);
  });

  it('caps minijob hours based on custom monthly max', () => {
    // Minijob: 600 EUR / 14 EUR per hour = 42.86 hrs
    const result = splitOfficialAndUnofficial(50, 'minijob', 42.86);
    expect(result.official).toBe(42.86);
    expect(result.unofficial).toBeCloseTo(7.14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/timeCalculation.test.js
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement src/services/timeCalculation.js**

```js
const FULLTIME_MONTHLY_HOURS = 173.2; // 5 * 4.33 * 8
const HARCIRAH_THRESHOLD_HOURS = 8.5;
const HARCIRAH_AMOUNT = 14;

export function calculateDailyHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const diffMs = new Date(checkOut) - new Date(checkIn);
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

export function calculateHarcirah(dailyHours) {
  return dailyHours >= HARCIRAH_THRESHOLD_HOURS ? HARCIRAH_AMOUNT : 0;
}

export function calculateMonthlyHours(entries) {
  return entries.reduce((sum, entry) => {
    return sum + calculateDailyHours(entry.check_in, entry.check_out);
  }, 0);
}

export function splitOfficialAndUnofficial(totalHours, workerType, minijobMonthlyMax = null) {
  const cap = workerType === 'fulltime'
    ? FULLTIME_MONTHLY_HOURS
    : minijobMonthlyMax || FULLTIME_MONTHLY_HOURS;

  if (totalHours <= cap) {
    return { official: totalHours, unofficial: 0 };
  }

  return {
    official: cap,
    unofficial: Math.round((totalHours - cap) * 100) / 100,
  };
}

export function calculateMonthlyHarcirah(entries) {
  let totalDays = 0;
  let totalAmount = 0;
  for (const entry of entries) {
    const hours = calculateDailyHours(entry.check_in, entry.check_out);
    if (hours >= HARCIRAH_THRESHOLD_HOURS) {
      totalDays++;
      totalAmount += HARCIRAH_AMOUNT;
    }
  }
  return { days: totalDays, amount: totalAmount };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/timeCalculation.test.js
```
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/timeCalculation.js tests/services/timeCalculation.test.js
git commit -m "feat: time calculation service with daily hours, harcirah, official/unofficial split"
```

---

## Task 6: Sick Leave Cascade Service

**Files:**
- Create: `src/services/sickLeave.js`
- Create: `tests/services/sickLeave.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/services/sickLeave.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { adjustSickLeave } from '../../src/services/sickLeave.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker } from '../helpers.js';

describe('adjustSickLeave', () => {
  let worker;

  beforeEach(async () => {
    await cleanDb();
    worker = await createTestWorker({ vacation_entitlement: 26 });
    // Create vacation balance for current year
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, $2, $3, 0)',
      [worker.id, new Date().getFullYear(), 26]
    );
  });

  it('logs all days as sick when AOK approves all declared days', async () => {
    // Worker declared 5 days, AOK approved 5
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );

    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 5 });
    expect(result.aok_approved_days).toBe(5);
    expect(result.vacation_deducted_days).toBe(0);
    expect(result.unpaid_days).toBe(0);
    expect(result.status).toBe('approved');
  });

  it('deducts remaining days from vacation when AOK approves fewer', async () => {
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );

    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 3 });
    expect(result.aok_approved_days).toBe(3);
    expect(result.vacation_deducted_days).toBe(2);
    expect(result.unpaid_days).toBe(0);

    // Check vacation balance was updated
    const vac = await pool.query(
      'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
      [worker.id, new Date().getFullYear()]
    );
    expect(vac.rows[0].used_days).toBe(2);
  });

  it('marks excess days as unpaid when vacation is exhausted', async () => {
    // Set vacation balance to only 1 day remaining
    await pool.query(
      'UPDATE vacation_balances SET used_days = 25 WHERE worker_id = $1',
      [worker.id]
    );

    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );

    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 2 });
    // 5 declared - 2 AOK = 3 remaining
    // 1 vacation day available → 1 from vacation, 2 unpaid
    expect(result.aok_approved_days).toBe(2);
    expect(result.vacation_deducted_days).toBe(1);
    expect(result.unpaid_days).toBe(2);
  });

  it('allows Halil to override with custom values', async () => {
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );

    const result = await adjustSickLeave(sickLeave.rows[0].id, {
      aok_approved_days: 3,
      vacation_deducted_days: 1,
      unpaid_days: 1,
      status: 'overridden',
    });
    expect(result.aok_approved_days).toBe(3);
    expect(result.vacation_deducted_days).toBe(1);
    expect(result.unpaid_days).toBe(1);
    expect(result.status).toBe('overridden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/sickLeave.test.js
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement src/services/sickLeave.js**

```js
import { pool } from '../db/pool.js';

export async function adjustSickLeave(sickLeaveId, adjustments) {
  const slResult = await pool.query('SELECT * FROM sick_leave WHERE id = $1', [sickLeaveId]);
  if (slResult.rows.length === 0) throw new Error('Sick leave not found');

  const sl = slResult.rows[0];

  // If Halil provides explicit override values, use them directly
  if (adjustments.status === 'overridden') {
    const result = await pool.query(
      `UPDATE sick_leave SET
        aok_approved_days = $1,
        vacation_deducted_days = $2,
        unpaid_days = $3,
        status = 'overridden',
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [adjustments.aok_approved_days, adjustments.vacation_deducted_days, adjustments.unpaid_days, sickLeaveId]
    );

    // Update vacation balance for deducted days
    if (adjustments.vacation_deducted_days > 0) {
      await deductVacation(sl.worker_id, adjustments.vacation_deducted_days);
    }

    return result.rows[0];
  }

  // Auto-calculate cascade: AOK approved → vacation → unpaid
  const aokApproved = adjustments.aok_approved_days;
  const remainingDays = sl.declared_days - aokApproved;

  let vacationDeducted = 0;
  let unpaidDays = 0;

  if (remainingDays > 0) {
    // Get available vacation days
    const year = new Date(sl.start_date).getFullYear();
    const vacResult = await pool.query(
      'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
      [sl.worker_id, year]
    );

    if (vacResult.rows.length > 0) {
      const available = vacResult.rows[0].entitlement_days - vacResult.rows[0].used_days;
      vacationDeducted = Math.min(remainingDays, available);
      unpaidDays = remainingDays - vacationDeducted;

      if (vacationDeducted > 0) {
        await deductVacation(sl.worker_id, vacationDeducted, year);
      }
    } else {
      unpaidDays = remainingDays;
    }
  }

  const result = await pool.query(
    `UPDATE sick_leave SET
      aok_approved_days = $1,
      vacation_deducted_days = $2,
      unpaid_days = $3,
      status = 'approved',
      updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [aokApproved, vacationDeducted, unpaidDays, sickLeaveId]
  );

  return result.rows[0];
}

async function deductVacation(workerId, days, year = null) {
  const y = year || new Date().getFullYear();
  await pool.query(
    'UPDATE vacation_balances SET used_days = used_days + $1, updated_at = NOW() WHERE worker_id = $2 AND year = $3',
    [days, workerId, y]
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/sickLeave.test.js
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/sickLeave.js tests/services/sickLeave.test.js
git commit -m "feat: sick leave cascade service (AOK → vacation → unpaid) with override support"
```

---

## Task 7: Vacation Tracking Service

**Files:**
- Create: `src/services/vacation.js`
- Create: `tests/services/vacation.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/services/vacation.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateVacationEntitlement,
  getVacationBalance,
  ensureVacationBalance,
} from '../../src/services/vacation.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker } from '../helpers.js';

describe('calculateVacationEntitlement', () => {
  it('returns 2 days per full month worked in the year', () => {
    // Started Jan 1, calculating for year 2026 (12 months) = 24 days
    expect(calculateVacationEntitlement('2026-01-01', 2026)).toBe(24);
  });

  it('returns 1 day for a month started mid-month', () => {
    // Started Jan 15 → Jan = 1 day, Feb-Dec = 22 days → 23 total
    expect(calculateVacationEntitlement('2026-01-15', 2026)).toBe(23);
  });

  it('returns 0 for future start date', () => {
    expect(calculateVacationEntitlement('2027-06-01', 2026)).toBe(0);
  });

  it('returns full year (24 days) for worker who started before the year', () => {
    expect(calculateVacationEntitlement('2023-05-01', 2026)).toBe(24);
  });
});

describe('getVacationBalance', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns balance for a worker', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 27 });
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, 2026, 27, 5)',
      [worker.id]
    );
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.entitlement_days).toBe(27);
    expect(balance.used_days).toBe(5);
    expect(balance.remaining).toBe(22);
  });
});

describe('ensureVacationBalance', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a vacation balance record if none exists', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 26 });
    await ensureVacationBalance(worker.id, 2026, 26);
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.entitlement_days).toBe(26);
    expect(balance.used_days).toBe(0);
  });

  it('does not overwrite existing balance', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 26 });
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, 2026, 26, 10)',
      [worker.id]
    );
    await ensureVacationBalance(worker.id, 2026, 26);
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.used_days).toBe(10); // unchanged
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/vacation.test.js
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement src/services/vacation.js**

```js
import { pool } from '../db/pool.js';

export function calculateVacationEntitlement(registrationDate, year) {
  const regDate = new Date(registrationDate);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  if (regDate > yearEnd) return 0;

  let totalDays = 0;

  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    if (regDate > monthEnd) continue; // not started yet this month

    if (regDate <= monthStart) {
      // Full month worked
      totalDays += 2;
    } else {
      // Started mid-month (after the 1st)
      totalDays += 1;
    }
  }

  return totalDays;
}

export async function getVacationBalance(workerId, year) {
  const result = await pool.query(
    'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
    [workerId, year]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    remaining: row.entitlement_days - row.used_days,
  };
}

export async function ensureVacationBalance(workerId, year, entitlementDays) {
  await pool.query(
    `INSERT INTO vacation_balances (worker_id, year, entitlement_days)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, year) DO NOTHING`,
    [workerId, year, entitlementDays]
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/vacation.test.js
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/vacation.js tests/services/vacation.test.js
git commit -m "feat: vacation tracking service with entitlement calculation and balance management"
```

---

## Task 8: Missing Checkout Handler + Anomaly Detection

**Files:**
- Create: `src/services/scheduler.js`
- Create: `src/services/anomaly.js`
- Create: `tests/services/anomaly.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/services/anomaly.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { detectMissingCheckouts, detectLongShifts } from '../../src/services/anomaly.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker } from '../helpers.js';

describe('detectMissingCheckouts', () => {
  beforeEach(async () => { await cleanDb(); });

  it('finds entries with check-in but no check-out for a given date', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z')`,
      [worker.id]
    );

    const missing = await detectMissingCheckouts('2026-01-05');
    expect(missing).toHaveLength(1);
    expect(missing[0].worker_id).toBe(worker.id);
  });

  it('does not flag entries that have both check-in and check-out', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z', '2026-01-05T14:00:00Z')`,
      [worker.id]
    );

    const missing = await detectMissingCheckouts('2026-01-05');
    expect(missing).toHaveLength(0);
  });
});

describe('detectLongShifts', () => {
  beforeEach(async () => { await cleanDb(); });

  it('flags shifts longer than threshold', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T05:00:00Z', '2026-01-05T18:00:00Z')`,
      [worker.id]
    );

    const long = await detectLongShifts('2026-01-05', 12);
    expect(long).toHaveLength(1);
    expect(long[0].hours).toBe(13);
  });

  it('does not flag normal shifts', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z', '2026-01-05T14:00:00Z')`,
      [worker.id]
    );

    const long = await detectLongShifts('2026-01-05', 12);
    expect(long).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/services/anomaly.test.js
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement src/services/anomaly.js**

```js
import { pool } from '../db/pool.js';

export async function detectMissingCheckouts(date) {
  const result = await pool.query(
    `SELECT te.*, w.name AS worker_name, w.phone_number
     FROM time_entries te
     JOIN workers w ON te.worker_id = w.id
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND te.check_out IS NULL AND te.resolved = false`,
    [date]
  );
  return result.rows;
}

export async function detectLongShifts(date, thresholdHours) {
  const result = await pool.query(
    `SELECT te.*, w.name AS worker_name, w.phone_number,
       ROUND(EXTRACT(EPOCH FROM (te.check_out - te.check_in)) / 3600) AS hours
     FROM time_entries te
     JOIN workers w ON te.worker_id = w.id
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND te.check_out IS NOT NULL
       AND EXTRACT(EPOCH FROM (te.check_out - te.check_in)) / 3600 > $2`,
    [date, thresholdHours]
  );
  return result.rows.map(r => ({ ...r, hours: Number(r.hours) }));
}

export async function flagMissingCheckout(entryId) {
  await pool.query(
    `UPDATE time_entries SET is_flagged = true, flag_reason = 'Vergessen auszuchecken', updated_at = NOW() WHERE id = $1`,
    [entryId]
  );
}

export async function getAnomaliesForDate(date) {
  const missing = await detectMissingCheckouts(date);
  const longShifts = await detectLongShifts(date, 12);
  return { missingCheckouts: missing, longShifts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/anomaly.test.js
```
Expected: All 4 tests PASS.

- [ ] **Step 5: Implement src/services/scheduler.js**

```js
import cron from 'node-cron';
import { detectMissingCheckouts, flagMissingCheckout } from './anomaly.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

export function startScheduler() {
  // Every hour from 15:00 to 23:00, check for missing checkouts and send reminders
  cron.schedule('0 15-23 * * 1-5', async () => {
    const today = new Date().toISOString().split('T')[0];
    const missing = await detectMissingCheckouts(today);

    for (const entry of missing) {
      const checkInTime = new Date(entry.check_in);
      const hoursElapsed = (Date.now() - checkInTime.getTime()) / (1000 * 60 * 60);

      if (hoursElapsed >= config.missingCheckoutReminderHours) {
        await sendWhatsAppMessage(
          entry.phone_number,
          'Hast du vergessen auszuchecken? Bitte checke aus oder kontaktiere Halil.'
        );
      }
    }
  });

  // At midnight, flag all remaining missing checkouts
  cron.schedule('0 0 * * *', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const missing = await detectMissingCheckouts(yesterday);

    for (const entry of missing) {
      await flagMissingCheckout(entry.id);
    }

    if (missing.length > 0) {
      const names = missing.map(e => e.worker_name).join(', ');
      await sendWhatsAppMessage(
        config.halilWhatsappNumber,
        `${missing.length} fehlende Auschecken gestern: ${names}. Bitte im Dashboard korrigieren.`
      );
    }
  });

  console.log('Scheduler started.');
}
```

- [ ] **Step 6: Register scheduler in src/index.js**

Update `src/index.js`:
```js
import app from './app.js';
import { config } from './config.js';
import { startScheduler } from './services/scheduler.js';

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  startScheduler();
});
```

- [ ] **Step 7: Commit**

```bash
git add src/services/anomaly.js src/services/scheduler.js tests/services/anomaly.test.js src/index.js
git commit -m "feat: anomaly detection (missing checkouts, long shifts) + scheduled reminder cron jobs"
```

---

## Task 9: Time Entries & Sick Leave API Routes

**Files:**
- Create: `src/routes/timeEntries.js`
- Create: `src/routes/sickLeave.js`
- Create: `src/routes/vacation.js`
- Modify: `src/app.js` — register routes

- [ ] **Step 1: Create src/routes/timeEntries.js**

```js
import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// Get time entries for a month (for Steuerberater report and dashboard)
router.get('/', async (req, res) => {
  const { month, year, worker_id } = req.query;
  let query = `
    SELECT te.*, w.name AS worker_name, w.worker_type
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    params.push(parseInt(month), parseInt(year));
    query += ` AND EXTRACT(MONTH FROM te.date) = $${params.length - 1} AND EXTRACT(YEAR FROM te.date) = $${params.length}`;
  }
  if (worker_id) {
    params.push(parseInt(worker_id));
    query += ` AND te.worker_id = $${params.length}`;
  }

  query += ' ORDER BY te.date ASC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Get flagged entries
router.get('/flagged', async (req, res) => {
  const result = await pool.query(`
    SELECT te.*, w.name AS worker_name
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE te.is_flagged = true AND te.resolved = false
    ORDER BY te.date DESC
  `);
  res.json(result.rows);
});

// Halil overrides a time entry
router.put('/:id', async (req, res) => {
  const { check_in, check_out, resolved } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (check_in !== undefined) { updates.push(`check_in = $${idx++}`); values.push(check_in); }
  if (check_out !== undefined) { updates.push(`check_out = $${idx++}`); values.push(check_out); }
  if (resolved !== undefined) {
    updates.push(`resolved = $${idx++}`); values.push(resolved);
    if (resolved) { updates.push(`is_flagged = false`); }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE time_entries SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(result.rows[0]);
});

export default router;
```

- [ ] **Step 2: Create src/routes/sickLeave.js**

```js
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { adjustSickLeave } from '../services/sickLeave.js';

const router = Router();

router.get('/', async (req, res) => {
  const { worker_id, status } = req.query;
  let query = `
    SELECT sl.*, w.name AS worker_name
    FROM sick_leave sl
    JOIN workers w ON sl.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (worker_id) {
    params.push(parseInt(worker_id));
    query += ` AND sl.worker_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND sl.status = $${params.length}`;
  }

  query += ' ORDER BY sl.start_date DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Halil adjusts sick leave (AOK result, override)
router.put('/:id', async (req, res) => {
  const result = await adjustSickLeave(parseInt(req.params.id), req.body);
  res.json(result);
});

export default router;
```

- [ ] **Step 3: Create src/routes/vacation.js**

```js
import { Router } from 'express';
import { getVacationBalance, ensureVacationBalance } from '../services/vacation.js';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const result = await pool.query(`
    SELECT vb.*, w.name AS worker_name
    FROM vacation_balances vb
    JOIN workers w ON vb.worker_id = w.id
    WHERE vb.year = $1 AND w.is_active = true
    ORDER BY w.name
  `, [year]);

  const balances = result.rows.map(row => ({
    ...row,
    remaining: row.entitlement_days - row.used_days,
  }));
  res.json(balances);
});

// Initialize vacation balance for a worker/year
router.post('/', async (req, res) => {
  const { worker_id, year, entitlement_days } = req.body;
  await ensureVacationBalance(worker_id, year, entitlement_days);
  const balance = await getVacationBalance(worker_id, year);
  res.status(201).json(balance);
});

export default router;
```

- [ ] **Step 4: Register all routes in src/app.js**

Add to `src/app.js`:
```js
import timeEntriesRouter from './routes/timeEntries.js';
import sickLeaveRouter from './routes/sickLeave.js';
import vacationRouter from './routes/vacation.js';

app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/sick-leave', sickLeaveRouter);
app.use('/api/vacation', vacationRouter);
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/timeEntries.js src/routes/sickLeave.js src/routes/vacation.js src/app.js
git commit -m "feat: API routes for time entries, sick leave, and vacation management"
```

---

## Task 10: Admin Authentication

**Files:**
- Create: `src/middleware/auth.js`
- Create: `src/routes/auth.js`
- Modify: `src/app.js` — register auth route + protect API routes

- [ ] **Step 1: Create src/middleware/auth.js**

```js
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

- [ ] **Step 2: Create src/routes/auth.js**

```js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== config.adminUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, config.adminPasswordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});

export default router;
```

- [ ] **Step 3: Update src/app.js — add auth middleware to API routes (except webhook)**

```js
import authRouter from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/webhook', webhookRouter); // Twilio needs unauthenticated access

// Protected routes
app.use('/api/workers', requireAuth, workersRouter);
app.use('/api/time-entries', requireAuth, timeEntriesRouter);
app.use('/api/sick-leave', requireAuth, sickLeaveRouter);
app.use('/api/vacation', requireAuth, vacationRouter);
```

- [ ] **Step 4: Generate a password hash for Halil's initial password**

```bash
node -e "import('bcrypt').then(b => b.default.hash('changeme', 10).then(h => console.log(h)))"
```
Copy the output hash into `.env` as `ADMIN_PASSWORD_HASH`.

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.js src/routes/auth.js src/app.js
git commit -m "feat: admin JWT authentication with protected API routes"
```

---

## Task 11: WhatsApp Notifications to Halil

**Files:**
- Create: `src/services/notifications.js`
- Modify: `src/services/bot.js` — trigger notification on sick declaration

- [ ] **Step 1: Create src/services/notifications.js**

```js
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

export async function notifyHalilSickDeclaration(workerName, days) {
  const dayText = days > 0 ? `${days} Tage` : 'unbestimmte Zeit';
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `Krankmeldung: ${workerName} hat sich fuer ${dayText} krank gemeldet.\n\n> OK\n> Bearbeiten`
  );
}

export async function notifyHalilMissingCheckouts(entries) {
  if (entries.length === 0) return;
  const names = entries.map(e => e.worker_name).join(', ');
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `${entries.length} fehlende Auschecken: ${names}.\nBitte im Dashboard korrigieren.`
  );
}

export async function notifyHalilReportReady(month, year) {
  const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `Monatsbericht fuer ${monthNames[month - 1]} ${year} ist bereit zur Pruefung.\n\n> OK\n> Bearbeiten`
  );
}

export async function notifyHalilAnomaly(message) {
  await sendWhatsAppMessage(config.halilWhatsappNumber, `Anomalie: ${message}`);
}
```

- [ ] **Step 2: Add notification trigger in src/services/bot.js**

Add import at top of `src/services/bot.js`:
```js
import { notifyHalilSickDeclaration } from './notifications.js';
```

In the `handleSickDayCount` function, after the `INSERT INTO sick_leave` query, add:
```js
  // Notify Halil
  await notifyHalilSickDeclaration(worker.name, days);
```

- [ ] **Step 3: Commit**

```bash
git add src/services/notifications.js src/services/bot.js
git commit -m "feat: WhatsApp notifications to Halil for sick declarations, missing checkouts, reports"
```

---

## Task 12: PDF Report Generation

**Files:**
- Create: `src/services/pdfReport.js`
- Create: `src/routes/reports.js`
- Modify: `src/app.js` — register route

- [ ] **Step 1: Create src/services/pdfReport.js**

```js
import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import {
  calculateDailyHours,
  calculateMonthlyHours,
  calculateMonthlyHarcirah,
  splitOfficialAndUnofficial,
} from './timeCalculation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '../../uploads/reports');

const MONTH_NAMES = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export async function generateMonthlyReport(month, year) {
  mkdirSync(REPORTS_DIR, { recursive: true });

  // Fetch all active workers
  const workers = await pool.query(
    'SELECT * FROM workers WHERE is_active = true ORDER BY name'
  );

  // Fetch time entries for the month
  const entries = await pool.query(
    `SELECT * FROM time_entries
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
     ORDER BY worker_id, date`,
    [month, year]
  );

  // Fetch sick leave for the month
  const sickLeaves = await pool.query(
    `SELECT * FROM sick_leave
     WHERE EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2`,
    [month, year]
  );

  // Fetch vacation balances
  const vacations = await pool.query(
    'SELECT * FROM vacation_balances WHERE year = $1',
    [year]
  );

  // Build per-worker summary
  const summaries = workers.rows.map(worker => {
    const workerEntries = entries.rows.filter(e => e.worker_id === worker.id);
    const totalHours = calculateMonthlyHours(workerEntries);
    const minijobMax = worker.worker_type === 'minijob' && worker.monthly_salary && worker.hourly_rate
      ? Number(worker.monthly_salary) / Number(worker.hourly_rate)
      : null;
    const { official, unofficial } = splitOfficialAndUnofficial(totalHours, worker.worker_type, minijobMax);
    const harcirah = calculateMonthlyHarcirah(workerEntries);

    const workerSick = sickLeaves.rows.filter(s => s.worker_id === worker.id);
    const sickDays = workerSick.reduce((sum, s) => sum + (s.aok_approved_days || s.declared_days), 0);
    const vacDeducted = workerSick.reduce((sum, s) => sum + s.vacation_deducted_days, 0);
    const unpaid = workerSick.reduce((sum, s) => sum + s.unpaid_days, 0);

    const vacBalance = vacations.rows.find(v => v.worker_id === worker.id);

    return {
      name: worker.name,
      type: worker.worker_type,
      hourlyRate: Number(worker.hourly_rate),
      officialHours: official,
      sickDays,
      vacationDeducted: vacDeducted,
      unpaidDays: unpaid,
      harcirahDays: harcirah.days,
      harcirahAmount: harcirah.amount,
      vacationRemaining: vacBalance ? vacBalance.entitlement_days - vacBalance.used_days : 0,
    };
  });

  // Generate PDF
  const filename = `Gehaltsbericht_${MONTH_NAMES[month - 1]}_${year}.pdf`;
  const filepath = join(REPORTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = createWriteStream(filepath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).font('Helvetica-Bold')
      .text('Bal Hausmeisterservice', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Pfaffenhofen an der Ilm', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold')
      .text(`Gehalt / Lohn Mitarbeiter — ${MONTH_NAMES[month - 1]} ${year}`, { align: 'center' });
    doc.moveDown();

    // Horizontal line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const col = { name: 50, type: 160, hours: 220, sick: 280, vacation: 330, harcirah: 400, rate: 470 };

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Name', col.name, tableTop);
    doc.text('Typ', col.type, tableTop);
    doc.text('Std.', col.hours, tableTop);
    doc.text('Krank', col.sick, tableTop);
    doc.text('Urlaub', col.vacation, tableTop);
    doc.text('Harcirah', col.harcirah, tableTop);
    doc.text('Satz', col.rate, tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    // Table rows
    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(9);

    for (const s of summaries) {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      doc.text(s.name, col.name, y, { width: 105 });
      doc.text(s.type === 'fulltime' ? 'Vollzeit' : 'Minijob', col.type, y);
      doc.text(s.officialHours.toFixed(1), col.hours, y);
      doc.text(s.sickDays > 0 ? `${s.sickDays} T` : '-', col.sick, y);
      doc.text(s.vacationDeducted > 0 ? `${s.vacationDeducted} T` : '-', col.vacation, y);
      doc.text(s.harcirahDays > 0 ? `${s.harcirahDays} T / ${s.harcirahAmount} EUR` : '-', col.harcirah, y);
      doc.text(s.hourlyRate ? `${s.hourlyRate} EUR/h` : '-', col.rate, y);

      y += 18;
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#666')
      .text(`Erstellt am ${new Date().toLocaleDateString('de-DE')} — Bal Hausmeisterservice`, 50, 780, { align: 'center' });

    doc.end();

    stream.on('finish', async () => {
      // Save report record to DB
      await pool.query(
        `INSERT INTO monthly_reports (month, year, generated_at, pdf_path, status)
         VALUES ($1, $2, NOW(), $3, 'draft')
         ON CONFLICT (month, year) DO UPDATE SET generated_at = NOW(), pdf_path = $3, status = 'draft'`,
        [month, year, filepath]
      );
      resolve({ filepath, filename });
    });

    stream.on('error', reject);
  });
}
```

- [ ] **Step 2: Create src/routes/reports.js**

```js
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { generateMonthlyReport } from '../services/pdfReport.js';
import { notifyHalilReportReady } from '../services/notifications.js';

const router = Router();

// List reports
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM monthly_reports ORDER BY year DESC, month DESC');
  res.json(result.rows);
});

// Generate report for a month
router.post('/generate', async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const report = await generateMonthlyReport(parseInt(month), parseInt(year));
  await notifyHalilReportReady(parseInt(month), parseInt(year));
  res.json({ message: 'Report generated', filename: report.filename });
});

// Download report PDF
router.get('/:id/download', async (req, res) => {
  const result = await pool.query('SELECT * FROM monthly_reports WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

  const report = result.rows[0];
  if (!report.pdf_path) return res.status(404).json({ error: 'PDF not generated yet' });

  res.download(report.pdf_path);
});

// Update report status (reviewed, sent)
router.put('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'reviewed', 'sent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = await pool.query(
    'UPDATE monthly_reports SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
  res.json(result.rows[0]);
});

export default router;
```

- [ ] **Step 3: Register in src/app.js**

Add to `src/app.js`:
```js
import reportsRouter from './routes/reports.js';

app.use('/api/reports', requireAuth, reportsRouter);
```

- [ ] **Step 4: Commit**

```bash
git add src/services/pdfReport.js src/routes/reports.js src/app.js
git commit -m "feat: monthly PDF report generation with professional layout for Steuerberater"
```

---

## Task 13: Admin Dashboard — Setup + Login

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.js`
- Create: `client/index.html`
- Create: `client/public/manifest.json`
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`
- Create: `client/src/api/client.js`
- Create: `client/src/context/AuthContext.jsx`
- Create: `client/src/pages/Login.jsx`
- Create: `client/src/components/Layout.jsx`

- [ ] **Step 1: Initialize React client**

```bash
cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice"
mkdir -p client/src client/public
cd client
npm init -y
npm install react react-dom react-router-dom
npm install -D vite @vitejs/plugin-react
```

- [ ] **Step 2: Create client/vite.config.js**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1a365d" />
  <link rel="manifest" href="/manifest.json" />
  <title>Bal Hausmeisterservice — Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #1a202c; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create client/public/manifest.json**

```json
{
  "name": "Bal Hausmeisterservice Admin",
  "short_name": "Bal HMS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f7fa",
  "theme_color": "#1a365d",
  "icons": []
}
```

- [ ] **Step 5: Create client/src/api/client.js**

```js
const BASE_URL = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  login: (username, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
};
```

- [ ] **Step 6: Create client/src/context/AuthContext.jsx**

```jsx
import { createContext, useContext, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));

  const login = async (username, password) => {
    const data = await api.login(username, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 7: Create client/src/pages/Login.jsx**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Ungueltige Anmeldedaten');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <form onSubmit={handleSubmit} style={{
        background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%', maxWidth: '360px',
      }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>Bal Hausmeisterservice</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '1.5rem' }}>Admin Login</p>
        {error && <p style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}
        <input type="text" placeholder="Benutzername" value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid #ddd', borderRadius: '4px' }} />
        <input type="password" placeholder="Passwort" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '4px' }} />
        <button type="submit" style={{
          width: '100%', padding: '0.75rem', background: '#1a365d', color: 'white',
          border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem',
        }}>Anmelden</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Create client/src/components/Layout.jsx**

```jsx
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/workers', label: 'Mitarbeiter' },
  { path: '/time-entries', label: 'Zeiterfassung' },
  { path: '/sick-leave', label: 'Krankmeldungen' },
  { path: '/vacation', label: 'Urlaub' },
  { path: '/reports', label: 'Berichte' },
];

export default function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: '220px', background: '#1a365d', color: 'white', padding: '1rem 0',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 style={{ fontSize: '1rem' }}>Bal HMS</h2>
          <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Admin Panel</p>
        </div>
        <div style={{ flex: 1, padding: '1rem 0' }}>
          {navItems.map(item => (
            <Link key={item.path} to={item.path} style={{
              display: 'block', padding: '0.6rem 1rem', color: 'white',
              textDecoration: 'none', fontSize: '0.9rem',
            }}>
              {item.label}
            </Link>
          ))}
        </div>
        <button onClick={handleLogout} style={{
          margin: '1rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)',
          color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>Abmelden</button>
      </nav>
      <main style={{ flex: 1, padding: '1.5rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Create client/src/App.jsx and client/src/main.jsx**

`client/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function PlaceholderPage({ title }) {
  return <h1>{title}</h1>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<PlaceholderPage title="Dashboard" />} />
            <Route path="workers" element={<PlaceholderPage title="Mitarbeiter" />} />
            <Route path="time-entries" element={<PlaceholderPage title="Zeiterfassung" />} />
            <Route path="sick-leave" element={<PlaceholderPage title="Krankmeldungen" />} />
            <Route path="vacation" element={<PlaceholderPage title="Urlaub" />} />
            <Route path="reports" element={<PlaceholderPage title="Berichte" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

`client/src/main.jsx`:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 10: Verify client starts**

```bash
cd client && npx vite --open
```
Expected: Login page renders at http://localhost:5173/login

- [ ] **Step 11: Commit**

```bash
cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice"
git add client/
git commit -m "feat: admin dashboard setup with React, Vite, login page, nav layout, auth context"
```

---

## Task 14: Admin Dashboard — Worker Management Page

**Files:**
- Create: `client/src/pages/Workers.jsx`
- Create: `client/src/components/WorkerForm.jsx`
- Modify: `client/src/App.jsx` — replace placeholder

- [ ] **Step 1: Create client/src/components/WorkerForm.jsx**

```jsx
import { useState } from 'react';

const inputStyle = { width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '0.75rem' };
const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' };

export default function WorkerForm({ worker, onSave, onCancel }) {
  const [form, setForm] = useState(worker || {
    name: '', phone_number: '', worker_type: 'fulltime', hourly_rate: '', monthly_salary: '',
    registration_date: '', vacation_entitlement: '',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} required />

      <label style={labelStyle}>Telefon (WhatsApp)</label>
      <input style={inputStyle} value={form.phone_number} onChange={e => update('phone_number', e.target.value)} placeholder="+49..." required />

      <label style={labelStyle}>Typ</label>
      <select style={inputStyle} value={form.worker_type} onChange={e => update('worker_type', e.target.value)}>
        <option value="fulltime">Vollzeit</option>
        <option value="minijob">Minijob</option>
      </select>

      <label style={labelStyle}>Stundensatz (EUR)</label>
      <input style={inputStyle} type="number" step="0.01" value={form.hourly_rate} onChange={e => update('hourly_rate', e.target.value)} />

      {form.worker_type === 'minijob' && (
        <>
          <label style={labelStyle}>Monatliches Gehalt (EUR)</label>
          <input style={inputStyle} type="number" step="0.01" value={form.monthly_salary} onChange={e => update('monthly_salary', e.target.value)} />
        </>
      )}

      <label style={labelStyle}>Registrierungsdatum</label>
      <input style={inputStyle} type="date" value={form.registration_date} onChange={e => update('registration_date', e.target.value)} required />

      <label style={labelStyle}>Urlaubsanspruch (Tage/Jahr)</label>
      <input style={inputStyle} type="number" value={form.vacation_entitlement} onChange={e => update('vacation_entitlement', e.target.value)} />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1.5rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Speichern
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create client/src/pages/Workers.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import WorkerForm from '../components/WorkerForm';

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadWorkers = async () => {
    const data = await api.get('/workers');
    setWorkers(data);
  };

  useEffect(() => { loadWorkers(); }, []);

  const handleSave = async (form) => {
    if (editing) {
      await api.put(`/workers/${editing.id}`, form);
    } else {
      await api.post('/workers', form);
    }
    setShowForm(false);
    setEditing(null);
    loadWorkers();
  };

  const handleDelete = async (id) => {
    if (confirm('Mitarbeiter wirklich deaktivieren?')) {
      await api.delete(`/workers/${id}`);
      loadWorkers();
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Mitarbeiter</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{
          padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>+ Neuer Mitarbeiter</button>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1.5rem' }}>
          <WorkerForm
            worker={editing}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Telefon</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Typ</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Satz</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Urlaub</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {workers.map(w => (
            <tr key={w.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{w.name}</td>
              <td style={{ padding: '0.75rem' }}>{w.phone_number}</td>
              <td style={{ padding: '0.75rem' }}>{w.worker_type === 'fulltime' ? 'Vollzeit' : 'Minijob'}</td>
              <td style={{ padding: '0.75rem' }}>{w.hourly_rate ? `${w.hourly_rate} EUR/h` : '-'}</td>
              <td style={{ padding: '0.75rem' }}>{w.vacation_entitlement} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                <button onClick={() => { setEditing(w); setShowForm(true); }}
                  style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Bearbeiten
                </button>
                <button onClick={() => handleDelete(w.id)}
                  style={{ padding: '0.25rem 0.75rem', background: '#fed7d7', color: '#c53030', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Deaktivieren
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Update App.jsx — replace placeholder with Workers page**

In `client/src/App.jsx`, replace:
```jsx
import PlaceholderPage from ...
```
with:
```jsx
import Workers from './pages/Workers';
```

And replace the workers route:
```jsx
<Route path="workers" element={<Workers />} />
```

- [ ] **Step 4: Commit**

```bash
git add client/src/
git commit -m "feat: admin dashboard worker management page with create, edit, deactivate"
```

---

## Task 15: Admin Dashboard — Time Entries, Sick Leave, Vacation, Reports Pages

**Files:**
- Create: `client/src/pages/Dashboard.jsx`
- Create: `client/src/pages/TimeEntries.jsx`
- Create: `client/src/pages/SickLeave.jsx`
- Create: `client/src/pages/Vacation.jsx`
- Create: `client/src/pages/Reports.jsx`
- Create: `client/src/components/MonthPicker.jsx`
- Create: `client/src/components/FlagBadge.jsx`
- Modify: `client/src/App.jsx` — wire up all pages

- [ ] **Step 1: Create client/src/components/MonthPicker.jsx**

```jsx
export default function MonthPicker({ month, year, onChange }) {
  const months = [
    'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <select value={month} onChange={e => onChange(parseInt(e.target.value), year)}
        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd' }}>
        {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <input type="number" value={year} onChange={e => onChange(month, parseInt(e.target.value))}
        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }} />
    </div>
  );
}
```

- [ ] **Step 2: Create client/src/components/FlagBadge.jsx**

```jsx
export default function FlagBadge({ reason }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.5rem', background: '#fed7d7',
      color: '#c53030', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
    }}>
      {reason}
    </span>
  );
}
```

- [ ] **Step 3: Create client/src/pages/Dashboard.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Dashboard() {
  const [flagged, setFlagged] = useState([]);
  const [pendingSick, setPendingSick] = useState([]);

  useEffect(() => {
    api.get('/time-entries/flagged').then(setFlagged).catch(() => {});
    api.get('/sick-leave?status=pending').then(setPendingSick).catch(() => {});
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Offene Flags ({flagged.length})</h2>
          {flagged.length === 0 ? <p style={{ color: '#999' }}>Keine offenen Flags</p> : (
            <ul style={{ listStyle: 'none' }}>
              {flagged.map(f => (
                <li key={f.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  {f.worker_name} — {f.date} — {f.flag_reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Offene Krankmeldungen ({pendingSick.length})</h2>
          {pendingSick.length === 0 ? <p style={{ color: '#999' }}>Keine offenen Krankmeldungen</p> : (
            <ul style={{ listStyle: 'none' }}>
              {pendingSick.map(s => (
                <li key={s.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  {s.worker_name} — {s.start_date} — {s.declared_days} Tage
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create client/src/pages/TimeEntries.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MonthPicker from '../components/MonthPicker';
import FlagBadge from '../components/FlagBadge';

export default function TimeEntries() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    const data = await api.get(`/time-entries?month=${month}&year=${year}`);
    setEntries(data);
  };

  useEffect(() => { load(); }, [month, year]);

  const handleMonthChange = (m, y) => { setMonth(m); setYear(y); };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditForm({
      check_in: entry.check_in ? entry.check_in.slice(0, 16) : '',
      check_out: entry.check_out ? entry.check_out.slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    await api.put(`/time-entries/${editingId}`, { ...editForm, resolved: true });
    setEditingId(null);
    load();
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '-';
  const formatDate = (d) => new Date(d).toLocaleDateString('de-DE');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Zeiterfassung</h1>
        <MonthPicker month={month} year={year} onChange={handleMonthChange} />
      </div>

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Datum</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Einchecken</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Auschecken</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={{ borderBottom: '1px solid #e2e8f0', background: e.is_flagged ? '#fff5f5' : 'white' }}>
              <td style={{ padding: '0.75rem' }}>{formatDate(e.date)}</td>
              <td style={{ padding: '0.75rem' }}>{e.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id
                  ? <input type="datetime-local" value={editForm.check_in} onChange={ev => setEditForm(f => ({ ...f, check_in: ev.target.value }))} />
                  : formatTime(e.check_in)}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id
                  ? <input type="datetime-local" value={editForm.check_out} onChange={ev => setEditForm(f => ({ ...f, check_out: ev.target.value }))} />
                  : formatTime(e.check_out)}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {e.is_flagged && <FlagBadge reason={e.flag_reason} />}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={saveEdit} style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Speichern</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '0.25rem 0.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(e)} style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create client/src/pages/SickLeave.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function SickLeave() {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    const data = await api.get('/sick-leave');
    setRecords(data);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditForm({
      aok_approved_days: record.aok_approved_days || '',
      vacation_deducted_days: record.vacation_deducted_days || 0,
      unpaid_days: record.unpaid_days || 0,
      status: record.status,
    });
  };

  const saveEdit = async () => {
    await api.put(`/sick-leave/${editingId}`, editForm);
    setEditingId(null);
    load();
  };

  const statusColors = { pending: '#fefcbf', approved: '#c6f6d5', overridden: '#fed7d7' };
  const statusLabels = { pending: 'Offen', approved: 'Genehmigt', overridden: 'Ueberschrieben' };

  return (
    <div>
      <h1 style={{ marginBottom: '1rem' }}>Krankmeldungen</h1>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Startdatum</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Gemeldet</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>AOK</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Urlaub</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Unbezahlt</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{r.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>{new Date(r.start_date).toLocaleDateString('de-DE')}</td>
              <td style={{ padding: '0.75rem' }}>{r.declared_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.aok_approved_days} onChange={e => setEditForm(f => ({ ...f, aok_approved_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : (r.aok_approved_days !== null ? `${r.aok_approved_days} Tage` : '-')}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.vacation_deducted_days} onChange={e => setEditForm(f => ({ ...f, vacation_deducted_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : `${r.vacation_deducted_days} Tage`}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.unpaid_days} onChange={e => setEditForm(f => ({ ...f, unpaid_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : `${r.unpaid_days} Tage`}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id ? (
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Offen</option>
                    <option value="approved">Genehmigt</option>
                    <option value="overridden">Ueberschrieben</option>
                  </select>
                ) : (
                  <span style={{ padding: '0.15rem 0.5rem', borderRadius: '12px', background: statusColors[r.status], fontSize: '0.8rem' }}>
                    {statusLabels[r.status]}
                  </span>
                )}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={saveEdit} style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Speichern</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '0.25rem 0.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(r)} style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Create client/src/pages/Vacation.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Vacation() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [balances, setBalances] = useState([]);

  const load = async () => {
    const data = await api.get(`/vacation?year=${year}`);
    setBalances(data);
  };

  useEffect(() => { load(); }, [year]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Urlaubskonto</h1>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }} />
      </div>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Anspruch</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Genommen</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Verbleibend</th>
          </tr>
        </thead>
        <tbody>
          {balances.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{b.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>{b.entitlement_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>{b.used_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                <span style={{
                  fontWeight: 600,
                  color: b.remaining <= 3 ? '#c53030' : b.remaining <= 7 ? '#d69e2e' : '#38a169',
                }}>
                  {b.remaining} Tage
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 7: Create client/src/pages/Reports.jsx**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MonthPicker from '../components/MonthPicker';

export default function Reports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const data = await api.get('/reports');
    setReports(data);
  };

  useEffect(() => { load(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/reports/generate', { month, year });
      load();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (id) => {
    const token = localStorage.getItem('token');
    window.open(`/api/reports/${id}/download?token=${token}`);
  };

  const handleStatusUpdate = async (id, status) => {
    await api.put(`/reports/${id}`, { status });
    load();
  };

  const statusLabels = { draft: 'Entwurf', reviewed: 'Geprueft', sent: 'Gesendet' };
  const statusColors = { draft: '#fefcbf', reviewed: '#bee3f8', sent: '#c6f6d5' };

  const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  return (
    <div>
      <h1 style={{ marginBottom: '1rem' }}>Berichte</h1>

      <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Neuen Bericht erstellen</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <button onClick={handleGenerate} disabled={generating} style={{
            padding: '0.5rem 1.5rem', background: generating ? '#aaa' : '#1a365d',
            color: 'white', border: 'none', borderRadius: '4px', cursor: generating ? 'default' : 'pointer',
          }}>
            {generating ? 'Wird erstellt...' : 'Bericht erstellen'}
          </button>
        </div>
      </div>

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Monat</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Erstellt am</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {reports.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{monthNames[r.month - 1]} {r.year}</td>
              <td style={{ padding: '0.75rem' }}>{r.generated_at ? new Date(r.generated_at).toLocaleDateString('de-DE') : '-'}</td>
              <td style={{ padding: '0.75rem' }}>
                <span style={{ padding: '0.15rem 0.5rem', borderRadius: '12px', background: statusColors[r.status], fontSize: '0.8rem' }}>
                  {statusLabels[r.status]}
                </span>
              </td>
              <td style={{ padding: '0.75rem', display: 'flex', gap: '0.25rem' }}>
                {r.pdf_path && (
                  <button onClick={() => handleDownload(r.id)}
                    style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Download PDF
                  </button>
                )}
                {r.status === 'draft' && (
                  <button onClick={() => handleStatusUpdate(r.id, 'reviewed')}
                    style={{ padding: '0.25rem 0.5rem', background: '#bee3f8', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Als geprueft markieren
                  </button>
                )}
                {r.status === 'reviewed' && (
                  <button onClick={() => handleStatusUpdate(r.id, 'sent')}
                    style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Als gesendet markieren
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: Update App.jsx — wire up all pages**

Replace the full routes section in `client/src/App.jsx`:
```jsx
import Dashboard from './pages/Dashboard';
import Workers from './pages/Workers';
import TimeEntries from './pages/TimeEntries';
import SickLeave from './pages/SickLeave';
import Vacation from './pages/Vacation';
import Reports from './pages/Reports';

// In Routes:
<Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route index element={<Dashboard />} />
  <Route path="workers" element={<Workers />} />
  <Route path="time-entries" element={<TimeEntries />} />
  <Route path="sick-leave" element={<SickLeave />} />
  <Route path="vacation" element={<Vacation />} />
  <Route path="reports" element={<Reports />} />
</Route>
```

- [ ] **Step 9: Verify all pages render**

```bash
cd client && npx vite
```
Navigate through all pages in the browser — verify they render without errors.

- [ ] **Step 10: Commit**

```bash
cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice"
git add client/
git commit -m "feat: admin dashboard pages — dashboard, time entries, sick leave, vacation, reports"
```

---

## Task 16: Serve Client from Express in Production

**Files:**
- Modify: `src/app.js` — serve built client
- Modify: `package.json` — add build script

- [ ] **Step 1: Add build script to root package.json**

```json
{
  "scripts": {
    "build": "cd client && npx vite build",
    "start": "node src/index.js"
  }
}
```

- [ ] **Step 2: Update src/app.js to serve client in production**

Add at the end of `src/app.js`, before `export default app`:
```js
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '../client/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(clientDist, 'index.html'));
    }
  });
}
```

- [ ] **Step 3: Build and test**

```bash
npm run build
npm start
```
Visit http://localhost:3000 — should serve the admin dashboard.

- [ ] **Step 4: Commit**

```bash
git add package.json src/app.js
git commit -m "feat: serve built client from Express in production"
```

---

## Task 17: Final Integration Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 2: Manual end-to-end verification checklist**

1. Start PostgreSQL: `docker compose up -d`
2. Run migrations: `npm run migrate`
3. Start server: `npm run dev`
4. Open admin dashboard at http://localhost:5173
5. Log in with admin credentials
6. Create a test worker (Mitarbeiter page)
7. Verify worker appears in the list
8. Test WhatsApp webhook with curl:
   ```bash
   curl -X POST http://localhost:3000/api/webhook -d "From=whatsapp:+4917612345678&Body=Einchecken" -H "Content-Type: application/x-www-form-urlencoded"
   ```
9. Check time entry appears in Zeiterfassung page
10. Generate a monthly report from Berichte page
11. Download the PDF and verify it looks correct

- [ ] **Step 3: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: integration testing fixes"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | package.json, app.js, config.js |
| 2 | Database schema | migrations/001, pool.js, migrate.js |
| 3 | Worker CRUD API | routes/workers.js |
| 4 | WhatsApp webhook + bot | services/bot.js, routes/webhook.js |
| 5 | Time calculations | services/timeCalculation.js |
| 6 | Sick leave cascade | services/sickLeave.js |
| 7 | Vacation tracking | services/vacation.js |
| 8 | Anomaly detection + scheduler | services/anomaly.js, scheduler.js |
| 9 | API routes (time, sick, vacation) | routes/timeEntries.js, sickLeave.js, vacation.js |
| 10 | Admin authentication | middleware/auth.js, routes/auth.js |
| 11 | WhatsApp notifications | services/notifications.js |
| 12 | PDF report generation | services/pdfReport.js, routes/reports.js |
| 13 | Dashboard setup + login | client/src/* (setup, login, layout) |
| 14 | Worker management page | client/src/pages/Workers.jsx |
| 15 | All remaining dashboard pages | Dashboard, TimeEntries, SickLeave, Vacation, Reports |
| 16 | Production build serving | app.js static file serving |
| 17 | Integration testing | Manual verification |
