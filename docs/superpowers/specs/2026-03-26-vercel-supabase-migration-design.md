# Vercel + Supabase Migration Design

## Overview

Migrate the Bal Hausmeisterservice system from a self-hosted Node.js + Express + PostgreSQL architecture (Hetzner VPS) to Vercel (frontend + serverless API) + Supabase (PostgreSQL + Storage). All business logic, SQL queries, and React frontend code remain unchanged. Only the infrastructure and routing layers change.

**Goal:** Zero user-facing changes. Workers and Halil experience the same WhatsApp flows and admin dashboard.

## Architecture

```
Workers (WhatsApp) <-> Twilio <-> Vercel Serverless (/api/webhook)
                                        |
Admin (React PWA) <-> Vercel Static <-> Vercel Serverless (/api/*)
                                        |
                                   Supabase PostgreSQL (all existing tables)
                                   Supabase Storage (photos bucket)
```

**Deployment:** Single Vercel monorepo project containing:
- Vite React frontend (client/) — deployed as static site
- Serverless functions (api/) — deployed as Vercel Functions
- Shared services (src/) — imported by serverless functions

**Free tier limits (more than sufficient):**
- Serverless: 100GB-hrs/month, 10s timeout
- Cron: 2 jobs per project
- Bandwidth: 100GB/month
- Supabase: 500MB database, 1GB storage, unlimited API requests

## What Changes

### 1. Express Routes -> Vercel Serverless Functions

Each Express route file becomes one or more serverless functions under `api/`. The file path determines the URL:

| Express Route | Serverless Function | URL |
|--------------|-------------------|-----|
| `src/routes/auth.js` | `api/auth/login.js` | POST /api/auth/login |
| `src/routes/workers.js` | `api/workers/index.js` | GET, POST /api/workers |
| `src/routes/workers.js` | `api/workers/[id].js` | GET, PUT, DELETE /api/workers/:id |
| `src/routes/timeEntries.js` | `api/time-entries/index.js` | GET /api/time-entries |
| `src/routes/sickLeave.js` | `api/sick-leave/index.js` | GET, POST /api/sick-leave |
| `src/routes/sickLeave.js` | `api/sick-leave/[id]/adjust.js` | PUT /api/sick-leave/:id/adjust |
| `src/routes/vacation.js` | `api/vacation/index.js` | GET, POST /api/vacation |
| `src/routes/reports.js` | `api/reports/[...path].js` | GET /api/reports/* |
| `src/routes/properties.js` | `api/properties/index.js` | GET, POST /api/properties |
| `src/routes/properties.js` | `api/properties/[id].js` | GET, PUT, DELETE /api/properties/:id |
| `src/routes/teams.js` | `api/teams/index.js` | GET, POST /api/teams |
| `src/routes/teams.js` | `api/teams/[id]/members.js` | PUT /api/teams/:id/members |
| `src/routes/teams.js` | `api/teams/[id].js` | DELETE /api/teams/:id |
| `src/routes/tasks.js` | `api/tasks/daily.js` | GET /api/tasks/daily |
| `src/routes/tasks.js` | `api/tasks/generate.js` | POST /api/tasks/generate |
| `src/routes/tasks.js` | `api/tasks/carryover.js` | POST /api/tasks/carryover |
| `src/routes/tasks.js` | `api/tasks/[id]/status.js` | PUT /api/tasks/:id/status |
| `src/routes/tasks.js` | `api/tasks/[id]/assign.js` | PUT /api/tasks/:id/assign |
| `src/routes/tasks.js` | `api/tasks/[id]/postpone.js` | PUT /api/tasks/:id/postpone |
| `src/routes/tasks.js` | `api/tasks/[id]/reassign.js` | PUT /api/tasks/:id/reassign |
| `src/routes/extraJobs.js` | `api/extra-jobs/index.js` | GET, POST /api/extra-jobs |
| `src/routes/extraJobs.js` | `api/extra-jobs/[id]/index.js` | PUT /api/extra-jobs/:id |
| `src/routes/extraJobs.js` | `api/extra-jobs/[id]/photos.js` | POST /api/extra-jobs/:id/photos |
| `src/routes/garbage.js` | `api/garbage/upload.js` | POST /api/garbage/upload |
| `src/routes/garbage.js` | `api/garbage/map.js` | POST /api/garbage/map |
| `src/routes/garbage.js` | `api/garbage/summary.js` | GET /api/garbage/summary |
| `src/routes/garbage.js` | `api/garbage/generate.js` | POST /api/garbage/generate |
| `src/routes/garbage.js` | `api/garbage/upcoming.js` | GET /api/garbage/upcoming |
| `src/routes/garbage.js` | `api/garbage/schedule/[propertyId].js` | GET, DELETE /api/garbage/schedule/:propertyId |
| `src/routes/webhook.js` | `api/webhook.js` | POST /api/webhook |
| (new) | `api/cron/nightly.js` | Vercel Cron |
| (new) | `api/cron/morning.js` | Vercel Cron |

**Serverless function pattern:**

```js
import { pool } from '../../src/db/pool.js';
import { requireAuth } from '../../src/middleware/auth.js';

export default async function handler(req, res) {
  const authError = requireAuth(req);
  if (authError) return res.status(401).json({ error: authError });

  if (req.method === 'GET') {
    // ... query logic (same SQL as before)
    return res.json(rows);
  }
  if (req.method === 'POST') {
    // ... insert logic
    return res.json(result);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
```

**Auth middleware adaptation:** `requireAuth` changes from Express middleware (`next()` pattern) to a function that returns `null` on success (setting `req.user`) or an error string on failure. Same JWT verification logic.

**Public endpoints** (no auth): `api/auth/login.js`, `api/webhook.js`

### 2. Cron Jobs: node-cron -> Vercel Cron

4 cron jobs consolidated into 2 (Vercel free tier limit):

**`api/cron/nightly.js`** (runs at midnight):
- Flag missing checkouts from today
- Notify Halil via WhatsApp with list of flagged workers
- Clean up stale conversation states (older than 24 hours)

**`api/cron/morning.js`** (runs at 5:00 AM):
- Carry over unfinished tasks from yesterday
- Generate daily tasks for today (including garbage tasks)
- Send daily task lists to all assigned workers via WhatsApp

**Dropped:** The 3-11 PM weekday missing checkout reminder. Workers get flagged at midnight instead. Accepted trade-off.

**vercel.json cron configuration:**

```json
{
  "crons": [
    { "path": "/api/cron/nightly", "schedule": "0 0 * * *" },
    { "path": "/api/cron/morning", "schedule": "0 5 * * *" }
  ]
}
```

**Security:** Cron endpoints verify `req.headers.authorization === Bearer ${process.env.CRON_SECRET}`. Vercel injects this automatically.

### 3. Bot Conversation State: In-Memory Map -> Supabase Table

New table:

```sql
CREATE TABLE IF NOT EXISTS conversation_state (
  phone_number VARCHAR(20) PRIMARY KEY,
  state VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Replace `Map` operations in `bot.js` with three helper functions:

```js
async function getState(phone) {
  const { rows } = await pool.query(
    'SELECT state FROM conversation_state WHERE phone_number = $1', [phone]
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
    'DELETE FROM conversation_state WHERE phone_number = $1', [phone]
  );
}
```

State values remain: `awaiting_sick_days`, `awaiting_photo_<taskId>`, `awaiting_postpone_reason_<taskId>`.

Stale state cleanup runs in the nightly cron (delete rows where `updated_at < NOW() - INTERVAL '24 hours'`).

### 4. Photo Storage: Disk -> Supabase Storage

One Supabase Storage bucket: `photos` (public).

**photoStorage.js changes:**

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function savePhotoFromTwilio(mediaUrl, filename) {
  // Download from Twilio with Basic Auth (same as before)
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        `${config.twilio.accountSid}:${config.twilio.authToken}`
      ).toString('base64'),
    },
  });
  const buffer = await response.arrayBuffer();

  // Upload to Supabase Storage
  await supabase.storage
    .from('photos')
    .upload(`tasks/${filename}`, buffer, { contentType: 'image/jpeg' });

  // Return public URL
  const { data: { publicUrl } } = supabase.storage
    .from('photos')
    .getPublicUrl(`tasks/${filename}`);

  return publicUrl;
}
```

The `photo_url` column in `task_assignments` and `photo_urls` array in `extra_jobs` store full Supabase public URLs. Frontend renders them as-is (no code change needed).

### 5. AWP PDF Upload: Multer -> In-Memory Buffer

No file storage needed. Parse the PDF buffer directly in the serverless function:

```js
// api/garbage/upload.js
import { parseAwpPdf } from '../../src/services/awpParser.js';
import formidable from 'formidable';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  // Parse multipart form data
  const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
  const [fields, files] = await form.parse(req);

  const pdfFile = files.pdf?.[0];
  const pdfBuffer = await readFile(pdfFile.filepath);
  // Temp file auto-cleaned by Vercel

  const dates = await parseAwpPdf(pdfBuffer, parseInt(fields.year[0], 10));
  // ... same import logic as before
}
```

### 6. Database Connection

**pool.js** stays almost identical. Just uses Supabase's connection string:

```js
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

Only addition: `ssl: { rejectUnauthorized: false }` for Supabase's SSL requirement.

All existing SQL queries, transactions, ON CONFLICT clauses, json_agg aggregations work unchanged.

### 7. Configuration Changes

**New environment variables (Vercel):**
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `SUPABASE_URL` — Supabase project URL (for Storage)
- `SUPABASE_SERVICE_KEY` — Supabase service role key (for Storage)
- `CRON_SECRET` — Auto-injected by Vercel for cron auth
- `JWT_SECRET` — Same as before
- `TWILIO_ACCOUNT_SID` — Same
- `TWILIO_AUTH_TOKEN` — Same
- `TWILIO_WHATSAPP_NUMBER` — Same
- `HALIL_WHATSAPP_NUMBER` — Same
- `ADMIN_USERNAME` — Same
- `ADMIN_PASSWORD_HASH` — Same

**Removed:** `PORT` (Vercel manages this), `MISSING_CHECKOUT_REMINDER_HOURS` (reminder dropped).

### 8. vercel.json

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

### 9. Frontend Changes

**None.** The React frontend stays exactly as-is:
- `client/src/api/client.js` already calls `/api/*` paths (same paths on Vercel)
- All pages, components, routing unchanged
- Auth context unchanged
- Vite build unchanged

The only removal is the proxy config in `client/vite.config.js` (no longer needed — Vercel serves both frontend and API from the same domain).

### 10. Package Changes

**Root package.json:**
- Remove: `express`, `cors`, `helmet`, `multer`, `node-cron`
- Add: `@supabase/supabase-js`, `formidable`
- Keep: `pg`, `dotenv`, `twilio`, `bcrypt`, `jsonwebtoken`, `pdf-parse`, `pdfkit`

**Scripts:**
- Remove: `dev`, `start` (no Express server)
- Add: `vercel dev` for local development
- Keep: `test`, `migrate`

### 11. Files to Delete

- `src/app.js` — Express app setup (replaced by serverless functions)
- `src/index.js` — Server entry point (no server)
- `src/services/scheduler.js` — Cron orchestrator (replaced by Vercel Cron)
- `src/routes/*.js` — All Express route files (logic moves to `api/`)

### 12. Files to Keep Unchanged

- `src/services/timeCalculation.js`
- `src/services/vacation.js`
- `src/services/sickLeave.js`
- `src/services/anomaly.js`
- `src/services/awpParser.js`
- `src/services/garbageScheduling.js`
- `src/services/taskScheduling.js`
- `src/services/taskNotifications.js`
- `src/services/notifications.js`
- `src/services/whatsapp.js`
- `src/services/pdfReport.js`
- `src/db/migrations/*.sql`
- `src/db/migrate.js`
- `client/src/**/*` (entire frontend)
- `tests/services/*.test.js` (pure function tests)

### 13. Testing

- Pure function tests (timeCalculation, awpParser, vacation, taskScheduling, garbageScheduling) — unchanged, still run with vitest
- DB-dependent tests — still skip when no DB available, run against Supabase when configured
- Route tests (workers, properties) — rewrite to test serverless function handlers instead of Express app
- Bot test — update to mock DB state functions instead of Map

### 14. Migration Steps (High-Level)

1. Create Supabase project, run migrations, create storage bucket
2. Set up Vercel project linked to GitHub repo
3. Create `api/` serverless functions (translate Express routes)
4. Modify `pool.js` (add SSL), `config.js` (new env vars)
5. Modify `bot.js` (Map -> DB state functions)
6. Modify `photoStorage.js` (disk -> Supabase Storage)
7. Create `vercel.json` with cron config
8. Create cron endpoint functions
9. Add `@supabase/supabase-js` and `formidable` dependencies
10. Remove Express-specific packages
11. Update `api/client.js` (remove proxy config from vite)
12. Configure environment variables in Vercel dashboard
13. Set Twilio webhook URL to Vercel domain
14. Deploy and verify
