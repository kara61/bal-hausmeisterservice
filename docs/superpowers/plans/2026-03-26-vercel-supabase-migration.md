# Vercel + Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Bal Hausmeisterservice from Express + self-hosted PostgreSQL to Vercel serverless functions + Supabase, keeping all business logic unchanged.

**Architecture:** Vercel monorepo with Vite React frontend (static) + `/api` serverless functions. Supabase provides PostgreSQL (same schema, same SQL queries) + Storage (photos, PDF reports). Cron jobs via Vercel Cron (2 endpoints). Bot conversation state in DB table instead of in-memory Map.

**Tech Stack:** Vercel Functions (Node.js 20), Supabase (PostgreSQL + Storage), `pg` (direct SQL), `@supabase/supabase-js` (Storage only), `formidable` (multipart uploads), React 18 + Vite

---

## File Map

### New Files (create)
- `api/_utils/auth.js` — Auth helper for serverless (non-middleware pattern)
- `api/_utils/handler.js` — Shared handler wrapper with error handling
- `api/auth/login.js` — POST /api/auth/login
- `api/workers/index.js` — GET, POST /api/workers
- `api/workers/[id].js` — GET, PUT, DELETE /api/workers/:id
- `api/time-entries/index.js` — GET /api/time-entries
- `api/time-entries/flagged.js` — GET /api/time-entries/flagged
- `api/time-entries/[id].js` — PUT /api/time-entries/:id
- `api/sick-leave/index.js` — GET /api/sick-leave
- `api/sick-leave/[id].js` — PUT /api/sick-leave/:id
- `api/vacation/index.js` — GET, POST /api/vacation
- `api/reports/index.js` — GET /api/reports
- `api/reports/generate.js` — POST /api/reports/generate
- `api/reports/[id]/download.js` — GET /api/reports/:id/download
- `api/reports/[id]/index.js` — PUT /api/reports/:id
- `api/properties/index.js` — GET, POST /api/properties
- `api/properties/[id].js` — GET, PUT, DELETE /api/properties/:id
- `api/teams/index.js` — GET, POST /api/teams
- `api/teams/[id]/members.js` — PUT /api/teams/:id/members
- `api/teams/[id]/index.js` — DELETE /api/teams/:id
- `api/tasks/daily.js` — GET /api/tasks/daily
- `api/tasks/generate.js` — POST /api/tasks/generate
- `api/tasks/carryover.js` — POST /api/tasks/carryover
- `api/tasks/[id]/assign.js` — PUT /api/tasks/:id/assign
- `api/tasks/[id]/status.js` — PUT /api/tasks/:id/status
- `api/tasks/[id]/postpone.js` — PUT /api/tasks/:id/postpone
- `api/tasks/[id]/reassign.js` — PUT /api/tasks/:id/reassign
- `api/extra-jobs/index.js` — GET, POST /api/extra-jobs
- `api/extra-jobs/[id]/index.js` — PUT, DELETE /api/extra-jobs/:id
- `api/extra-jobs/[id]/photos.js` — POST /api/extra-jobs/:id/photos
- `api/garbage/upload.js` — POST /api/garbage/upload
- `api/garbage/map.js` — POST /api/garbage/map
- `api/garbage/summary.js` — GET /api/garbage/summary
- `api/garbage/generate.js` — POST /api/garbage/generate
- `api/garbage/upcoming.js` — GET /api/garbage/upcoming
- `api/garbage/schedule/[propertyId].js` — GET, DELETE /api/garbage/schedule/:propertyId
- `api/webhook.js` — POST /api/webhook (Twilio)
- `api/cron/nightly.js` — Cron: flag checkouts + notify Halil
- `api/cron/morning.js` — Cron: carryover + generate tasks + send lists
- `api/health.js` — GET /api/health
- `vercel.json` — Build config + cron schedules
- `src/db/migrations/004-conversation-state.sql` — conversation_state table

### Modify
- `src/db/pool.js` — Add SSL for Supabase
- `src/config.js` — Add Supabase env vars, remove PORT
- `src/services/bot.js` — Replace Map with DB state functions
- `src/services/photoStorage.js` — Replace disk with Supabase Storage
- `src/services/pdfReport.js` — Replace disk with Supabase Storage + buffer
- `src/middleware/auth.js` — Add serverless-compatible `checkAuth` export
- `package.json` — Update dependencies and scripts
- `client/vite.config.js` — Remove proxy (not needed on Vercel)
- `tests/helpers.js` — Add garbage tables to cleanDb
- `.gitignore` — Add `.vercel/`

### Delete (after migration verified)
- `src/app.js` — Express app setup
- `src/index.js` — Server entry point
- `src/services/scheduler.js` — node-cron orchestrator
- `src/routes/*.js` — All 12 Express route files

---

### Task 1: Project Configuration + Dependencies

**Files:**
- Modify: `package.json`
- Create: `vercel.json`
- Modify: `.gitignore`
- Modify: `client/vite.config.js`

- [ ] **Step 1: Update root package.json**

Remove Express-specific packages and add Vercel + Supabase packages:

```json
{
  "name": "bal-hausmeisterservice",
  "version": "2.0.0",
  "main": "index.js",
  "directories": {
    "doc": "docs"
  },
  "scripts": {
    "dev": "vercel dev",
    "build": "cd client && npm install && npx vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "node src/db/migrate.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "description": "Bal Hausmeisterservice - Facility Management System",
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "bcrypt": "^6.0.0",
    "dotenv": "^17.3.1",
    "formidable": "^3.5.2",
    "jsonwebtoken": "^9.0.3",
    "pdf-parse": "^2.4.5",
    "pdfkit": "^0.18.0",
    "pg": "^8.20.0",
    "twilio": "^5.13.1"
  },
  "devDependencies": {
    "vitest": "^4.1.1"
  }
}
```

Removed: `express`, `cors`, `helmet`, `multer`, `node-cron`, `supertest`

- [ ] **Step 2: Create vercel.json**

```json
{
  "buildCommand": "cd client && npm install && npx vite build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "crons": [
    { "path": "/api/cron/nightly", "schedule": "0 0 * * *" },
    { "path": "/api/cron/morning", "schedule": "0 5 * * *" }
  ]
}
```

- [ ] **Step 3: Update .gitignore**

Add `.vercel/` to existing `.gitignore`:

```
node_modules/
.env
client/node_modules/
client/dist/
uploads/
*.pdf
.vercel/
```

- [ ] **Step 4: Update client/vite.config.js**

Remove the dev proxy (Vercel handles routing):

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: Installs `@supabase/supabase-js` and `formidable`, removes old packages.

- [ ] **Step 6: Commit**

```bash
git add package.json vercel.json .gitignore client/vite.config.js
git commit -m "chore: update dependencies and config for Vercel + Supabase migration"
```

---

### Task 2: Database + Config + Auth Helpers

**Files:**
- Create: `src/db/migrations/004-conversation-state.sql`
- Modify: `src/db/pool.js`
- Modify: `src/config.js`
- Modify: `src/middleware/auth.js`
- Create: `api/_utils/auth.js`
- Create: `api/_utils/handler.js`

- [ ] **Step 1: Create conversation_state migration**

Create file `src/db/migrations/004-conversation-state.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversation_state (
  phone_number VARCHAR(20) PRIMARY KEY,
  state VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Update pool.js for Supabase SSL**

Replace `src/db/pool.js`:

```js
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});
```

- [ ] **Step 3: Update config.js**

Replace `src/config.js`:

```js
import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  halilWhatsappNumber: process.env.HALIL_WHATSAPP_NUMBER,
  adminUsername: process.env.ADMIN_USERNAME || 'halil',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
};
```

- [ ] **Step 4: Add serverless auth export to middleware/auth.js**

Add a `checkAuth` function alongside the existing `requireAuth` (keep `requireAuth` for tests):

```js
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  } else {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Serverless auth check. Returns null on success (sets req.user), or sends 401 and returns true.
 */
export function checkAuth(req, res) {
  const header = req.headers.authorization;
  let token;

  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return true;
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return null;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return true;
  }
}
```

- [ ] **Step 5: Create api/_utils/auth.js**

Re-export for convenient imports from API functions:

```js
export { checkAuth } from '../../src/middleware/auth.js';
```

- [ ] **Step 6: Create api/_utils/handler.js**

Shared handler wrapper with error handling and method checking:

```js
/**
 * Wrap a serverless handler with error handling.
 * @param {Function} fn - async (req, res) => void
 */
export function withErrorHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
```

- [ ] **Step 7: Run tests to confirm nothing broke**

Run: `npx vitest run`
Expected: 36 passed, 30 skipped, 0 failed (same as before)

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/004-conversation-state.sql src/db/pool.js src/config.js src/middleware/auth.js api/_utils/
git commit -m "feat: database, config, and auth helpers for Vercel + Supabase"
```

---

### Task 3: Modify Core Services (bot, photoStorage, pdfReport)

**Files:**
- Modify: `src/services/bot.js`
- Modify: `src/services/photoStorage.js`
- Modify: `src/services/pdfReport.js`

- [ ] **Step 1: Rewrite bot.js — replace Map with DB state**

Replace `src/services/bot.js`:

```js
import { pool } from '../db/pool.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { notifyHalilPostponedTask } from './taskNotifications.js';
import { savePhotoFromTwilio } from './photoStorage.js';
import { postponeTask } from './taskScheduling.js';

// --- Conversation state helpers (DB-backed) ---

async function getState(phone) {
  const { rows } = await pool.query(
    'SELECT state FROM conversation_state WHERE phone_number = $1',
    [phone]
  );
  return rows[0]?.state || null;
}

async function setState(phone, state) {
  await pool.query(
    `INSERT INTO conversation_state (phone_number, state, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone_number) DO UPDATE SET state = $2, updated_at = NOW()`,
    [phone, state]
  );
}

async function clearState(phone) {
  await pool.query(
    'DELETE FROM conversation_state WHERE phone_number = $1',
    [phone]
  );
}

// --- Main handler ---

export async function handleIncomingMessage(phoneNumber, messageBody, media = {}) {
  const phone = phoneNumber.replace('whatsapp:', '');

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

  const state = await getState(phone);
  if (state === 'awaiting_sick_days') {
    return handleSickDayCount(worker, text);
  }

  // Handle photo state
  if (state && state.startsWith('awaiting_photo_')) {
    const taskId = parseInt(state.replace('awaiting_photo_', ''), 10);
    await clearState(phone);

    if (media && media.numMedia > 0 && media.mediaUrl) {
      const photoUrl = await savePhotoFromTwilio(media.mediaUrl, media.mediaContentType);
      await pool.query(
        'UPDATE task_assignments SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [photoUrl, taskId]
      );
      return { type: 'photo_saved', response: 'Foto gespeichert. Weiter zur naechsten Aufgabe!' };
    }

    if (text.toLowerCase() === 'weiter') {
      return { type: 'photo_skipped', response: 'OK, weiter zur naechsten Aufgabe.' };
    }

    return { type: 'photo_skipped', response: 'Kein Foto erkannt. Weiter zur naechsten Aufgabe.' };
  }

  // Handle postpone reason state
  if (state && state.startsWith('awaiting_postpone_reason_')) {
    return handlePostponeReason(worker, text);
  }

  const command = text.toLowerCase();

  if (command === 'einchecken') {
    return handleCheckIn(worker);
  }

  if (command === 'auschecken') {
    return handleCheckOut(worker);
  }

  if (command === 'krank melden') {
    await setState(phone, 'awaiting_sick_days');
    return {
      type: 'sick_prompt',
      response: 'Wie viele Tage wirst du krank sein?\n\n> 1\n> 2\n> 3\n> 4\n> 5\n> Mehr',
    };
  }

  if (command === 'erledigt') {
    return handleErledigt(worker);
  }

  if (command === 'nicht moeglich') {
    return handleNichtMoeglich(worker);
  }

  return {
    type: 'menu',
    response: 'Ich kann nur diese Aktionen ausfuehren:\n\n> Einchecken\n> Auschecken\n> Krank melden\n> Erledigt\n> Nicht moeglich\n\nFuer alles andere bitte direkt Halil kontaktieren.',
  };
}

async function handleCheckIn(worker) {
  const today = new Date().toISOString().split('T')[0];

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

async function handleErledigt(worker) {
  const today = new Date().toISOString().split('T')[0];

  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];

  await pool.query(
    `UPDATE task_assignments SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [task.id]
  );

  await setState(worker.phone_number, `awaiting_photo_${task.id}`);

  return {
    type: 'task_done',
    response: `${task.address}, ${task.city} als erledigt markiert.\nBitte sende ein Foto als Bestaetigung (oder "weiter" um zu ueberspringen).`,
  };
}

async function handleNichtMoeglich(worker) {
  const today = new Date().toISOString().split('T')[0];

  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];
  await setState(worker.phone_number, `awaiting_postpone_reason_${task.id}`);

  return {
    type: 'postpone_prompt',
    response: `Warum kann ${task.address} nicht erledigt werden?\n\n> Zugang nicht moeglich\n> Verantwortlicher nicht da\n> Material fehlt\n> Sonstiges`,
  };
}

async function handlePostponeReason(worker, reasonText) {
  const stateKey = await getState(worker.phone_number);
  const taskId = parseInt(stateKey.replace('awaiting_postpone_reason_', ''), 10);
  await clearState(worker.phone_number);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const task = await postponeTask(taskId, reasonText, tomorrowStr);
  await notifyHalilPostponedTask(task, reasonText);

  return {
    type: 'postponed',
    response: 'Aufgabe wurde verschoben. Halil wird benachrichtigt.',
  };
}

async function handleSickDayCount(worker, text) {
  await clearState(worker.phone_number);

  let days;
  if (text.toLowerCase() === 'mehr') {
    days = null;
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

  await notifyHalilSickDeclaration(worker.name, days);

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return {
    type: 'sick_recorded',
    response: `Krankmeldung fuer ${dayText} wurde erfasst. Halil wird benachrichtigt. Gute Besserung!`,
  };
}
```

- [ ] **Step 2: Rewrite photoStorage.js — use Supabase Storage**

Replace `src/services/photoStorage.js`:

```js
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let supabase;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

export async function savePhotoFromTwilio(mediaUrl, mediaContentType) {
  const ext = mediaContentType?.includes('png') ? 'png' : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `tasks/${filename}`;

  // Download from Twilio with Basic Auth
  const response = await fetch(mediaUrl, {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(
        `${config.twilio.accountSid}:${config.twilio.authToken}`
      ).toString('base64'),
    },
  });
  const buffer = Buffer.from(await response.arrayBuffer());

  // Upload to Supabase Storage
  const { error } = await getSupabase().storage
    .from('photos')
    .upload(storagePath, buffer, {
      contentType: mediaContentType || 'image/jpeg',
    });

  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  // Return public URL
  const { data: { publicUrl } } = getSupabase().storage
    .from('photos')
    .getPublicUrl(storagePath);

  return publicUrl;
}
```

- [ ] **Step 3: Rewrite pdfReport.js — use Supabase Storage + buffer**

Replace `src/services/pdfReport.js`:

```js
import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import {
  calculateDailyHours,
  calculateMonthlyHours,
  calculateMonthlyHarcirah,
  splitOfficialAndUnofficial,
} from './timeCalculation.js';

let supabase;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export async function generateMonthlyReport(month, year) {
  const workers = await pool.query(
    'SELECT * FROM workers WHERE is_active = true ORDER BY name'
  );

  const entries = await pool.query(
    `SELECT * FROM time_entries
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
     ORDER BY worker_id, date`,
    [month, year]
  );

  const sickLeaves = await pool.query(
    `SELECT * FROM sick_leave
     WHERE EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2`,
    [month, year]
  );

  const vacations = await pool.query(
    'SELECT * FROM vacation_balances WHERE year = $1',
    [year]
  );

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

  const filename = `Gehaltsbericht_${MONTH_NAMES[month - 1]}_${year}.pdf`;
  const storagePath = `reports/${filename}`;

  // Generate PDF to buffer
  const pdfBuffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold')
      .text('Bal Hausmeisterservice', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Pfaffenhofen an der Ilm', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold')
      .text(`Gehalt / Lohn Mitarbeiter — ${MONTH_NAMES[month - 1]} ${year}`, { align: 'center' });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

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

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#666')
      .text(`Erstellt am ${new Date().toLocaleDateString('de-DE')} — Bal Hausmeisterservice`, 50, 780, { align: 'center' });

    doc.end();
  });

  // Upload to Supabase Storage
  const { error } = await getSupabase().storage
    .from('photos')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw new Error(`Report upload failed: ${error.message}`);

  const { data: { publicUrl } } = getSupabase().storage
    .from('photos')
    .getPublicUrl(storagePath);

  // Save to database
  await pool.query(
    `INSERT INTO monthly_reports (month, year, generated_at, pdf_path, status)
     VALUES ($1, $2, NOW(), $3, 'draft')
     ON CONFLICT (month, year) DO UPDATE SET generated_at = NOW(), pdf_path = $3, status = 'draft'`,
    [month, year, publicUrl]
  );

  return { filepath: publicUrl, filename };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: 36 passed, 30 skipped, 0 failed

- [ ] **Step 5: Commit**

```bash
git add src/services/bot.js src/services/photoStorage.js src/services/pdfReport.js
git commit -m "feat: migrate bot state to DB, photos and reports to Supabase Storage"
```

---

### Task 4: Create Serverless API Functions — Auth, Workers, Properties

**Files:**
- Create: `api/auth/login.js`
- Create: `api/workers/index.js`
- Create: `api/workers/[id].js`
- Create: `api/properties/index.js`
- Create: `api/properties/[id].js`
- Create: `api/health.js`

- [ ] **Step 1: Create api/health.js**

```js
export default function handler(req, res) {
  res.json({ status: 'ok' });
}
```

- [ ] **Step 2: Create api/auth/login.js**

```js
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
```

- [ ] **Step 3: Create api/workers/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM workers WHERE is_active = true ORDER BY name'
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
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
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Phone number already exists' });
      throw err;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 4: Create api/workers/[id].js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await pool.query('SELECT * FROM workers WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'PUT') {
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
    values.push(id);

    const result = await pool.query(
      `UPDATE workers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'UPDATE workers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 5: Create api/properties/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { address, city, standard_tasks, assigned_weekday } = req.body;

    if (!address || !city) {
      return res.status(400).json({ error: 'address and city are required' });
    }

    const result = await pool.query(
      `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [address, city, standard_tasks || '', assigned_weekday ?? null]
    );
    return res.status(201).json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 6: Create api/properties/[id].js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'PUT') {
    const fields = ['address', 'city', 'standard_tasks', 'assigned_weekday'];
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
    values.push(id);

    const result = await pool.query(
      `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'UPDATE properties SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    return res.json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 7: Commit**

```bash
git add api/health.js api/auth/ api/workers/ api/properties/
git commit -m "feat: serverless functions for auth, workers, and properties"
```

---

### Task 5: Create Serverless API Functions — Time Entries, Sick Leave, Vacation, Reports

**Files:**
- Create: `api/time-entries/index.js`
- Create: `api/time-entries/flagged.js`
- Create: `api/time-entries/[id].js`
- Create: `api/sick-leave/index.js`
- Create: `api/sick-leave/[id].js`
- Create: `api/vacation/index.js`
- Create: `api/reports/index.js`
- Create: `api/reports/generate.js`
- Create: `api/reports/[id]/download.js`
- Create: `api/reports/[id]/index.js`

- [ ] **Step 1: Create api/time-entries/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
```

- [ ] **Step 2: Create api/time-entries/flagged.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query(`
    SELECT te.*, w.name AS worker_name
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE te.is_flagged = true AND te.resolved = false
    ORDER BY te.date DESC
  `);
  res.json(result.rows);
});
```

- [ ] **Step 3: Create api/time-entries/[id].js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
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
  values.push(id);

  const result = await pool.query(
    `UPDATE time_entries SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(result.rows[0]);
});
```

- [ ] **Step 4: Create api/sick-leave/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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
```

- [ ] **Step 5: Create api/sick-leave/[id].js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { adjustSickLeave } from '../../src/services/sickLeave.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const result = await adjustSickLeave(parseInt(req.query.id), req.body);
  res.json(result);
});
```

- [ ] **Step 6: Create api/vacation/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { getVacationBalance, ensureVacationBalance } from '../../src/services/vacation.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
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
    return res.json(balances);
  }

  if (req.method === 'POST') {
    const { worker_id, year, entitlement_days } = req.body;
    await ensureVacationBalance(worker_id, year, entitlement_days);
    const balance = await getVacationBalance(worker_id, year);
    return res.status(201).json(balance);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 7: Create api/reports/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('SELECT * FROM monthly_reports ORDER BY year DESC, month DESC');
  res.json(result.rows);
});
```

- [ ] **Step 8: Create api/reports/generate.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { generateMonthlyReport } from '../../src/services/pdfReport.js';
import { notifyHalilReportReady } from '../../src/services/notifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const report = await generateMonthlyReport(parseInt(month), parseInt(year));
  await notifyHalilReportReady(parseInt(month), parseInt(year));
  res.json({ message: 'Report generated', filename: report.filename });
});
```

- [ ] **Step 9: Create api/reports/[id]/download.js**

Since reports are now Supabase URLs, redirect to the URL:

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('SELECT * FROM monthly_reports WHERE id = $1', [req.query.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

  const report = result.rows[0];
  if (!report.pdf_path) return res.status(404).json({ error: 'PDF not generated yet' });

  // pdf_path is now a Supabase public URL — redirect to it
  res.redirect(report.pdf_path);
});
```

- [ ] **Step 10: Create api/reports/[id]/index.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { status } = req.body;
  if (!['draft', 'reviewed', 'sent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = await pool.query(
    'UPDATE monthly_reports SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.query.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
  res.json(result.rows[0]);
});
```

- [ ] **Step 11: Commit**

```bash
git add api/time-entries/ api/sick-leave/ api/vacation/ api/reports/
git commit -m "feat: serverless functions for time entries, sick leave, vacation, reports"
```

---

### Task 6: Create Serverless API Functions — Teams, Tasks, Extra Jobs

**Files:**
- Create: `api/teams/index.js`
- Create: `api/teams/[id]/members.js`
- Create: `api/teams/[id]/index.js`
- Create: `api/tasks/daily.js`
- Create: `api/tasks/generate.js`
- Create: `api/tasks/carryover.js`
- Create: `api/tasks/[id]/assign.js`
- Create: `api/tasks/[id]/status.js`
- Create: `api/tasks/[id]/postpone.js`
- Create: `api/tasks/[id]/reassign.js`
- Create: `api/extra-jobs/index.js`
- Create: `api/extra-jobs/[id]/index.js`
- Create: `api/extra-jobs/[id]/photos.js`

- [ ] **Step 1: Create api/teams/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query parameter is required' });

    const result = await pool.query(
      `SELECT t.id, t.date, t.name, t.created_at,
         COALESCE(json_agg(
           json_build_object('id', w.id, 'name', w.name)
         ) FILTER (WHERE w.id IS NOT NULL), '[]') AS members
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN workers w ON w.id = tm.worker_id
       WHERE t.date = $1
       GROUP BY t.id
       ORDER BY t.name`,
      [date]
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { date, name, member_ids } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const teamResult = await client.query(
        'INSERT INTO teams (date, name) VALUES ($1, $2) RETURNING *',
        [date, name || null]
      );
      const team = teamResult.rows[0];

      if (member_ids && member_ids.length > 0) {
        const placeholders = member_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO team_members (team_id, worker_id) VALUES ${placeholders}`,
          [team.id, ...member_ids]
        );
      }

      await client.query('COMMIT');

      const result = await pool.query(
        `SELECT t.id, t.date, t.name, t.created_at,
           COALESCE(json_agg(
             json_build_object('id', w.id, 'name', w.name)
           ) FILTER (WHERE w.id IS NOT NULL), '[]') AS members
         FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id
         LEFT JOIN workers w ON w.id = tm.worker_id
         WHERE t.id = $1
         GROUP BY t.id`,
        [team.id]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 2: Create api/teams/[id]/index.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING *', [req.query.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
  res.json(result.rows[0]);
});
```

- [ ] **Step 3: Create api/teams/[id]/members.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { member_ids } = req.body;
  if (!Array.isArray(member_ids)) {
    return res.status(400).json({ error: 'member_ids array is required' });
  }

  const teamId = req.query.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamCheck = await client.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found' });
    }

    await client.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);

    if (member_ids.length > 0) {
      const placeholders = member_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO team_members (team_id, worker_id) VALUES ${placeholders}`,
        [teamId, ...member_ids]
      );
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT t.id, t.date, t.name, t.created_at,
         COALESCE(json_agg(
           json_build_object('id', w.id, 'name', w.name)
         ) FILTER (WHERE w.id IS NOT NULL), '[]') AS members
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN workers w ON w.id = tm.worker_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [teamId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Create api/tasks/daily.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { getDailyOverview } from '../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date query parameter is required' });
  const tasks = await getDailyOverview(date);
  res.json(tasks);
});
```

- [ ] **Step 5: Create api/tasks/generate.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { generateDailyTasks } from '../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });
  const created = await generateDailyTasks(date);
  res.status(201).json(created);
});
```

- [ ] **Step 6: Create api/tasks/carryover.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { carryOverTasks } from '../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from_date, to_date } = req.body;
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date are required' });
  }
  const carried = await carryOverTasks(from_date, to_date);
  res.status(201).json(carried);
});
```

- [ ] **Step 7: Create api/tasks/[id]/assign.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { notifyTeamTaskUpdate } from '../../../src/services/taskNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  const result = await pool.query(
    `UPDATE task_assignments SET team_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [team_id, req.query.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

  const task = result.rows[0];
  await notifyTeamTaskUpdate(team_id, task, 'assigned');
  res.json(task);
});
```

- [ ] **Step 8: Create api/tasks/[id]/status.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'postponed'];

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { status, photo_url } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [status];
  let paramIndex = 2;

  if (status === 'done') {
    updates.push(`completed_at = NOW()`);
  }

  if (photo_url) {
    updates.push(`photo_url = $${paramIndex}`);
    values.push(photo_url);
    paramIndex++;
  }

  values.push(req.query.id);

  const result = await pool.query(
    `UPDATE task_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(result.rows[0]);
});
```

- [ ] **Step 9: Create api/tasks/[id]/postpone.js**

```js
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { postponeTask } from '../../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { reason, new_date } = req.body;
  if (!reason || !new_date) {
    return res.status(400).json({ error: 'reason and new_date are required' });
  }
  const task = await postponeTask(req.query.id, reason, new_date);
  res.json(task);
});
```

- [ ] **Step 10: Create api/tasks/[id]/reassign.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { notifyTeamTaskUpdate } from '../../../src/services/taskNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  const current = await pool.query(
    'SELECT * FROM task_assignments WHERE id = $1',
    [req.query.id]
  );

  if (current.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

  const task = current.rows[0];
  const oldTeamId = task.team_id;

  const result = await pool.query(
    `UPDATE task_assignments SET team_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [team_id, req.query.id]
  );

  const updatedTask = result.rows[0];

  if (oldTeamId) {
    await notifyTeamTaskUpdate(oldTeamId, task, 'removed');
  }
  await notifyTeamTaskUpdate(team_id, updatedTask, 'assigned');

  res.json(updatedTask);
});
```

- [ ] **Step 11: Create api/extra-jobs/index.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { notifyTeamNewExtraJob } from '../../src/services/taskNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { date } = req.query;
    let query = `
      SELECT ej.*, t.name AS team_name,
        (SELECT json_agg(json_build_object('worker_id', tm.worker_id, 'name', w.name))
         FROM team_members tm
         JOIN workers w ON w.id = tm.worker_id
         WHERE tm.team_id = t.id) AS team_members
      FROM extra_jobs ej
      LEFT JOIN teams t ON t.id = ej.team_id
    `;
    const values = [];

    if (date) {
      query += ' WHERE ej.date = $1';
      values.push(date);
    }

    query += ' ORDER BY ej.date DESC, ej.id DESC';

    const result = await pool.query(query, values);
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { description, address, team_id, date } = req.body;
    if (!description || !address || !team_id || !date) {
      return res.status(400).json({ error: 'description, address, team_id, and date are required' });
    }

    const result = await pool.query(
      `INSERT INTO extra_jobs (description, address, team_id, date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [description, address, team_id, date]
    );

    const job = result.rows[0];
    await notifyTeamNewExtraJob(team_id, job);
    return res.status(201).json(job);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 12: Create api/extra-jobs/[id]/index.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'PUT') {
    const fields = ['description', 'address', 'team_id', 'date', 'time_in', 'time_out', 'status'];
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

    updates.push('updated_at = NOW()');
    values.push(req.query.id);

    const result = await pool.query(
      `UPDATE extra_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'DELETE FROM extra_jobs WHERE id = $1 RETURNING *',
      [req.query.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    return res.json({ message: 'Extra job deleted', job: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 13: Create api/extra-jobs/[id]/photos.js**

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { photo_url } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url is required' });

  const result = await pool.query(
    `UPDATE extra_jobs SET photo_urls = array_append(photo_urls, $1), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [photo_url, req.query.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
  res.json(result.rows[0]);
});
```

- [ ] **Step 14: Commit**

```bash
git add api/teams/ api/tasks/ api/extra-jobs/
git commit -m "feat: serverless functions for teams, tasks, and extra jobs"
```

---

### Task 7: Create Serverless API Functions — Garbage, Webhook, Cron

**Files:**
- Create: `api/garbage/upload.js`
- Create: `api/garbage/map.js`
- Create: `api/garbage/summary.js`
- Create: `api/garbage/generate.js`
- Create: `api/garbage/upcoming.js`
- Create: `api/garbage/schedule/[propertyId].js`
- Create: `api/webhook.js`
- Create: `api/cron/nightly.js`
- Create: `api/cron/morning.js`

- [ ] **Step 1: Create api/garbage/upload.js**

```js
import { readFile } from 'fs/promises';
import formidable from 'formidable';
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { parseAwpPdf, extractAddressFromPdf } from '../../src/services/awpParser.js';
import { importScheduleFromPdf } from '../../src/services/garbageScheduling.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    if (checkAuth(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
    const [fields, files] = await form.parse(req);

    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const year = parseInt(fields.year?.[0], 10);
    if (!year) {
      return res.status(400).json({ error: 'year is required' });
    }

    const pdfBuffer = await readFile(pdfFile.filepath);
    const dates = await parseAwpPdf(pdfBuffer, year);

    if (dates.length === 0) {
      return res.status(422).json({ error: 'No collection dates found in PDF' });
    }

    const sourcePdf = pdfFile.originalFilename || pdfFile.newFilename;

    // If property_id provided, import directly
    const propertyIdStr = fields.property_id?.[0];
    if (propertyIdStr) {
      const propertyId = parseInt(propertyIdStr, 10);
      await importScheduleFromPdf(propertyId, dates, sourcePdf);
      return res.json({ imported: true, property_id: propertyId, dates_count: dates.length });
    }

    // Try auto-match by extracted address
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(pdfBuffer);
    const extractedAddress = extractAddressFromPdf(pdfData.text);

    if (extractedAddress) {
      const { rows } = await pool.query(
        `SELECT id, address, city FROM properties WHERE address ILIKE $1 LIMIT 1`,
        [`%${extractedAddress}%`]
      );

      if (rows.length > 0) {
        const property = rows[0];
        await importScheduleFromPdf(property.id, dates, sourcePdf);
        return res.json({
          imported: true,
          property_id: property.id,
          property_address: property.address,
          dates_count: dates.length,
          auto_matched: true,
        });
      }
    }

    // No match — return needs_mapping
    return res.json({
      needs_mapping: true,
      extracted_address: extractedAddress,
      dates_preview: dates.slice(0, 10),
      total_dates: dates.length,
      source_pdf: sourcePdf,
      dates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Create api/garbage/map.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { importScheduleFromPdf } from '../../src/services/garbageScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { property_id, dates, source_pdf } = req.body;

  if (!property_id || !dates || !source_pdf) {
    return res.status(400).json({ error: 'property_id, dates, and source_pdf are required' });
  }

  await importScheduleFromPdf(property_id, dates, source_pdf);
  res.json({ imported: true, property_id, dates_count: dates.length });
});
```

- [ ] **Step 3: Create api/garbage/summary.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { rows } = await pool.query(
    `SELECT
       gs.property_id,
       p.address,
       p.city,
       COUNT(*)::int AS total_dates,
       array_agg(DISTINCT gs.trash_type) AS trash_types,
       MIN(gs.collection_date) AS earliest_date,
       MAX(gs.collection_date) AS latest_date,
       array_agg(DISTINCT gs.source_pdf) AS source_pdfs
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     GROUP BY gs.property_id, p.address, p.city
     ORDER BY p.address`
  );
  res.json(rows);
});
```

- [ ] **Step 4: Create api/garbage/generate.js**

```js
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { generateGarbageTasks } from '../../src/services/garbageScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
  }
  const tasks = await generateGarbageTasks(date);
  res.json({ generated: true, date, tasks });
});
```

- [ ] **Step 5: Create api/garbage/upcoming.js**

```js
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const days = parseInt(req.query.days, 10) || 7;
  const { rows } = await pool.query(
    `SELECT gs.*, p.address, p.city
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date >= CURRENT_DATE
       AND gs.collection_date < CURRENT_DATE + $1 * INTERVAL '1 day'
     ORDER BY gs.collection_date, p.address`,
    [days]
  );
  res.json(rows);
});
```

- [ ] **Step 6: Create api/garbage/schedule/[propertyId].js**

```js
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import {
  getScheduleForProperty,
  deleteScheduleForProperty,
} from '../../../src/services/garbageScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const propertyId = parseInt(req.query.propertyId, 10);

  if (req.method === 'GET') {
    const schedule = await getScheduleForProperty(propertyId);
    return res.json(schedule);
  }

  if (req.method === 'DELETE') {
    await deleteScheduleForProperty(propertyId);
    return res.json({ deleted: true, property_id: propertyId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 7: Create api/webhook.js**

```js
import twilio from 'twilio';
import { config } from '../src/config.js';
import { handleIncomingMessage } from '../src/services/bot.js';
import { sendWhatsAppMessage } from '../src/services/whatsapp.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    // Validate Twilio signature
    if (process.env.NODE_ENV !== 'test' && config.twilioAuthToken) {
      const signature = req.headers['x-twilio-signature'];
      const url = `https://${req.headers.host}/api/webhook`;

      if (!twilio.validateRequest(config.twilioAuthToken, signature, url, req.body)) {
        return res.status(403).send('Invalid Twilio signature');
      }
    }

    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    if (!From) {
      return res.status(400).send('Missing From');
    }

    const result = await handleIncomingMessage(From, Body || '', {
      numMedia: parseInt(NumMedia || '0', 10),
      mediaUrl: MediaUrl0,
      mediaContentType: MediaContentType0,
    });
    await sendWhatsAppMessage(From, result.response);
    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
}
```

- [ ] **Step 8: Create api/cron/nightly.js**

```js
import { pool } from '../../src/db/pool.js';
import { detectMissingCheckouts, flagMissingCheckout } from '../../src/services/anomaly.js';
import { sendWhatsAppMessage } from '../../src/services/whatsapp.js';
import { config } from '../../src/config.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Flag missing checkouts
    const missing = await detectMissingCheckouts(yesterday);
    for (const entry of missing) {
      await flagMissingCheckout(entry.id);
    }

    // Notify Halil
    if (missing.length > 0) {
      const names = missing.map(e => e.worker_name).join(', ');
      await sendWhatsAppMessage(
        config.halilWhatsappNumber,
        `${missing.length} fehlende Auschecken gestern: ${names}. Bitte im Dashboard korrigieren.`
      );
    }

    // Clean up stale conversation states (older than 24 hours)
    await pool.query(
      `DELETE FROM conversation_state WHERE updated_at < NOW() - INTERVAL '24 hours'`
    );

    res.json({ ok: true, flagged: missing.length });
  } catch (err) {
    console.error('Nightly cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
```

- [ ] **Step 9: Create api/cron/morning.js**

```js
import { carryOverTasks, generateDailyTasks } from '../../src/services/taskScheduling.js';
import { sendDailyTaskLists } from '../../src/services/taskNotifications.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Carry over unfinished tasks
    await carryOverTasks(yesterday, today);

    // Generate daily tasks (includes garbage tasks)
    await generateDailyTasks(today);

    // Send task lists to workers
    await sendDailyTaskLists(today);

    res.json({ ok: true, date: today });
  } catch (err) {
    console.error('Morning cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add api/garbage/ api/webhook.js api/cron/
git commit -m "feat: serverless functions for garbage, webhook, and cron endpoints"
```

---

### Task 8: Clean Up Old Files + Update Tests

**Files:**
- Delete: `src/app.js`
- Delete: `src/index.js`
- Delete: `src/services/scheduler.js`
- Delete: `src/routes/auth.js`
- Delete: `src/routes/workers.js`
- Delete: `src/routes/timeEntries.js`
- Delete: `src/routes/sickLeave.js`
- Delete: `src/routes/vacation.js`
- Delete: `src/routes/reports.js`
- Delete: `src/routes/properties.js`
- Delete: `src/routes/teams.js`
- Delete: `src/routes/tasks.js`
- Delete: `src/routes/extraJobs.js`
- Delete: `src/routes/garbage.js`
- Delete: `src/routes/webhook.js`
- Modify: `tests/helpers.js`
- Delete: `tests/routes/workers.test.js`
- Delete: `tests/routes/properties.test.js`

- [ ] **Step 1: Delete old Express files**

```bash
rm src/app.js src/index.js src/services/scheduler.js
rm src/routes/auth.js src/routes/workers.js src/routes/timeEntries.js
rm src/routes/sickLeave.js src/routes/vacation.js src/routes/reports.js
rm src/routes/properties.js src/routes/teams.js src/routes/tasks.js
rm src/routes/extraJobs.js src/routes/garbage.js src/routes/webhook.js
rmdir src/routes
```

- [ ] **Step 2: Delete Express route tests (they tested Express app, not serverless)**

```bash
rm tests/routes/workers.test.js tests/routes/properties.test.js
rmdir tests/routes
```

- [ ] **Step 3: Update tests/helpers.js — add missing tables to cleanDb**

```js
import { describe } from 'vitest';
import { pool } from '../src/db/pool.js';
import { dbAvailable } from './setup.js';

export const describeWithDb = dbAvailable
  ? describe
  : describe.skip;

export async function cleanDb() {
  await pool.query(`
    DELETE FROM garbage_tasks;
    DELETE FROM garbage_schedules;
    DELETE FROM conversation_state;
    DELETE FROM task_assignments;
    DELETE FROM extra_jobs;
    DELETE FROM team_members;
    DELETE FROM teams;
    DELETE FROM properties;
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

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: All pure-function tests pass (timeCalculation, awpParser, vacation, taskScheduling, garbageScheduling). DB-dependent tests skipped. Route tests removed. No failures.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Express files and update test helpers for Vercel migration"
```

---

### Task 9: Create .env.example + Final Verification

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```
# Database — Supabase PostgreSQL connection string
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECTID.supabase.co:5432/postgres

# Supabase — for Storage (photos, reports)
SUPABASE_URL=https://PROJECTID.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Auth
JWT_SECRET=your-jwt-secret-here
ADMIN_USERNAME=halil
ADMIN_PASSWORD_HASH=$2b$10$...

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
HALIL_WHATSAPP_NUMBER=whatsapp:+49...
```

- [ ] **Step 2: Run all tests one final time**

Run: `npx vitest run`
Expected: All pure-function tests pass, DB tests skip, 0 failures.

- [ ] **Step 3: Verify file structure**

Run: `ls api/` and verify all expected files exist:
- `_utils/auth.js`, `_utils/handler.js`
- `auth/login.js`
- `workers/index.js`, `workers/[id].js`
- `properties/index.js`, `properties/[id].js`
- `time-entries/index.js`, `time-entries/flagged.js`, `time-entries/[id].js`
- `sick-leave/index.js`, `sick-leave/[id].js`
- `vacation/index.js`
- `reports/index.js`, `reports/generate.js`, `reports/[id]/download.js`, `reports/[id]/index.js`
- `teams/index.js`, `teams/[id]/index.js`, `teams/[id]/members.js`
- `tasks/daily.js`, `tasks/generate.js`, `tasks/carryover.js`, `tasks/[id]/assign.js`, `tasks/[id]/status.js`, `tasks/[id]/postpone.js`, `tasks/[id]/reassign.js`
- `extra-jobs/index.js`, `extra-jobs/[id]/index.js`, `extra-jobs/[id]/photos.js`
- `garbage/upload.js`, `garbage/map.js`, `garbage/summary.js`, `garbage/generate.js`, `garbage/upcoming.js`, `garbage/schedule/[propertyId].js`
- `webhook.js`
- `cron/nightly.js`, `cron/morning.js`
- `health.js`

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example for Vercel + Supabase deployment"
```

---

### Task 10: Supabase Setup + Deploy to Vercel

This task is manual (not code):

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com → New project → Region: Frankfurt (eu-central-1) → Generate password.

- [ ] **Step 2: Run migrations on Supabase**

Copy the Supabase connection string, set it as `DATABASE_URL` in `.env`, then run:

```bash
npm run migrate
```

Expected: All 4 migrations run successfully.

- [ ] **Step 3: Create Supabase Storage bucket**

In Supabase dashboard → Storage → New bucket:
- Name: `photos`
- Public: Yes

- [ ] **Step 4: Connect Vercel to GitHub**

Go to https://vercel.com → New project → Import `kara61/bal-hausmeisterservice` → Framework: Other.

- [ ] **Step 5: Set environment variables in Vercel**

Add all variables from `.env.example` in Vercel project settings → Environment Variables.

- [ ] **Step 6: Deploy**

Push to GitHub triggers auto-deploy. Verify:
- Frontend loads at `https://your-project.vercel.app`
- API health check: `https://your-project.vercel.app/api/health` returns `{"status":"ok"}`
- Login works
- Dashboard loads data

- [ ] **Step 7: Update Twilio webhook**

In Twilio console, update the WhatsApp webhook URL to:
`https://your-project.vercel.app/api/webhook`

- [ ] **Step 8: Commit + push**

```bash
git push
```
