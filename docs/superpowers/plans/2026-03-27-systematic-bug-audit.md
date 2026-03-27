# Systematic Bug Audit & Automated Testing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and fix bugs across the entire Bal Hausmeisterservice system through automated code audit, API smoke tests, and targeted test creation.

**Architecture:** Phase 1 sets up test infrastructure (Docker test DB, configs). Phase 2 dispatches 6 parallel code audit subagents across all domains. Phase 3 builds API smoke tests. Phase 4 compiles findings into a bug report for triage. Phase 5 writes targeted tests for confirmed bugs. Phase 6 adds E2E tests and CI pipeline.

**Tech Stack:** Vitest 4.x, Playwright, Docker PostgreSQL 16, GitHub Actions

---

## Task 1: Docker Test Database

**Files:**
- Modify: `docker-compose.yml`
- Create: `scripts/init-test-db.sh`

- [ ] **Step 1: Add test database service to docker-compose.yml**

Add a `db-test` service alongside the existing `db` service:

```yaml
  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bal_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5433:5432'
    volumes:
      - pgdata-test:/var/lib/postgresql/data
      - ./scripts/init-test-db.sh:/docker-entrypoint-initdb.d/init.sh
```

Add `pgdata-test:` under the `volumes:` section at the bottom.

- [ ] **Step 2: Create the init script that runs all migrations**

Create `scripts/init-test-db.sh`:

```bash
#!/bin/bash
set -e

# Concatenate all migrations and run them
for f in /migrations/*.sql; do
  echo "Running migration: $f"
  psql -U postgres -d bal_test -f "$f"
done
```

- [ ] **Step 3: Mount migrations into the container**

Add this volume mount to the `db-test` service in `docker-compose.yml`:

```yaml
      - ./src/db/migrations:/migrations:ro
```

The full `db-test` service should look like:

```yaml
  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: bal_test
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5433:5432'
    volumes:
      - pgdata-test:/var/lib/postgresql/data
      - ./scripts/init-test-db.sh:/docker-entrypoint-initdb.d/init.sh
      - ./src/db/migrations:/migrations:ro
```

- [ ] **Step 4: Start the test database and verify**

Run:
```bash
docker compose up db-test -d
```

Wait 5 seconds, then verify tables exist:
```bash
docker compose exec db-test psql -U postgres -d bal_test -c "\dt"
```

Expected: All tables from migrations (workers, properties, time_entries, etc.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml scripts/init-test-db.sh
git commit -m "infra: add isolated test database via Docker"
```

---

## Task 2: Test Environment Configuration

**Files:**
- Create: `.env.test`
- Modify: `vitest.config.js`
- Modify: `package.json`
- Modify: `tests/setup.js`
- Modify: `.gitignore`

- [ ] **Step 1: Create .env.test**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bal_test
JWT_SECRET=test-secret-do-not-use-in-production
ADMIN_USERNAME=halil
ADMIN_PASSWORD_HASH=$2b$10$testhashdoesnotmatterforunit
SUPABASE_URL=http://localhost:9999
SUPABASE_SERVICE_KEY=test-key
TWILIO_ACCOUNT_SID=ACtest
TWILIO_AUTH_TOKEN=test-token
TWILIO_WHATSAPP_NUMBER=+14155551234
HALIL_WHATSAPP_NUMBER=+4917699999999
```

- [ ] **Step 2: Update vitest.config.js with coverage and env file**

Replace the entire file:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
    env: { DOTENV_CONFIG_PATH: '.env.test' },
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'api/_handlers/**'],
      exclude: ['**/node_modules/**', 'tests/**'],
    },
  },
});
```

- [ ] **Step 3: Update tests/setup.js to load .env.test**

Add dotenv loading at the very top of the file, before the pool import:

```javascript
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.test' });

import { pool } from '../src/db/pool.js';
```

The rest of the file stays the same.

- [ ] **Step 4: Add test scripts to package.json**

Add these to the `"scripts"` section:

```json
"test:smoke": "vitest run tests/api/",
"test:coverage": "vitest run --coverage",
"test:all": "vitest run"
```

- [ ] **Step 5: Ensure .env.test is NOT in .gitignore**

`.env.test` contains no real secrets (test-only values), so it should be committed. Check `.gitignore` — if it has a pattern like `.env*`, add an exception:

```
!.env.test
```

- [ ] **Step 6: Verify existing tests still pass with new config**

Run:
```bash
npm run test
```

Expected: All 16 existing test files pass (or skip gracefully if DB is down).

- [ ] **Step 7: Commit**

```bash
git add .env.test vitest.config.js tests/setup.js package.json .gitignore
git commit -m "infra: add test environment config and coverage setup"
```

---

## Task 3: API Smoke Test Helpers

**Files:**
- Create: `tests/api/helpers.js`

- [ ] **Step 1: Create the API test helper with mock req/res**

Since the app uses a single serverless function (not an HTTP server), we test handlers directly by creating mock `req` and `res` objects:

```javascript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';

/**
 * Create a valid JWT token for testing authenticated endpoints.
 */
export function createTestToken(payload = { username: 'halil', role: 'admin' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Create a mock request object that mimics Vercel's serverless req.
 */
export function mockReq({
  method = 'GET',
  query = {},
  body = null,
  headers = {},
  params = {},
  authenticated = true,
} = {}) {
  const token = authenticated ? createTestToken() : null;
  return {
    method,
    query,
    body,
    params,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
}

/**
 * Create a mock response object that captures status, json, headers.
 */
export function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    _ended: false,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      res._ended = true;
      return res;
    },
    setHeader(key, value) {
      res._headers[key] = value;
      return res;
    },
    end(data) {
      res._ended = true;
      res._endData = data;
      return res;
    },
    // For PDF/binary responses
    write(chunk) {
      if (!res._chunks) res._chunks = [];
      res._chunks.push(chunk);
      return res;
    },
  };
  return res;
}

/**
 * Call a handler and return the response.
 */
export async function callHandler(handler, reqOptions = {}) {
  const req = mockReq(reqOptions);
  const res = mockRes();
  await handler(req, res);
  return { status: res._status, json: res._json, headers: res._headers, ended: res._ended };
}
```

- [ ] **Step 2: Verify the helper works with a quick smoke test**

Create a temporary test to validate:

```bash
node -e "
import { createTestToken } from './tests/api/helpers.js';
const token = createTestToken();
console.log('Token created:', token.substring(0, 20) + '...');
console.log('OK');
"
```

Expected: Token created and printed.

- [ ] **Step 3: Commit**

```bash
git add tests/api/helpers.js
git commit -m "test: add API smoke test helpers (mock req/res, JWT)"
```

---

## Task 4: Code Audit — Staff & Time Domain

**Files:**
- Read (audit): `src/services/timeCalculation.js`, `src/services/hourBalance.js`, `src/services/sickLeave.js`, `src/services/vacation.js`
- Read (audit): `api/_handlers/workers/index.js`, `api/_handlers/workers/[id].js`, `api/_handlers/time-entries/index.js`, `api/_handlers/time-entries/[id].js`, `api/_handlers/time-entries/flagged.js`, `api/_handlers/sick-leave/index.js`, `api/_handlers/sick-leave/[id].js`, `api/_handlers/vacation/index.js`, `api/_handlers/hour-balances/index.js`, `api/_handlers/hour-balances/sync.js`, `api/_handlers/hour-balances/payout.js`, `api/_handlers/hour-balances/initial.js`
- Create: `docs/superpowers/specs/audit-staff-time.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every file listed above**

Read every service file and handler file completely.

- [ ] **Step 2: Check each file against the bug pattern checklist**

For each file, look for:
- Timezone/date handling errors (UTC vs local, date boundary off-by-one)
- Null/undefined access without guards
- SQL injection or unsafe query building (string concatenation in queries)
- Missing error handling (unhandled promise rejections, missing try/catch)
- Off-by-one errors in date ranges, pagination, calculations
- Business logic edge cases (zero workers, Minijob caps at 520€/month, overtime logic, harcirah edge cases)
- Race conditions in concurrent operations
- Missing input validation on API endpoints (POST/PUT without checking required fields)
- Hardcoded values that should be configurable
- Dead code or unreachable paths
- Missing CORS/auth checks on endpoints
- Inconsistent error response formats

Pay special attention to:
- **Minijob vs Fulltime divergence**: Are calculations correctly branched? What happens at boundaries (exactly 520€)?
- **Date boundaries**: Month start/end, year transitions, leap years
- **Harcirah calculation**: Edge cases with partial days, missing check-out
- **Hour balance surplus**: Does the math handle negative values? Zero hours?

- [ ] **Step 3: Write findings to audit report**

Create `docs/superpowers/specs/audit-staff-time.md` with every finding using this format:

```markdown
# Code Audit: Staff & Time Domain

## Findings

### FINDING-ST-1: {short title}
- **Severity:** critical | high | medium | low
- **File:** {file_path}:{line_number}
- **Pattern:** {which bug pattern from checklist}
- **Description:** What's wrong and why it's a problem
- **Impact:** What breaks for the user
- **Suggested fix:** Brief description of the fix

### FINDING-ST-2: ...
```

If a file has no issues, note it: "**{filename}**: No issues found."

- [ ] **Step 4: Commit the audit report**

```bash
git add docs/superpowers/specs/audit-staff-time.md
git commit -m "audit: staff & time domain findings"
```

---

## Task 5: Code Audit — Operations Domain

**Files:**
- Read (audit): `src/services/planGeneration.js`, `src/services/taskScheduling.js`, `src/services/accountabilityFlow.js`, `src/services/commandCenter.js`
- Read (audit): `api/_handlers/daily-plans/index.js`, `api/_handlers/daily-plans/[id].js`, `api/_handlers/daily-plans/approve.js`, `api/_handlers/weekly-planner/index.js`, `api/_handlers/tasks/daily.js`, `api/_handlers/tasks/generate.js`, `api/_handlers/tasks/carryover.js`, `api/_handlers/tasks/[id]/assign.js`, `api/_handlers/tasks/[id]/status.js`, `api/_handlers/tasks/[id]/postpone.js`, `api/_handlers/tasks/[id]/reassign.js`, `api/_handlers/plan-assignments/[id].js`, `api/_handlers/plan-assignments/[id]/postpone.js`, `api/_handlers/command-center/index.js`
- Create: `docs/superpowers/specs/audit-operations.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every file listed above**

- [ ] **Step 2: Check each file against the bug pattern checklist**

Same checklist as Task 4, plus pay special attention to:
- **Timezone handling**: The weekly planner already had a timezone bug (fixed in commit 759fe5b). Are there similar issues elsewhere?
- **Plan generation with zero workers**: What happens if all workers are sick?
- **Task carry-over**: Does postponed task logic correctly handle multi-day carryover chains?
- **Assignment conflicts**: Can two workers be assigned the same property on the same day?
- **Plan approval race**: What if two admins approve the same plan simultaneously?
- **Weekly planner date ranges**: Off-by-one at week boundaries, especially around DST transitions

- [ ] **Step 3: Write findings to audit-operations.md**

Same format as Task 4, using prefix `FINDING-OP-{n}`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/audit-operations.md
git commit -m "audit: operations domain findings"
```

---

## Task 6: Code Audit — Financial Domain

**Files:**
- Read (audit): `src/services/timesheetGeneration.js`, `src/services/pdfReport.js`, `src/services/analytics.js`
- Read (audit): `api/_handlers/reports/index.js`, `api/_handlers/reports/generate.js`, `api/_handlers/reports/[id]/index.js`, `api/_handlers/reports/[id]/download.js`, `api/_handlers/timesheets/index.js`, `api/_handlers/timesheets/generate.js`, `api/_handlers/timesheets/[id].js`, `api/_handlers/analytics/index.js`, `api/_handlers/analytics/export.js`
- Create: `docs/superpowers/specs/audit-financial.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every file listed above**

- [ ] **Step 2: Check each file against the bug pattern checklist**

Pay special attention to:
- **Timesheet calculation accuracy**: Do generated hours match actual time entries? Rounding issues?
- **PDF generation**: Does pdfkit handle empty data (no workers, no entries for a month)?
- **Supabase upload failures**: Is there error handling if upload fails mid-report?
- **Analytics date ranges**: Off-by-one at month boundaries
- **Excel export**: Does xlsx handle special characters in worker names / property addresses?
- **Report re-generation**: What happens if you generate a report for a month that already has one?

- [ ] **Step 3: Write findings to audit-financial.md**

Same format, prefix `FINDING-FN-{n}`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/audit-financial.md
git commit -m "audit: financial domain findings"
```

---

## Task 7: Code Audit — Garbage Domain

**Files:**
- Read (audit): `src/services/garbageScheduling.js`, `src/services/awpParser.js`
- Read (audit): `api/_handlers/garbage/upload.js`, `api/_handlers/garbage/map.js`, `api/_handlers/garbage/summary.js`, `api/_handlers/garbage/generate.js`, `api/_handlers/garbage/upcoming.js`, `api/_handlers/garbage/schedule/[propertyId].js`
- Create: `docs/superpowers/specs/audit-garbage.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every file listed above**

- [ ] **Step 2: Check against bug pattern checklist**

Pay special attention to:
- **AWP parser robustness**: Malformed input, unexpected date formats, missing fields
- **Garbage schedule date math**: Leap years, year transitions, DST
- **Property mapping**: What if a property has no garbage bins? What if a bin is mapped to a deleted property?
- **Upload validation**: File type/size validation for garbage schedule uploads
- **Upcoming collections**: Date range edge cases (today vs tomorrow boundary at midnight)

- [ ] **Step 3: Write findings to audit-garbage.md**

Prefix `FINDING-GB-{n}`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/audit-garbage.md
git commit -m "audit: garbage domain findings"
```

---

## Task 8: Code Audit — Infrastructure Domain

**Files:**
- Read (audit): `src/services/whatsapp.js`, `src/services/bot.js`, `src/services/notifications.js`, `src/services/photoStorage.js`, `src/services/planNotifications.js`, `src/services/taskNotifications.js`, `src/middleware/auth.js`, `src/config.js`, `src/db/pool.js`
- Read (audit): `api/_handlers/auth/login.js`, `api/_handlers/cron/nightly.js`, `api/_handlers/cron/morning.js`, `api/_handlers/cron/evening.js`, `api/_handlers/health.js`, `api/_handlers/webhook.js`, `api/index.js`
- Create: `docs/superpowers/specs/audit-infrastructure.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every file listed above**

- [ ] **Step 2: Check against bug pattern checklist**

Pay special attention to:
- **Auth bypass**: Can any endpoint be reached without a valid JWT? Check the router in `api/index.js` — does every route go through `checkAuth`? What about `webhook` and `health` routes (they should be exempt)?
- **Cron job security**: Are cron endpoints protected by `CRON_SECRET` header verification? Without this, anyone can trigger them.
- **Webhook validation**: Is the Twilio webhook signature validated? Without this, anyone can send fake WhatsApp messages.
- **SQL injection in router**: The dynamic route regex extracts params — are they used safely in queries?
- **Photo storage**: What if Supabase is down? Does `savePhotoFromTwilio` handle Twilio download failures?
- **Notification failures**: If WhatsApp send fails, does it crash the calling function or fail gracefully?
- **Pool exhaustion**: Are DB connections always released? Check for missing `.release()` in error paths.
- **Config missing values**: What happens if an env var is undefined? Does the app crash at startup or fail silently at runtime?

- [ ] **Step 3: Write findings to audit-infrastructure.md**

Prefix `FINDING-IF-{n}`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/audit-infrastructure.md
git commit -m "audit: infrastructure domain findings"
```

---

## Task 9: Code Audit — Frontend Domain

**Files:**
- Read (audit): All files in `client/src/pages/` (CommandCenter.jsx, Workers.jsx, TimeEntries.jsx, SickLeave.jsx, Vacation.jsx, HourBalances.jsx, Reports.jsx, Properties.jsx, DailyOperations.jsx, WeeklyPlanner.jsx, ExtraJobs.jsx, GarbageSchedule.jsx, Analytics.jsx, Login.jsx, DailyPlan.jsx, DailyTasks.jsx, Dashboard.jsx)
- Read (audit): `client/src/api/client.js`, `client/src/App.jsx`, `client/src/components/Layout.jsx`
- Read (audit): Key components in `client/src/components/` (especially command-center/ subdirectory)
- Create: `docs/superpowers/specs/audit-frontend.md`

This task is a **read-only audit**. Do not modify any source files.

- [ ] **Step 1: Read every page and key component file**

- [ ] **Step 2: Check against frontend-specific bug patterns**

For each page, look for:
- **Missing loading states**: Does the page show anything while API calls are in flight? Or does it flash empty/broken content?
- **Missing error handling**: If an API call fails (network error, 500), what does the user see? Look for `.catch()` or try/catch around API calls.
- **Stale state after mutations**: After creating/editing/deleting an item, does the list refresh? Or does the user see stale data?
- **Empty state handling**: What does the page show when there are zero items (no workers, no entries, etc.)?
- **Uncontrolled form inputs**: Missing `value`/`onChange` pairs that could cause React warnings or lost input.
- **Missing key props**: Lists rendered with `.map()` without `key` props.
- **Memory leaks**: `useEffect` without cleanup (intervals, event listeners, aborted fetch calls).
- **Navigation bugs**: Dead links, routes that don't match, redirect loops.
- **XSS risks**: Anywhere user input is rendered with `dangerouslySetInnerHTML` or unescaped.
- **Accessibility**: Missing labels on form inputs, non-semantic elements used as buttons, missing alt text.
- **Token handling**: Does the API client correctly handle 401? Does it redirect to login? Is the token stored securely?
- **Date display issues**: Are dates shown in the user's timezone? German date format (DD.MM.YYYY)?

- [ ] **Step 3: Write findings to audit-frontend.md**

Prefix `FINDING-FE-{n}`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/audit-frontend.md
git commit -m "audit: frontend domain findings"
```

---

## Task 10: API Smoke Tests — Auth & Workers

**Files:**
- Create: `tests/api/auth.test.js`
- Create: `tests/api/workers.test.js`

- [ ] **Step 1: Write auth smoke tests**

Create `tests/api/auth.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import loginHandler from '../../api/_handlers/auth/login.js';
import { callHandler } from './helpers.js';

describe('POST /api/auth/login', () => {
  it('rejects GET method', async () => {
    const { status, json } = await callHandler(loginHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).not.toBe(200);
  });

  it('rejects missing credentials', async () => {
    const { status, json } = await callHandler(loginHandler, {
      method: 'POST',
      body: {},
      authenticated: false,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(json.error).toBeDefined();
  });

  it('rejects wrong credentials', async () => {
    const { status, json } = await callHandler(loginHandler, {
      method: 'POST',
      body: { username: 'wrong', password: 'wrong' },
      authenticated: false,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Run auth tests**

Run: `npx vitest run tests/api/auth.test.js`

Expected: All tests pass.

- [ ] **Step 3: Write workers smoke tests**

Create `tests/api/workers.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import workersHandler from '../../api/_handlers/workers/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

describe('GET /api/workers (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(workersHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});

describeWithDb('GET /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns empty array when no workers', async () => {
    const { status, json } = await callHandler(workersHandler, { method: 'GET' });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('returns workers when they exist', async () => {
    await createTestWorker({ name: 'Ali' });
    const { status, json } = await callHandler(workersHandler, { method: 'GET' });
    expect(status).toBe(200);
    expect(json.length).toBe(1);
    expect(json[0].name).toBe('Ali');
  });
});

describeWithDb('POST /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a worker with valid data', async () => {
    const { status, json } = await callHandler(workersHandler, {
      method: 'POST',
      body: {
        name: 'Mehmet',
        phone_number: '+4917612345678',
        worker_type: 'fulltime',
        hourly_rate: 14.0,
        worker_role: 'field',
      },
    });
    expect(status).toBe(201);
    expect(json.name).toBe('Mehmet');
  });

  it('rejects missing name', async () => {
    const { status, json } = await callHandler(workersHandler, {
      method: 'POST',
      body: { phone_number: '+4917612345678' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects invalid worker_type', async () => {
    const { status, json } = await callHandler(workersHandler, {
      method: 'POST',
      body: {
        name: 'Test',
        phone_number: '+4917612345678',
        worker_type: 'freelancer',
      },
    });
    expect(status).toBe(400);
  });

  it('rejects duplicate phone number', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const { status } = await callHandler(workersHandler, {
      method: 'POST',
      body: {
        name: 'Duplicate',
        phone_number: '+4917612345678',
        worker_type: 'fulltime',
      },
    });
    expect(status).toBe(409);
  });
});
```

- [ ] **Step 4: Run workers tests**

Run: `npx vitest run tests/api/workers.test.js`

Expected: All pass (some may skip if DB unavailable).

- [ ] **Step 5: Commit**

```bash
git add tests/api/auth.test.js tests/api/workers.test.js
git commit -m "test: add API smoke tests for auth and workers"
```

---

## Task 11: API Smoke Tests — Time Entries & Sick Leave

**Files:**
- Create: `tests/api/time-entries.test.js`
- Create: `tests/api/sick-leave.test.js`

- [ ] **Step 1: Write time-entries smoke tests**

Create `tests/api/time-entries.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import timeEntriesHandler from '../../api/_handlers/time-entries/index.js';
import timeEntriesFlaggedHandler from '../../api/_handlers/time-entries/flagged.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

describe('GET /api/time-entries (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(timeEntriesHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});

describeWithDb('GET /api/time-entries', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns entries filtered by date range', async () => {
    const { status, json } = await callHandler(timeEntriesHandler, {
      method: 'GET',
      query: { from: '2026-01-01', to: '2026-01-31' },
    });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });
});

describeWithDb('POST /api/time-entries', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a time entry with valid data', async () => {
    const worker = await createTestWorker();
    const { status, json } = await callHandler(timeEntriesHandler, {
      method: 'POST',
      body: {
        worker_id: worker.id,
        date: '2026-03-27',
        check_in: '08:00',
        check_out: '16:00',
      },
    });
    expect(status).toBeLessThan(300);
  });

  it('rejects entry without worker_id', async () => {
    const { status } = await callHandler(timeEntriesHandler, {
      method: 'POST',
      body: { date: '2026-03-27', check_in: '08:00' },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/time-entries/flagged (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(timeEntriesFlaggedHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});
```

- [ ] **Step 2: Write sick-leave smoke tests**

Create `tests/api/sick-leave.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import sickLeaveHandler from '../../api/_handlers/sick-leave/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

describe('GET /api/sick-leave (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(sickLeaveHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});

describeWithDb('POST /api/sick-leave', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates sick leave record', async () => {
    const worker = await createTestWorker();
    const { status, json } = await callHandler(sickLeaveHandler, {
      method: 'POST',
      body: {
        worker_id: worker.id,
        start_date: '2026-03-27',
        declared_days: 3,
      },
    });
    expect(status).toBeLessThan(300);
  });

  it('rejects without worker_id', async () => {
    const { status } = await callHandler(sickLeaveHandler, {
      method: 'POST',
      body: { start_date: '2026-03-27', declared_days: 3 },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 3: Run both test files**

Run: `npx vitest run tests/api/time-entries.test.js tests/api/sick-leave.test.js`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add tests/api/time-entries.test.js tests/api/sick-leave.test.js
git commit -m "test: add API smoke tests for time entries and sick leave"
```

---

## Task 12: API Smoke Tests — Operations (Daily Plans, Tasks, Weekly Planner)

**Files:**
- Create: `tests/api/daily-plans.test.js`
- Create: `tests/api/weekly-planner.test.js`

- [ ] **Step 1: Write daily-plans smoke tests**

Create `tests/api/daily-plans.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import dailyPlansHandler from '../../api/_handlers/daily-plans/index.js';
import approveHandler from '../../api/_handlers/daily-plans/approve.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestPlan } from '../helpers.js';

describe('GET /api/daily-plans (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(dailyPlansHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});

describeWithDb('GET /api/daily-plans', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns plans for a date', async () => {
    await createTestPlan({ plan_date: '2026-03-27' });
    const { status, json } = await callHandler(dailyPlansHandler, {
      method: 'GET',
      query: { date: '2026-03-27' },
    });
    expect(status).toBe(200);
  });

  it('returns empty for date with no plans', async () => {
    const { status } = await callHandler(dailyPlansHandler, {
      method: 'GET',
      query: { date: '2099-01-01' },
    });
    expect(status).toBe(200);
  });
});

describeWithDb('POST /api/daily-plans/approve', () => {
  beforeEach(async () => { await cleanDb(); });

  it('rejects approve for non-existent plan', async () => {
    const { status } = await callHandler(approveHandler, {
      method: 'POST',
      body: { plan_id: 99999 },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
```

- [ ] **Step 2: Write weekly-planner smoke tests**

Create `tests/api/weekly-planner.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import weeklyPlannerHandler from '../../api/_handlers/weekly-planner/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb } from '../helpers.js';

describe('GET /api/weekly-planner (auth)', () => {
  it('rejects unauthenticated requests', async () => {
    const { status } = await callHandler(weeklyPlannerHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
  });
});

describeWithDb('GET /api/weekly-planner', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns data for current week', async () => {
    const { status, json } = await callHandler(weeklyPlannerHandler, {
      method: 'GET',
      query: {},
    });
    expect(status).toBe(200);
  });

  it('returns data for a specific date', async () => {
    const { status, json } = await callHandler(weeklyPlannerHandler, {
      method: 'GET',
      query: { date: '2026-03-27' },
    });
    expect(status).toBe(200);
  });

  it('rejects non-GET methods', async () => {
    const { status } = await callHandler(weeklyPlannerHandler, {
      method: 'POST',
    });
    expect(status).toBe(405);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/api/daily-plans.test.js tests/api/weekly-planner.test.js`

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add tests/api/daily-plans.test.js tests/api/weekly-planner.test.js
git commit -m "test: add API smoke tests for daily plans and weekly planner"
```

---

## Task 13: API Smoke Tests — Remaining Endpoints

**Files:**
- Create: `tests/api/properties.test.js`
- Create: `tests/api/extra-jobs.test.js`
- Create: `tests/api/garbage.test.js`
- Create: `tests/api/hour-balances.test.js`
- Create: `tests/api/reports.test.js`
- Create: `tests/api/command-center.test.js`
- Create: `tests/api/analytics.test.js`
- Create: `tests/api/cron.test.js`
- Create: `tests/api/health.test.js`

- [ ] **Step 1: Write smoke tests for each remaining endpoint domain**

Each test file follows the same pattern. For every endpoint:
1. Test auth rejection (unauthenticated → 401)
2. Test happy path with valid data
3. Test invalid input (missing required fields → 400)
4. Test method rejection (wrong HTTP method → 405)

Use the existing handler imports and `callHandler` helper. Use `describeWithDb` + `cleanDb` + factory functions for tests that touch the database.

The tests should follow the exact same patterns shown in Tasks 10-12. For each file:

**properties.test.js** — Test GET list, POST create (require address), auth check
**extra-jobs.test.js** — Test GET list, POST create, auth check
**garbage.test.js** — Test GET map, GET summary, GET upcoming, auth checks
**hour-balances.test.js** — Test GET list, POST sync, POST payout, auth checks
**reports.test.js** — Test GET list, POST generate (require month/year), auth check
**command-center.test.js** — Test GET with date param, GET without date, auth check
**analytics.test.js** — Test GET with date range, GET export, auth checks
**cron.test.js** — Test that cron endpoints exist and respond (they should NOT require JWT auth but should verify CRON_SECRET header if implemented)
**health.test.js** — Test that health endpoint returns 200 without auth

- [ ] **Step 2: Run all API smoke tests**

Run: `npx vitest run tests/api/`

Expected: All pass. Note any failures — these are immediate bugs to report.

- [ ] **Step 3: Commit**

```bash
git add tests/api/
git commit -m "test: add API smoke tests for all remaining endpoints"
```

---

## Task 14: Compile Bug Report & Triage

**Files:**
- Create: `docs/superpowers/specs/bug-report.md`

- [ ] **Step 1: Collect all audit findings**

Read all six audit reports:
- `docs/superpowers/specs/audit-staff-time.md`
- `docs/superpowers/specs/audit-operations.md`
- `docs/superpowers/specs/audit-financial.md`
- `docs/superpowers/specs/audit-garbage.md`
- `docs/superpowers/specs/audit-infrastructure.md`
- `docs/superpowers/specs/audit-frontend.md`

Also collect any test failures from the API smoke tests (Task 13 Step 2).

- [ ] **Step 2: Compile into unified bug report**

Create `docs/superpowers/specs/bug-report.md`:

```markdown
# Bug Report — Systematic Audit

**Date:** 2026-03-27
**Scope:** Full system audit across 6 domains + API smoke tests

## Summary

- Total findings: {N}
- Critical: {N}
- High: {N}
- Medium: {N}
- Low: {N}

## Findings

### BUG-001: {title from FINDING-XX-N}
- **Severity:** {severity}
- **Domain:** {domain}
- **Location:** {file}:{line}
- **Description:** {description}
- **Reproduction:** {steps or test case}
- **Impact:** {user impact}
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

(repeat for all findings, renumbered sequentially)
```

- [ ] **Step 3: Present to user for triage**

Show the user the bug report summary and ask them to mark each bug as:
- **fix** — write test + fix it
- **known** — skip (intentional behavior)
- **defer** — real but low priority

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/bug-report.md
git commit -m "audit: compiled bug report for triage"
```

---

## Task 15: Fix Bugs & Pin with Tests

**Files:** Varies per bug — determined by triage results from Task 14.

This task repeats for each bug marked "fix" in the triage:

- [ ] **Step 1: For each "fix" bug, write a failing test**

Create a test in the appropriate file (`tests/services/` for service bugs, `tests/api/` for endpoint bugs) that reproduces the exact bug.

Run it to confirm it fails.

- [ ] **Step 2: Fix the bug in the source code**

Make the minimal change to fix the issue.

- [ ] **Step 3: Run the test to confirm it passes**

Run the specific test file.

- [ ] **Step 4: Run the full test suite to check for regressions**

Run: `npm run test`

Expected: All tests pass.

- [ ] **Step 5: Commit the fix + test together**

```bash
git add {test-file} {source-file}
git commit -m "fix: {bug title} (BUG-{number})"
```

Repeat steps 1-5 for each bug. These can be parallelized — each bug fix is independent.

---

## Task 16: Playwright E2E Setup

**Files:**
- Create: `playwright.config.js`
- Create: `tests/e2e/auth.spec.js`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.js**

```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'cd client && npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
```

- [ ] **Step 3: Add E2E test script to package.json**

Add to scripts:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write a basic auth E2E test**

Create `tests/e2e/auth.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('rejects wrong credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="text"], input[name="username"]', 'wrong');
  await page.fill('input[type="password"]', 'wrong');
  await page.click('button[type="submit"]');
  // Should show error, not redirect
  await expect(page).toHaveURL(/login/);
});

test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/login/);
});
```

- [ ] **Step 5: Run E2E tests**

Run:
```bash
npm run test:e2e
```

Expected: All 3 tests pass (requires Vite dev server running or the webServer config to start it).

- [ ] **Step 6: Commit**

```bash
git add playwright.config.js tests/e2e/auth.spec.js package.json package-lock.json
git commit -m "test: add Playwright E2E setup with auth tests"
```

---

## Task 17: E2E Tests — Critical User Flows

**Files:**
- Create: `tests/e2e/command-center.spec.js`
- Create: `tests/e2e/workers.spec.js`
- Create: `tests/e2e/daily-operations.spec.js`
- Create: `tests/e2e/extra-jobs.spec.js`
- Create: `tests/e2e/reports.spec.js`

- [ ] **Step 1: Create E2E helper for login**

Create `tests/e2e/helpers.js`:

```javascript
export async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="text"], input[name="username"]', process.env.TEST_ADMIN_USER || 'halil');
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASS || 'test-password');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/command-center', { timeout: 10000 });
}
```

- [ ] **Step 2: Write E2E test for each critical flow**

Each spec file should:
1. Login using the helper
2. Navigate to the page
3. Verify the page loads (heading, key elements visible)
4. Perform a CRUD action if applicable
5. Verify the result

**command-center.spec.js**: Login → verify stats bar, worker panel, property grid are visible
**workers.spec.js**: Login → navigate to workers → verify list loads → create new worker → verify it appears
**daily-operations.spec.js**: Login → navigate → verify plan view loads
**extra-jobs.spec.js**: Login → navigate → verify list loads → create new job → verify it appears
**reports.spec.js**: Login → navigate → verify list loads

- [ ] **Step 3: Run all E2E tests**

Run: `npm run test:e2e`

Note any failures — these indicate real UI bugs.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/
git commit -m "test: add E2E tests for critical user flows"
```

---

## Task 18: GitHub Actions CI Pipeline

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create the CI workflow**

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  push:
    branches: ['*']
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: bal_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5433/bal_test
      JWT_SECRET: test-secret-do-not-use-in-production
      ADMIN_USERNAME: halil
      ADMIN_PASSWORD_HASH: $2b$10$testhashdoesnotmatterforunit
      SUPABASE_URL: http://localhost:9999
      SUPABASE_SERVICE_KEY: test-key
      TWILIO_ACCOUNT_SID: ACtest
      TWILIO_AUTH_TOKEN: test-token
      TWILIO_WHATSAPP_NUMBER: '+14155551234'
      HALIL_WHATSAPP_NUMBER: '+4917699999999'

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run database migrations
        run: npm run migrate

      - name: Run unit and integration tests
        run: npm run test

      - name: Run API smoke tests
        run: npm run test:smoke

      - name: Install Playwright
        run: npx playwright install chromium --with-deps

      - name: Install client dependencies
        run: cd client && npm ci

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: |
            test-results/
            playwright-report/
```

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run:
```bash
node -e "const fs = require('fs'); const yaml = require('yaml') || JSON.parse; console.log('YAML valid');" 2>/dev/null || echo "Manual check: open .github/workflows/test.yml and verify indentation"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add GitHub Actions test pipeline"
```

---

## Task 19: Manual Testing Checklist Document

**Files:**
- Create: `docs/superpowers/specs/manual-testing-checklist.md`

- [ ] **Step 1: Create the manual testing checklist**

```markdown
# Manual Testing Checklist

Items that cannot be automated due to external service dependencies.
Complete these after all automated tests pass.

## WhatsApp Flows (requires Twilio + real phone)

- [ ] Send "Arbeit" from test phone → verify check-in time entry created in DB
- [ ] Send "Feierabend" → verify check-out recorded, hours calculated
- [ ] Send "Krank" → verify sick leave record created, Halil notified
- [ ] Send random text → verify bot responds with help/menu
- [ ] Send "Arbeit" twice without "Feierabend" → verify duplicate check-in handled

**Verification:** Check time_entries table after each test.

## Cron Jobs (trigger manually via curl)

- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/morning -H "Authorization: Bearer CRON_SECRET"` → verify daily plan generation
- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/evening` → verify anomaly detection runs (check for missing checkouts)
- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/nightly` → verify nightly cleanup/maintenance

**Verification:** Check daily_plans and time_entries tables.

## Photo Upload (requires Supabase storage)

- [ ] Create an extra job → upload a photo → verify photo URL stored and accessible
- [ ] Try uploading a non-image file → verify rejection
- [ ] Try uploading a very large file (>10MB) → verify proper error message

## PDF/Excel Generation (requires Supabase storage)

- [ ] Generate monthly report for a month with data → verify PDF downloads and has correct content
- [ ] Generate timesheet for a worker → verify hours match time entries
- [ ] Export analytics → verify Excel opens with correct data
- [ ] Generate report for empty month → verify it handles gracefully (no crash)

## Browser Compatibility

- [ ] Test on Chrome desktop
- [ ] Test on mobile browser (responsive layout)
- [ ] Verify German date formats throughout (DD.MM.YYYY)
- [ ] Verify language toggle works (DE ↔ EN)
- [ ] Verify dark/light theme toggle
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/manual-testing-checklist.md
git commit -m "docs: add manual testing checklist for external service verification"
```

---

## Parallelization Guide

**Tasks that can run in parallel:**
- Tasks 4, 5, 6, 7, 8, 9 (all 6 code audit domains) — completely independent
- Tasks 10, 11, 12, 13 (API smoke tests) — can run in parallel with audits
- Task 15 (bug fixes) — each individual bug fix is independent

**Tasks that must run sequentially:**
- Tasks 1-3 must complete before Tasks 4-13 (infrastructure needed first)
- Task 14 must wait for Tasks 4-13 (compiles their results)
- Task 15 depends on Task 14 (needs triage results)
- Tasks 16-17 can run after Task 3 (only need test infrastructure)
- Task 18 should be last (needs all test files to exist)

**Recommended execution order:**
1. Tasks 1-3 (infrastructure) — sequential, ~15 min
2. Tasks 4-9 + Tasks 10-13 (audits + smoke tests) — all in parallel, ~30 min
3. Task 14 (compile report) — sequential, ~10 min
4. Task 15 (fix bugs) — parallel per bug, time varies
5. Tasks 16-17 (E2E) — sequential, ~20 min
6. Tasks 18-19 (CI + manual checklist) — parallel, ~10 min
