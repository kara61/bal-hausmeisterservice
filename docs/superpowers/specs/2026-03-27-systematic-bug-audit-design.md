# Systematic Bug Audit & Automated Testing — Design Spec

**Date:** 2026-03-27
**Goal:** Find bugs in the current production system through automated code audit and smoke testing, then pin every confirmed bug with automated tests.

---

## Context

Bal Hausmeisterservice is a facility management system with:
- 15 frontend routes (React + Vite)
- ~50 API endpoints (Vercel serverless, single catch-all router)
- 23+ backend services
- 14 database migrations (Supabase PostgreSQL)
- WhatsApp integration (Twilio), 3 cron jobs, PDF/Excel generation
- Existing: 16 test files covering 14/20 services (Vitest)
- Missing: 0 frontend tests, 0 E2E tests, 0 API endpoint tests, no CI pipeline

Testing has been manual so far. The app is in active development with features already implemented and in use.

---

## Approach: Bug Sweep

Find real bugs first, write tests second. Not chasing coverage metrics — chasing actual problems.

---

## Phase 1: Automated Code Audit

Six parallel subagent sweeps, each scanning a domain for bug patterns.

### Audit Domains

**1. Staff & Time**
- Files: `src/services/timeCalculation.js`, `src/services/hourBalance.js`, `src/services/sickLeave.js`, `src/services/vacation.js`
- Handlers: `api/_handlers/workers/`, `api/_handlers/time-entries/`, `api/_handlers/sick-leave/`, `api/_handlers/vacation/`, `api/_handlers/hour-balances/`
- Focus: hour calculation edge cases (Minijob caps, overtime, harcirah), date boundary issues, fulltime vs minijob logic divergence

**2. Operations**
- Files: `src/services/planGeneration.js`, `src/services/taskScheduling.js`, `src/services/accountabilityFlow.js`, `src/services/commandCenter.js`
- Handlers: `api/_handlers/daily-plans/`, `api/_handlers/weekly-planner/`, `api/_handlers/tasks/`
- Focus: plan generation logic, task carry-over, assignment conflicts, timezone handling (already had bugs here)

**3. Financial**
- Files: `src/services/timesheetGeneration.js`, `src/services/pdfReport.js`, `src/services/analytics.js`
- Handlers: `api/_handlers/reports/`, `api/_handlers/timesheets/`, `api/_handlers/analytics/`
- Focus: calculation accuracy, PDF generation edge cases, export data integrity

**4. Garbage**
- Files: `src/services/garbageScheduling.js`, `src/services/awpParser.js`
- Handlers: `api/_handlers/garbage/`
- Focus: AWP parsing robustness, schedule date calculations, property mapping edge cases

**5. Infrastructure**
- Files: `src/services/whatsapp.js`, `src/services/bot.js`, `src/services/notifications.js`, `src/services/photoStorage.js`, `src/middleware/auth.js`
- Handlers: `api/_handlers/auth/`, `api/_handlers/cron/`, `api/index.js` (router)
- Focus: auth bypass possibilities, webhook validation, cron job error handling, route matching edge cases

**6. Frontend**
- Files: all `client/src/pages/*.jsx`, `client/src/components/`, `client/src/api/client.js`, `client/src/App.jsx`
- Focus: missing loading/error states, unhandled API failures, stale state after mutations, accessibility issues, broken navigation paths

### Bug Pattern Checklist (applied by all 6 subagents)

- [ ] Timezone/date handling errors (UTC vs local, date boundary off-by-one)
- [ ] Null/undefined access without guards
- [ ] SQL injection or unsafe query building (string concatenation in queries)
- [ ] Missing error handling (unhandled promise rejections, missing try/catch)
- [ ] Off-by-one errors in date ranges, pagination, calculations
- [ ] Business logic edge cases (zero workers, no properties, empty plans)
- [ ] Race conditions in concurrent operations
- [ ] Missing input validation on API endpoints
- [ ] Hardcoded values that should be configurable
- [ ] Dead code or unreachable paths
- [ ] Memory leaks (unclosed DB connections, streams)
- [ ] Missing CORS/auth checks on endpoints
- [ ] Inconsistent error response formats

---

## Phase 2: API Smoke Tests

A test script that hits every endpoint programmatically. Runs in parallel with Phase 1.

### Test Categories Per Endpoint

1. **Happy path** — valid request with correct auth → expects success response
2. **Auth check** — request without JWT → expects 401
3. **Invalid params** — wrong types, missing required fields → expects proper error (not crash/500)
4. **Edge cases** — empty strings, zero values, future dates, negative numbers

### Endpoint Inventory (~50 endpoints)

**Auth:** POST login
**Workers:** GET list, POST create, GET/:id, PUT/:id, DELETE/:id, GET/role
**Properties:** GET list, POST create, GET/:id, PUT/:id, DELETE/:id
**Time Entries:** GET list, POST create, GET/:id, PUT/:id, GET flagged
**Sick Leave:** GET list, POST create, GET/:id, PUT/:id
**Vacation:** GET list, POST create
**Reports:** GET list, POST create, GET/:id, GET/:id/download, POST generate
**Timesheets:** GET list, POST create, GET/:id, POST generate
**Teams:** GET list, POST create, GET/:id, PUT/:id, GET/:id/members
**Tasks:** GET daily, POST generate, POST carryover, PUT/:id/assign, PUT/:id/status, PUT/:id/postpone, PUT/:id/reassign
**Extra Jobs:** GET list, POST create, GET/:id, PUT/:id, GET/:id/photos, POST/:id/photos
**Garbage:** POST upload, GET map, GET summary, POST generate, GET upcoming, GET schedule/:propertyId
**Daily Plans:** GET list, POST create, GET/:id, PUT/:id, POST/:id/approve
**Plan Assignments:** GET/:id, PUT/:id, POST/:id/postpone
**Weekly Planner:** GET
**Command Center:** GET
**Analytics:** GET, GET export
**Hour Balances:** GET list, POST create, POST sync, POST payout, POST initial
**Cron:** GET nightly, GET morning, GET evening
**Health:** GET

---

## Phase 3: Bug Report & Triage

### Output Format

Single file: `docs/superpowers/specs/bug-report.md`

Each bug entry:
```
### BUG-{number}: {short title}
- **Severity:** critical | high | medium | low
- **Domain:** staff | operations | financial | garbage | infra | frontend
- **Location:** {file_path}:{line_number}
- **Description:** What's wrong
- **Reproduction:** Steps or test case to trigger it
- **Impact:** What breaks for the user
```

### Triage Process

User reviews the bug report and marks each bug:
- **fix** — confirmed bug, write test + fix
- **known** — known/intentional behavior, skip
- **defer** — real issue but low priority, skip for now

Only "fix" bugs proceed to Phase 4.

---

## Phase 4: Targeted Test Suite

For every confirmed bug:
1. Write a **failing test** that reproduces the exact bug
2. Fix the bug in production code
3. Verify test passes

### Test Organization

```
tests/
├── services/          # existing — extend with new bug-pinning tests
├── api/               # NEW — HTTP-level endpoint tests
│   ├── helpers.js     # test server setup, auth token helper
│   ├── workers.test.js
│   ├── time-entries.test.js
│   ├── daily-plans.test.js
│   └── ... (one file per handler domain)
└── setup.js           # existing — extend with API test setup
```

### Parallelization

Bug fixes are independent — multiple subagents can work on different bugs simultaneously. For overflow, user runs additional agents in separate sessions with provided prompts.

---

## Phase 5: E2E + CI Pipeline

### Playwright E2E Tests

**Setup:**
- Playwright installed at project root (tests full stack: frontend + API)
- Tests against `localhost:5173` (Vite dev) + `localhost:3000` (Vercel dev API)
- Screenshot-on-failure saved to `tests/e2e/screenshots/`

**6 Critical User Flows:**

1. **Login → Command Center** — authenticate, verify dashboard loads with stats, worker panel, property grid
2. **Worker Management** — create worker, edit details, toggle active status, verify list updates
3. **Time Entry Flow** — create time entry, verify hour calculations, flag entry, resolve flag
4. **Daily Operations** — generate daily plan, review assignments, approve plan, verify in weekly planner
5. **Extra Jobs** — create job, upload photo, mark complete, verify in list
6. **Reports** — generate monthly report, verify PDF download works

### GitHub Actions CI Pipeline

```yaml
# .github/workflows/test.yml
# Triggers: push to any branch, PR to master

Steps:
1. Checkout code
2. Start PostgreSQL service container (port 5433)
3. Install dependencies (npm ci)
4. Run migrations against test DB
5. npm run test (unit + integration)
6. npm run test:smoke (API endpoint tests)
7. npx playwright test (E2E, headless)
8. Upload test results + screenshots as artifacts
9. Fail the workflow if any step fails
```

### Vercel Integration

- Tests must pass before deploy (GitHub check required on master)
- Preview deployments still deploy freely (for manual testing)

---

## Test Infrastructure Setup

### Docker Test Database

Extend existing `docker-compose.yml`:
- New service: `db-test` on port 5433
- PostgreSQL 16-alpine (matches production)
- Init script runs all 14 migrations on first start
- Volume: `pgdata-test` (separate from dev data)

### Environment

New file: `.env.test`
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bal_test
JWT_SECRET=test-secret
```

### Vitest Config Updates

- Add `coverage` configuration (v8 provider)
- Add `test:smoke` and `test:audit` scripts to package.json
- Separate config files if needed for different test types

### Playwright Config

- `playwright.config.js` in project root
- Chromium only (fastest, sufficient for bug hunting)
- Base URL: `http://localhost:5173`
- Timeout: 30s per test
- Retries: 1 (catch flakes)

---

## Manual Testing Checklist (for user)

These cannot be automated due to external service dependencies:

### WhatsApp Flows
- [ ] Send check-in message from test phone → verify time entry created
- [ ] Send check-out message → verify hours calculated correctly
- [ ] Send sick leave report → verify sick leave record created
- [ ] Send malformed message → verify bot responds with help text
- [ ] Send duplicate check-in → verify proper error response

### Cron Jobs
- [ ] Trigger nightly cron via curl → verify expected DB state changes
- [ ] Trigger morning cron → verify daily plan generation
- [ ] Trigger evening cron → verify anomaly detection runs

### Photo Upload
- [ ] Upload photo to extra job → verify stored in Supabase
- [ ] Upload oversized photo → verify proper error
- [ ] Upload non-image file → verify rejection

### PDF/Excel
- [ ] Generate monthly report PDF → verify correct data, formatting
- [ ] Generate timesheet → verify calculations match time entries
- [ ] Export analytics → verify Excel file opens correctly

---

## Parallelization Plan

### What runs in parallel (automated):
- Phase 1: All 6 code audit subagents run simultaneously
- Phase 2: API smoke tests run alongside Phase 1
- Phase 4: Independent bug fixes dispatched to parallel subagents

### What runs sequentially:
- Phase 3 (triage) depends on Phase 1+2 completing
- Phase 5 (E2E + CI) comes after Phase 4

### User-assisted parallelism:
When Phase 4 has many bugs to fix, user can run additional agent sessions. Prompts will be provided with:
- Exact bug description
- File locations to modify
- Test to write
- Expected output to bring back

---

## Success Criteria

1. All critical/high bugs from the audit are fixed and pinned with tests
2. Every API endpoint has at least a smoke test (auth check + happy path)
3. 6 E2E flows pass in Playwright
4. CI pipeline runs on every push and blocks broken deploys
5. Manual testing checklist completed and verified by user
