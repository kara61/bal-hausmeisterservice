# Bug Report — Systematic Audit

**Date:** 2026-03-27
**Scope:** Full system audit across 6 domains (staff/time, operations, financial, garbage, infrastructure, frontend)

## Summary

- Total findings: 126
- Critical: 7
- High: 26
- Medium: 50
- Low: 43

---

## Findings

### BUG-001: Webhook Twilio signature validation bypass — silent fallback to `true`
- **Severity:** Critical
- **Domain:** infra
- **Location:** `api/_handlers/webhook.js:18-20`
- **Description:** The Twilio signature validation has a silent fallback that skips verification entirely. If `twilio.validateRequest` is not a function (e.g., due to an import issue or library version mismatch), the code defaults to `true`, allowing any request through without signature validation. An attacker can forge webhook requests to impersonate workers, check in/out on their behalf, mark tasks as done, declare sick leave, or approve plans.
- **Impact:** Complete webhook authentication bypass. All bot-based operations (check-in, task completion, sick leave, plan approval) can be forged by anyone who can send HTTP requests to the webhook endpoint.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-002: Token accepted via query string — credential leakage in logs and referrer headers
- **Severity:** Critical
- **Domain:** infra (affects all domains)
- **Location:** `src/middleware/auth.js:10-11`, `src/middleware/auth.js:33-34`
- **Description:** Both `requireAuth` and `checkAuth` accept the JWT via `req.query.token`. Query-string tokens are recorded in server access logs, browser history, proxy logs, and Referer headers. Any person with access to server logs can replay the token. All API routes in every audited domain use these middleware functions.
- **Impact:** Full authentication bypass for any session token ever passed via URL. Workers' time records, salary data, sick-leave details, and all operational data become accessible to anyone with log access.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-003: Minijob hour cap uses 520 EUR wage limit but ignores the legal 538 EUR threshold (as of 2024)
- **Severity:** Critical
- **Domain:** staff
- **Location:** `src/services/hourBalance.js:29-31`
- **Description:** The cap for minijob workers is derived from `monthly_salary / hourly_rate` with no validation that `monthly_salary` respects the current legal Minijob ceiling (538 EUR/month as of January 2024). Old worker records with `monthly_salary = 520` produce a `minijobMax` that is too low, and hours actually worked within the legal limit are falsely flagged as surplus.
- **Impact:** Incorrect overtime/surplus calculation for all minijob workers; potential social-insurance liability if wages are reported incorrectly.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-004: Race condition in `recordPayout` — payout can exceed actual balance
- **Severity:** Critical
- **Domain:** staff
- **Location:** `src/services/hourBalance.js:81-93`
- **Description:** `recordPayout` issues an `INSERT ... ON CONFLICT DO UPDATE SET payout_hours = hour_balances.payout_hours + $4` without checking whether `payout_hours + new_amount <= surplus_hours`. Two concurrent payout requests for the same worker/month will both succeed, resulting in a total payout exceeding the available balance. No database-level constraint prevents `payout_hours > surplus_hours`.
- **Impact:** A worker could be paid out more hours than they have earned.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-005: Carry-over chain creates infinite duplicates across multiple runs
- **Severity:** Critical
- **Domain:** operations
- **Location:** `src/services/taskScheduling.js:107-135`
- **Description:** `carryOverTasks` marks originals as `carried_over` and inserts new rows on `toDate`, but there is no `carried_from_id` column in `task_assignments` (unlike `plan_assignments`). The duplicate check only tests `property_id + date`, not `task_description`. If called multiple times or chained (toDate becomes next fromDate), tasks propagate indefinitely.
- **Impact:** Properties accumulate multiple pending rows for the same task across many days, producing duplicate WhatsApp notifications, double-counting in reports, and worker confusion.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-006: `postponeTask` crashes with unguarded `.property_id` access when task not found
- **Severity:** Critical
- **Domain:** operations
- **Location:** `src/services/taskScheduling.js:138-160`
- **Description:** `postponeTask` runs the UPDATE without first verifying the task exists. If the `id` does not exist, `rows[0]` is `undefined`, and `task.property_id` throws `TypeError`. The uncaught exception returns a generic 500 with no indication the task ID was invalid. The postponed row for the new date is never created.
- **Impact:** Callers receive an opaque 500 instead of a 404; postponement is silently dropped.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-007: Webhook signature validation skipped when `NODE_ENV === 'test'`
- **Severity:** Critical
- **Domain:** infra
- **Location:** `api/_handlers/webhook.js:11`
- **Description:** When `NODE_ENV === 'test'`, the entire Twilio signature validation block is skipped. If `NODE_ENV` is accidentally set to `'test'` in production, all webhook authentication is disabled. Combined with BUG-001, this creates a secondary bypass path.
- **Impact:** Complete bypass of webhook authentication in production if the environment variable is misconfigured.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

---

### BUG-008: `deductVacation` silently falls back to current year when year is NULL
- **Severity:** High
- **Domain:** staff
- **Location:** `src/services/sickLeave.js:81`
- **Description:** `deductVacation(client, workerId, days, year = null)` defaults to `new Date().getFullYear()` when `year` is omitted. The `status === 'overridden'` branch does not pass `year`. A sick leave from December overridden in January deducts vacation from the wrong year's balance.
- **Impact:** Vacation balance corruption across year boundaries.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-009: `adjustSickLeave` does not validate that `aok_approved_days <= declared_days`
- **Severity:** High
- **Domain:** staff
- **Location:** `src/services/sickLeave.js:33-34`
- **Description:** `remainingDays = sl.declared_days - aokApproved` can be negative if `adjustments.aok_approved_days` exceeds `declared_days`. The resulting record has totals (aok_approved + vacation_deducted + unpaid) that do not equal declared_days.
- **Impact:** Inconsistent sick-leave records; downstream reporting is corrupted.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-010: Vacation POST endpoint — no input validation on `worker_id`, `year`, or `entitlement_days`
- **Severity:** High
- **Domain:** staff
- **Location:** `api/_handlers/vacation/index.js:27-30`
- **Description:** All three fields can be `undefined`, `null`, non-numeric strings, or negative numbers. Passing `undefined` to the SQL query causes a PostgreSQL driver error that leaks a raw error message. Negative `entitlement_days` would silently store a nonsensical entitlement.
- **Impact:** Unhandled 500 errors on malformed requests; potential storage of invalid vacation entitlements.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-011: December syncs silently broken — `month` string vs number comparison
- **Severity:** High
- **Domain:** staff
- **Location:** `api/_handlers/hour-balances/sync.js:9-13`
- **Description:** `year` and `month` are not coerced to integers. Inside `syncMonthForAll`, `month === 12` uses strict equality; if `month` arrives as the string `"12"`, the comparison is `false`, generating an incorrect `endDate` of `"2024-13-01"`. The SQL date filter returns zero rows and all workers' December surplus hours are zeroed out.
- **Impact:** All workers' December surplus hours are silently zeroed.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-012: Time entries parameter index arithmetic fragile when only `month` or `year` supplied
- **Severity:** High
- **Domain:** staff
- **Location:** `api/_handlers/time-entries/index.js:18-24`
- **Description:** The parameter index is computed from `params.length` after pushing both values. `month=0` silently returns empty result set without a 400 error. No validation that `month` is 1-12.
- **Impact:** Silent wrong-result queries; `month=0` silently returns empty results.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-013: Timezone inconsistency between `taskScheduling.js` and `weekly-planner/index.js`
- **Severity:** High
- **Domain:** operations
- **Location:** `src/services/taskScheduling.js:33-35` vs `api/_handlers/weekly-planner/index.js:157-158`
- **Description:** `shouldTaskRunOnDate` constructs dates with `new Date(year, month-1, day)` (local time), while the weekly-planner forecast uses `new Date(dateStr + 'T00:00:00Z')` and `.getUTCDay()` (UTC). The biweekly calculation also mixes UTC and local time. In non-UTC timezones, weekday calculations disagree.
- **Impact:** Properties assigned to a given weekday appear on the wrong day in the weekly planner forecast or are missed entirely. Biweekly tasks may run on the wrong cycle.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-014: `generateDraftPlan` is not idempotent — concurrent calls create duplicate assignments
- **Severity:** High
- **Domain:** operations
- **Location:** `src/services/planGeneration.js:43-174`
- **Description:** The existence check and INSERT are not wrapped in a transaction or protected with a unique constraint. Two simultaneous POSTs for the same date create duplicate plans or half-populated plans with no rollback.
- **Impact:** Duplicate plans or partial plans; workers receive multiple or conflicting assignment notifications.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-015: `redistributeSickWorkers` only reassigns `worker_role = 'field'` — cleaning roles left unhandled
- **Severity:** High
- **Domain:** operations
- **Location:** `src/services/planGeneration.js:266-276`
- **Description:** The replacement worker pool query hardcodes `w.worker_role = 'field'`. If a sick worker has role `'cleaning'`, their assignments are found but `findBestWorkerForProperty` returns `null` from the empty cleaning pool, and the task is silently skipped.
- **Impact:** Cleaning tasks for sick workers are never redistributed. Properties go uncleaned; supervisors are not alerted.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-016: `carryOverPlanTasks` re-uses `assignment_order` from source plan without renumbering
- **Severity:** High
- **Domain:** operations
- **Location:** `src/services/planGeneration.js:383-395`
- **Description:** Carried-over assignments are inserted with `assignment_order` copied verbatim. If the target plan already has assignments, duplicate `assignment_order` values exist within the same `daily_plan_id`.
- **Impact:** Worker dispatch order becomes unpredictable; UI displays tasks in wrong sequence.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-017: `approvePlan` hardcodes `approvedBy = 'halil'`
- **Severity:** High
- **Domain:** operations
- **Location:** `api/_handlers/daily-plans/approve.js:16`
- **Description:** The call always records the approver as `'halil'`, ignoring `req.user`. Any user with a valid JWT can approve a plan, and it will always appear to have been approved by 'halil'.
- **Impact:** Audit trail is corrupted. There is no accountability for who actually approved plans.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-018: `getAlerts` flagged-entry query missing date filter — leaks historical alerts
- **Severity:** High
- **Domain:** operations
- **Location:** `src/services/commandCenter.js:174-178`
- **Description:** The flagged time entries query has no date filter. It returns up to 10 unresolved flagged entries from any date in history, ignoring the `dateStr` parameter.
- **Impact:** Dashboard always shows old, stale alerts from past days. High-volume operations will bury today's alerts under old ones.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-019: No date-format validation on any handler that accepts `date` or `new_date`
- **Severity:** High
- **Domain:** operations
- **Location:** `api/_handlers/daily-plans/index.js:22`, `api/_handlers/tasks/carryover.js:9`, `api/_handlers/tasks/postpone.js:9`, `api/_handlers/plan-assignments/[id]/postpone.js:13`
- **Description:** Every handler checks for presence but none validate format or range. `"not-a-date"`, `"2024-02-30"`, or `"99999-01-01"` propagate into PostgreSQL causing unhandled cast errors (500). Postponements to past dates create immediately-missed tasks.
- **Impact:** Malformed input causes 500 errors; postponements to past dates create immediately-overdue tasks.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-020: Division by zero if `hourly_rate` is 0 in timesheet generation
- **Severity:** High
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:110`
- **Description:** `Number(monthlySalary) / Number(hourlyRate)` produces `Infinity` or `NaN` when `hourlyRate` is `0`, `null` coerced to 0, or an empty string. This propagates through work-day distribution.
- **Impact:** Corrupted timesheet PDFs, potential infinite loop in day distribution.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-021: Sick leave query misses cross-month spans in salary reports
- **Severity:** High
- **Domain:** financial
- **Location:** `src/services/pdfReport.js:38-42`
- **Description:** `WHERE EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2` — a sick leave starting March 28 with 10 declared days extends into April, but this query only returns it for March. The April report misses the worker's sick days entirely.
- **Impact:** Monthly salary reports undercount sick days for cross-month absences, leading to incorrect payroll calculations.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-022: Falsy-zero bug in `aok_approved_days` — AOK rejection ignored
- **Severity:** High
- **Domain:** financial
- **Location:** `src/services/pdfReport.js:59`
- **Description:** `s.aok_approved_days || s.declared_days` — if `aok_approved_days` is explicitly `0` (AOK approved zero days), `0 || s.declared_days` falls through to `declared_days`, overcounting sick days.
- **Impact:** Worker shown as having sick days when AOK approved none, affecting salary calculation.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-023: Report delete handler uses wrong storage path — PDFs orphaned
- **Severity:** High
- **Domain:** financial
- **Location:** `api/_handlers/reports/[id]/index.js:32`
- **Description:** The delete handler uses zero-padded month number (e.g., `03`) while the generator uses German month name (e.g., `Maerz`). The Supabase `remove()` call targets a non-existent path, leaving the PDF orphaned.
- **Impact:** Deleted reports remain in Supabase storage indefinitely, accumulating storage costs.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-024: `generateGarbageTasks` has no transaction — race condition causes duplicate text
- **Severity:** High
- **Domain:** garbage
- **Location:** `src/services/garbageScheduling.js:84-118`
- **Description:** Multiple queries (check existence, update task_assignment description, insert garbage_task) run without a transaction. If the cron fires twice, `ON CONFLICT DO NOTHING` prevents duplicate garbage_task rows but the task_assignment description gets garbage text appended twice.
- **Impact:** Duplicate text in task descriptions shown to field workers (e.g., "gelb Tonnen raus, gelb Tonnen raus").
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-025: `deleteScheduleForProperty` orphans related `garbage_tasks`
- **Severity:** High
- **Domain:** garbage
- **Location:** `src/services/garbageScheduling.js:202-214`
- **Description:** Deleting garbage schedules doesn't cascade to `garbage_tasks` that reference them via `garbage_schedule_id`. Orphaned garbage_tasks point to non-existent schedules.
- **Impact:** Orphaned tasks may cause errors in task listing queries or confuse workers with ghost tasks.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-026: No JWT secret validation at startup
- **Severity:** High
- **Domain:** infra
- **Location:** `src/config.js:4`
- **Description:** `config.jwtSecret` is read from `process.env.JWT_SECRET` with no default and no validation. If missing, `jwt.verify()` receives `undefined`, causing auth to always fail (denial of service) or potentially accept any token depending on library version.
- **Impact:** Complete auth failure or bypass if JWT_SECRET is unset.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-027: No admin password hash validation at startup
- **Severity:** High
- **Domain:** infra
- **Location:** `api/_handlers/auth/login.js:15`, `src/config.js:14`
- **Description:** If `ADMIN_PASSWORD_HASH` is unset, `bcrypt.compare(password, undefined)` throws. If set to an empty string, behavior is unpredictable.
- **Impact:** Login completely broken with no clear error message if env var is missing.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-028: Bot plan approval relies on phone number comparison — bypassable with BUG-001
- **Severity:** High
- **Domain:** infra
- **Location:** `src/services/bot.js:263, 273`
- **Description:** Plan approval and edit commands are authorized by comparing the sender's phone number to `config.halilWhatsappNumber`. Combined with BUG-001 (signature bypass), an attacker could approve or modify daily plans by forging a webhook request with Halil's phone number.
- **Impact:** Unauthorized plan approval and modification if webhook signature validation is bypassed.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-029: Workers page has uncaught API error on initial load
- **Severity:** High
- **Domain:** frontend
- **Location:** `client/src/pages/Workers.jsx:21-24`
- **Description:** `loadWorkers` does not have a try/catch. If the API call fails, the promise rejection is unhandled and no error is shown to the user.
- **Impact:** Unhandled promise rejection causes silent failure; user sees empty table with no explanation.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-030: useEffect missing dependency arrays cause stale closures across 11 pages
- **Severity:** High
- **Domain:** frontend
- **Location:** `client/src/pages/TimeEntries.jsx:35`, `client/src/pages/DailyPlan.jsx:23-26`, `client/src/pages/Workers.jsx:27`, and 8 other pages
- **Description:** Multiple `useEffect` hooks call async functions that close over state (e.g., `month`, `year`, `date`) but do not include the async function or relevant state in the dependency array.
- **Impact:** Stale closure bugs where fetched data does not correspond to current UI state.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-031: Client-side date construction with `toISOString()` produces wrong date in CET timezone
- **Severity:** High
- **Domain:** frontend
- **Location:** `client/src/pages/DailyPlan.jsx:14`, `client/src/pages/DailyOperations.jsx:6-7`, `client/src/pages/DailyTasks.jsx:6-8`, `client/src/pages/Dashboard.jsx:7`, `client/src/pages/CommandCenter.jsx:20`
- **Description:** `new Date().toISOString().slice(0,10)` converts to UTC. For a user in CET (UTC+1/+2) after midnight but before 01:00/02:00 UTC, this returns yesterday's date.
- **Impact:** Users see the wrong day's data around midnight. Daily plans, tasks, and operations show stale data.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-032: Analytics export opens URL without authentication header
- **Severity:** High
- **Domain:** frontend
- **Location:** `client/src/pages/Analytics.jsx:89-93`
- **Description:** `handleExport` uses `window.open(url, '_blank')` which does not include the Bearer token. The export endpoint will return 401, making the feature non-functional.
- **Impact:** Analytics export feature is broken unless server has a separate auth mechanism.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-033: Reports download exposes JWT token in URL
- **Severity:** High
- **Domain:** frontend
- **Location:** `client/src/pages/Reports.jsx:66-68, 70-72`
- **Description:** `handleDownload` and `handleDownloadTimesheet` pass the JWT token as a query parameter in `window.open()`. This token is logged in browser history, server access logs, and proxy logs.
- **Impact:** Token leakage via URL; attacker with access to browser history or server logs can impersonate the user.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

---

### BUG-034: `calculateDailyHours` returns NaN for unparseable timestamps
- **Severity:** Medium
- **Domain:** staff
- **Location:** `src/services/timeCalculation.js:5-9`
- **Description:** `new Date('garbage') - new Date('garbage')` produces `NaN`, which pollutes the monthly total, making the entire month's surplus calculation return `NaN`.
- **Impact:** Corrupt hour-balance records (stored as `NaN` -> `NULL` in Postgres) for months containing any malformed timestamp.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-035: Negative duration not guarded — check_out before check_in
- **Severity:** Medium
- **Domain:** staff
- **Location:** `src/services/timeCalculation.js:7-8`
- **Description:** If `checkOut < checkIn`, `diffMs` is negative, and the function returns negative hours. This negative value flows into surplus calculations where `official = totalHours` (a negative number).
- **Impact:** Negative hours silently reduce a worker's monthly total, leading to under-reported work hours.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-036: Worker creation inserts before duplicate-name check
- **Severity:** Medium
- **Domain:** staff
- **Location:** `api/_handlers/workers/index.js:32-44`
- **Description:** The worker is INSERTed first, then a SELECT checks for duplicate names. Two concurrent POSTs for the same name will both succeed with neither seeing the warning.
- **Impact:** Duplicate worker names with no enforced uniqueness; operational confusion in assignments and reports.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-037: `workers/role.js` — `futureCount` may be undefined in response
- **Severity:** Medium
- **Domain:** staff
- **Location:** `api/_handlers/workers/role.js:34-39`
- **Description:** `futureCount` is declared inside a conditional block. If future refactoring separates the query blocks, `future_assignment_count` would be `undefined` in the response.
- **Impact:** Latent structural risk; `future_assignment_count` would be `undefined` if block structure is refactored.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-038: Unvalidated `status` filter parameter in sick-leave listing
- **Severity:** Medium
- **Domain:** staff
- **Location:** `api/_handlers/sick-leave/index.js:22-24`
- **Description:** `status` query parameter is passed directly to SQL with no validation against known enum values. Unexpected values silently return zero rows instead of a 400 error.
- **Impact:** Silent empty results instead of explicit errors.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-039: Vacation entitlement pro-rata rule gives full 2 days for month of registration
- **Severity:** Medium
- **Domain:** staff
- **Location:** `src/services/vacation.js:18-23`
- **Description:** The binary 2/1 day split per month does not scale by actual days present. Under German Mindesturlaub law the pro-rata calculation is typically `(full_year_entitlement / 12)` per month, rounded up.
- **Impact:** Vacation entitlement miscalculation for workers who join mid-month.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-040: `payout_hours` assumed non-null — `Number(undefined)` produces NaN total
- **Severity:** Medium
- **Domain:** staff
- **Location:** `src/services/hourBalance.js:70-72`
- **Description:** `Number(undefined)` = `NaN`. If the database schema changes or a row is corrupt and `surplus_hours` or `payout_hours` is missing, the entire worker balance collapses to `NaN`.
- **Impact:** Silent `NaN` balance for a worker if schema changes or row is corrupt.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-041: `plan-assignments/[id].js` — status update accepts arbitrary status strings
- **Severity:** Medium
- **Domain:** operations
- **Location:** `api/_handlers/plan-assignments/[id].js:15-23`
- **Description:** The status-update branch accepts `status` from `req.body` with no allowlist check. Any string can be stored, corrupting dashboard aggregations, carry-over logic, and `deriveWorkerStatus`.
- **Impact:** Database rows with invalid status values corrupt dashboard and automated workflows.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-042: `getWorkerFlowState` returns `allDone = false` when worker has zero visits
- **Severity:** Medium
- **Domain:** operations
- **Location:** `src/services/accountabilityFlow.js:141`
- **Description:** `allDone` is `visits.length > 0 && visits.every(...)`. Workers with no visits (sick day, unassigned) return `allDone: false`, incorrectly suggesting unfinished work.
- **Impact:** Command center or accountability notifications may incorrectly follow up with workers who have no scheduled visits.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-043: `markCompleted` does not guard against completing a visit never marked as arrived
- **Severity:** Medium
- **Domain:** operations
- **Location:** `src/services/accountabilityFlow.js:83-101`
- **Description:** No status guard prevents completion of a visit in `'assigned'` state. `arrived_at` may be NULL, causing `duration_minutes = NULL`. Workers can skip the "arrived" step, bypassing time-tracking and on-site accountability.
- **Impact:** Duration tracking is silently wrong (NULL); accountability checks are bypassed; `formatDaySummary` produces "NaNh NaNm".
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-044: `formatDaySummary` does not guard against null timestamps
- **Severity:** Medium
- **Domain:** operations
- **Location:** `src/services/accountabilityFlow.js:20`
- **Description:** `new Date(null) - new Date(null)` produces `NaN`. `totalH` and `totalM` also become `NaN`, and the summary string contains "NaNh NaNm".
- **Impact:** Workers receive malformed summary messages.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-045: `shouldTaskRunOnDate` biweekly branch — negative `diffWeeks` causes incorrect scheduling
- **Severity:** Medium
- **Domain:** operations
- **Location:** `src/services/taskScheduling.js:48-52`
- **Description:** If `biweekly_start_date` is in the future, `diffMs` is negative. `-2 % 2 === 0` in JavaScript, so dates before the start date are incorrectly evaluated as "active" for a biweekly task.
- **Impact:** Tasks are generated for dates prior to when the schedule was supposed to begin.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-046: Weekly planner `getHistoryTasks` date-key extraction uses `new Date()` without UTC forcing
- **Severity:** Medium
- **Domain:** operations
- **Location:** `api/_handlers/weekly-planner/index.js:61, 93`
- **Description:** `toDateStr(new Date(row.plan_date))` creates Date objects from PostgreSQL values without forcing UTC. If the column is `timestamp` or `timestamptz`, the local conversion can shift the date by one day in UTC- timezones.
- **Impact:** History tasks appear on the wrong day in the planner (one day off) in UTC- server environments.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-047: `generateDraftPlan` — zero available workers yields empty plan with no warning
- **Severity:** Medium
- **Domain:** operations
- **Location:** `src/services/planGeneration.js:81, 148-153`
- **Description:** If all workers are sick or absent, the function returns a plan with zero assignments and no indication that workers are missing.
- **Impact:** Supervisors may not notice that a generated plan is empty, missing an alert that all tasks need manual reassignment.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-048: Command center date defaults to UTC not local time
- **Severity:** Medium
- **Domain:** operations
- **Location:** `api/_handlers/command-center/index.js:12`
- **Description:** `new Date().toISOString().split('T')[0]` yields UTC date. In Germany (UTC+1/UTC+2), after midnight local but before midnight UTC, users see the previous day's data.
- **Impact:** Command center shows yesterday's data for the first 1-2 hours of each new business day in Germany.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-049: `formatClockTime` / `formatDuration` can produce "X:60"
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:27-38`
- **Description:** `Math.round((decimalHours - h) * 60)` can produce `60` when the fractional part is very close to 1.0 (e.g., `7.999` -> `"7:60"`).
- **Impact:** Invalid time strings appear on PDF timesheets; confusing for payroll processing.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-050: Last-day timesheet hours can go negative
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:130-135`
- **Description:** Rounding to nearest 0.5h on earlier days can cause cumulative drift. The correction on the last day compensates, but if rounding pushed earlier days above the total, the last day gets negative hours.
- **Impact:** A timesheet day could show negative work hours, producing an invalid PDF entry.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-051: `generateTimesheets` is not atomic — partial generation state
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:237-289`
- **Description:** The loop over workers uploads PDFs and upserts DB records one at a time. If worker 3 of 5 fails, workers 1-2 have timesheets while 3-5 do not. No rollback.
- **Impact:** Partial generation state with no indication of which workers succeeded.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-052: Null propagation in `vacation_deducted_days` and `unpaid_days` in reports
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/pdfReport.js:60-61`
- **Description:** Adding `null` to a number produces `NaN`, which then appears in the PDF report as "NaN T".
- **Impact:** Corrupted report display.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-053: No overtime multiplier in cost calculation
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/analytics.js:113`
- **Description:** `overtimeCost = overtimeHours * r.hourly_rate` uses the base rate. German labor law typically requires overtime at 1.25x-1.5x. Cost analytics underreport actual labor costs.
- **Impact:** Cost reports and utilization metrics are systematically too low for workers with overtime.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-054: `computeDailyAnalyticsForDate` DELETE+INSERT not in transaction
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/analytics.js:177-196`
- **Description:** DELETE followed by individual INSERTs is not wrapped in a transaction. Concurrent cron invocations or crashes mid-insert cause analytics data loss.
- **Impact:** Missing analytics data for certain dates; silent data loss.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-055: `computePropertyMonthlyForMonth` same non-transactional pattern
- **Severity:** Medium
- **Domain:** financial
- **Location:** `src/services/analytics.js:282-301`
- **Description:** Same DELETE+INSERT-without-transaction as BUG-054. Concurrent calls or crashes leave `analytics_property_monthly` empty for that month.
- **Impact:** Missing analytics data; silent data loss.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-056: Timesheet DELETE handler uses fragile regex for storage path
- **Severity:** Medium
- **Domain:** financial
- **Location:** `api/_handlers/timesheets/[id].js:29`
- **Description:** `ts.pdf_path.match(/\/photos\/(.+)$/)` extracts the storage path from the public URL. If Supabase URL format changes, the regex fails silently and the PDF is orphaned.
- **Impact:** Storage leak — deleted timesheets leave PDFs in Supabase.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-057: Task description appending has no deduplication in garbage scheduling
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `src/services/garbageScheduling.js:147-149`
- **Description:** If a task_assignment already contains a garbage description and the function runs again, it appends the same text again without checking for duplicates.
- **Impact:** Cluttered task descriptions confuse field workers.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-058: `DOMMatrix` polyfill is incomplete — AWP parser may crash on complex PDFs
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:57-63`
- **Description:** The stub only implements the constructor. `pdfjs-dist` may call `multiply()`, `inverse()`, `translate()`, `scale()` during certain PDF rendering, causing `TypeError`.
- **Impact:** Certain PDF layouts (rotated pages, scaled content) crash the parser.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-059: No error handling for corrupted/encrypted PDFs in AWP parser
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:82`
- **Description:** If the uploaded file is corrupted, not a PDF, or password-protected, `getDocument` throws and propagates as a generic 500 with no useful feedback.
- **Impact:** User gets no useful feedback about why their PDF upload failed.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-060: Column X-position detection is fragile — hardcoded positions for AWP PDF layout
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:15-20`
- **Description:** Hardcoded column positions are specific to the current AWP PDF layout. If AWP changes their PDF generator, all dates silently fail to match and are dropped.
- **Impact:** Silent data loss after AWP layout changes. Uploaded PDFs appear to contain no dates.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-061: Upload handler ILIKE query vulnerable to SQL wildcard injection
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/upload.js:53`
- **Description:** The `candidate` value from PDF text is wrapped in `%...%` but `%` and `_` metacharacters are not escaped. A filename containing `%` could match unintended properties.
- **Impact:** PDF could be auto-matched to wrong property, importing garbage schedules for the wrong building.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-062: Upload handler doesn't validate file is actually a PDF
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/upload.js:16-19`
- **Description:** Only checks if a file exists in the `pdf` field, not that it's actually a PDF. Non-PDF uploads cause cryptic pdfjs-dist errors.
- **Impact:** Confusing error messages for non-PDF uploads.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-063: Garbage map handler doesn't validate `dates` array contents
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/map.js:9`
- **Description:** The `dates` array is passed directly to `importScheduleFromPdf`. Missing fields cause PostgreSQL errors that leak column names. Malformed dates are inserted without validation.
- **Impact:** Bad data in `garbage_schedules` table; confusing DB error messages.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-064: Timezone mismatch between server and business timezone in garbage scheduling
- **Severity:** Medium
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/upcoming.js:14`, `src/services/garbageScheduling.js:84-88`
- **Description:** `upcoming.js` uses `CURRENT_DATE` (PostgreSQL server time) while `generateGarbageTasks` uses JavaScript `new Date()` (serverless function time). Around midnight CET/CEST, "today" and "tomorrow" definitions can diverge.
- **Impact:** Garbage bins put out on wrong day — operational failure.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-065: DB pool has no connection limits or timeout configuration
- **Severity:** Medium
- **Domain:** infra
- **Location:** `src/db/pool.js:4-9`
- **Description:** The `pg.Pool` is created with only `connectionString` and `ssl` options. No `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or `statement_timeout` configured. Under load, the pool can be exhausted.
- **Impact:** Pool exhaustion and total service failure under load.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-066: SSL configuration uses `rejectUnauthorized: false`
- **Severity:** Medium
- **Domain:** infra
- **Location:** `src/db/pool.js:6-8`
- **Description:** SSL is configured with `rejectUnauthorized: false`, disabling certificate verification. Vulnerable to man-in-the-middle attacks.
- **Impact:** Database traffic can be intercepted and modified.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-067: Photo storage has no error handling for Twilio download failure
- **Severity:** Medium
- **Domain:** infra
- **Location:** `src/services/photoStorage.js:19-26`
- **Description:** The `fetch()` call to download from Twilio does not check the HTTP response status. Error response bodies (HTML/JSON) are uploaded as "photos" to Supabase.
- **Impact:** Corrupted or invalid files stored as photos; broken images in dashboard and reports.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-068: Notification failures silently crash core business operations
- **Severity:** Medium
- **Domain:** infra
- **Location:** `src/services/notifications.js`, `src/services/taskNotifications.js`, `src/services/planNotifications.js`
- **Description:** Notification functions have no try/catch. If `sendWhatsAppMessage` throws, the error propagates to the caller, causing business-critical operations (sick leave recording, task completion) to fail even though the DB operations succeeded.
- **Impact:** Twilio outage or rate limit causes all bot-driven business operations to fail.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-069: Config missing Halil WhatsApp number causes silent failures
- **Severity:** Medium
- **Domain:** infra
- **Location:** `src/config.js:12`, `src/services/notifications.js:6-9`
- **Description:** If `HALIL_WHATSAPP_NUMBER` is unset, every notification to Halil will fail when Twilio rejects the empty recipient.
- **Impact:** All admin notifications (sick leave, missing checkouts, anomalies) silently fail. Halil is unaware of operational issues.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-070: Router dynamic route parameters not sanitized
- **Severity:** Medium
- **Domain:** infra
- **Location:** `api/index.js:234-243`
- **Description:** Dynamic route parameters are extracted via regex and injected directly into `req.query` without type validation. Non-integer IDs passed to handlers expecting integers cause unexpected errors.
- **Impact:** Unexpected errors from malformed route parameters; potential SQL injection if any handler uses string concatenation.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-071: DailyPlan and DailyOperations fetch ALL plans then filter client-side
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/DailyPlan.jsx:32-36`, `client/src/pages/DailyOperations.jsx:40-44`
- **Description:** Both pages call `api.get('/daily-plans')` to fetch all plans, then iterate to find the one matching the selected date. This is O(n) on all plans.
- **Impact:** Performance degrades as plan count grows; unnecessary network bandwidth.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-072: `confirm()` and `prompt()` used for user interactions
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/GarbageSchedule.jsx:199,210`, `client/src/pages/Workers.jsx:50`, and 5 other pages
- **Description:** Native `confirm()` and `prompt()` block the main thread, cannot be styled, and do not support i18n. They may be blocked by some browsers.
- **Impact:** Poor UX, accessibility issues, and no ability to cancel in-flight operations.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-073: Login form has no loading/disabled state during submission
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/Login.jsx:14-23, 57`
- **Description:** No `disabled` state while login request is in-flight. Users can click submit multiple times.
- **Impact:** Multiple concurrent login requests; confusing UX on slow networks.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-074: CommandCenter uses `window.open` with `_self` instead of React Router navigation
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/CommandCenter.jsx:44-52`
- **Description:** `window.open('/sick-leave', '_self')` causes a full page reload instead of SPA navigation.
- **Impact:** Full page reload loses all React state, causes unnecessary flicker.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-075: PropertyForm task list uses array index as key (dynamic list)
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/components/PropertyForm.jsx:136`
- **Description:** `tasks.map((task, i) => <div key={i}>...)` uses index as key for a dynamic, reorderable list. React will incorrectly reuse DOM nodes when tasks are added or removed.
- **Impact:** Input values appear in wrong rows or state corruption when tasks are added/removed.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-076: WeeklyPlanner task list uses array index as key
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/WeeklyPlanner.jsx:376`
- **Description:** Same index-as-key issue as BUG-075. If tasks are reordered or filtered, DOM reconciliation produces incorrect results.
- **Impact:** Incorrect DOM reconciliation when tasks change.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-077: No loading state for initial data fetch on several pages
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/Workers.jsx`, `client/src/pages/Properties.jsx`, `client/src/pages/SickLeave.jsx`, `client/src/pages/ExtraJobs.jsx`
- **Description:** These pages have no `loading` state. The table renders immediately with zero rows, then data appears.
- **Impact:** Users briefly see "no data" empty state before data loads, creating a confusing flash.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-078: Empty catch blocks silently swallow errors
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/DailyOperations.jsx:62`, `client/src/pages/DailyPlan.jsx:55-56`, `client/src/pages/WeeklyPlanner.jsx:87`
- **Description:** Empty `catch {}` blocks swallow API failures. If the workers endpoint is down, the reassign dropdown is empty with no indication why.
- **Impact:** API failures are silent; critical UI elements may be empty with no error indication.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-079: Accessibility — form inputs missing labels
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/Login.jsx:39-55`
- **Description:** Login form inputs use `placeholder` text but have no `<label>` elements or `aria-label` attributes. Fails WCAG 2.1 Level A.
- **Impact:** Screen readers cannot identify the purpose of input fields.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-080: Accessibility — interactive elements missing accessible names
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/DailyOperations.jsx:177-183`, `client/src/pages/WeeklyPlanner.jsx:211-219`, `client/src/components/Layout.jsx:141-165`
- **Description:** Icon-only buttons lack `aria-label` attributes. Screen readers announce them as empty or "button".
- **Impact:** Not navigable for users with assistive technology.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-081: API client returns `undefined` on 401
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/api/client.js:14-18`
- **Description:** On 401, the function removes the token, redirects, and returns `undefined`. Calling code that awaits the result and accesses properties will throw a TypeError before the redirect takes effect.
- **Impact:** Downstream code may throw TypeError before redirect occurs.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-082: GarbageSchedule upload bypasses API client
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/GarbageSchedule.jsx:144-156`
- **Description:** File upload handler directly uses `fetch()` with manual token retrieval from `localStorage`, bypassing the API client's 401 redirect handler.
- **Impact:** If token is expired, user sees a raw error instead of being redirected to login.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-083: SickLeave edit form uses `parseInt` without fallback for empty input
- **Severity:** Medium
- **Domain:** frontend
- **Location:** `client/src/pages/SickLeave.jsx:126, 131, 136`
- **Description:** `parseInt('')` returns `NaN`, which is sent to the API. Clearing a number input sends NaN values.
- **Impact:** API receives `NaN` values which may cause server-side errors or corrupt data.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

---

### BUG-084: `joker` role allowed but error message says only field/cleaning/office
- **Severity:** Low
- **Domain:** staff
- **Location:** `api/_handlers/workers/index.js:27-29`, `api/_handlers/workers/[id].js:31-33`
- **Description:** Both POST and PUT accept `'joker'` as valid but the error message omits it.
- **Impact:** API consumers reading the error message would not know `joker` is valid.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-085: `payout_hours` truthiness check rejects legitimate zero-hour payouts
- **Severity:** Low
- **Domain:** staff
- **Location:** `api/_handlers/hour-balances/payout.js:10`
- **Description:** `!payout_hours` rejects a value of `0`. A zero payout correction entry would be rejected.
- **Impact:** Low practical risk (zero payouts are rare), but error message is misleading.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-086: `FULLTIME_MONTHLY_HOURS` is hardcoded at 173.2
- **Severity:** Low
- **Domain:** staff
- **Location:** `src/services/timeCalculation.js:1`
- **Description:** The cap is applied uniformly to all full-time workers regardless of contracted weekly hours (e.g., 40 h/week vs 38.5 h/week).
- **Impact:** Workers with non-standard full-time contracts have overtime calculated against the wrong cap.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-087: `HARCIRAH_AMOUNT` is hardcoded at 14 EUR
- **Severity:** Low
- **Domain:** staff
- **Location:** `src/services/timeCalculation.js:3`
- **Description:** German tax-free per-diem rates change periodically. The threshold and amount are not configurable without a code change. No 24-hour tier for the full-day 28 EUR rate.
- **Impact:** If the legal rate changes, incorrect harcirah amounts are calculated, causing tax compliance issues.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-088: Numeric fields not coerced to numbers during worker PUT
- **Severity:** Low
- **Domain:** staff
- **Location:** `api/_handlers/workers/[id].js:26-29`
- **Description:** `hourly_rate`, `monthly_salary`, `vacation_entitlement` are not coerced or validated. Negative values or non-numeric strings are not rejected.
- **Impact:** Negative `hourly_rate` or `monthly_salary` would silently produce wrong surplus calculations.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-089: Setting `resolved = true` on time entry does not validate check_in/check_out exist
- **Severity:** Low
- **Domain:** staff
- **Location:** `api/_handlers/time-entries/[id].js:17-20`
- **Description:** A flagged entry can be marked resolved while still having a null `check_out`, contributing 0 hours to the monthly total via `calculateDailyHours`.
- **Impact:** Resolved entries with missing timestamps contribute zero hours; worker totals are understated.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-090: `carryOverTasks` inserts with potentially null `team_id` and overly broad duplicate check
- **Severity:** Low
- **Domain:** operations
- **Location:** `src/services/taskScheduling.js:127-133`
- **Description:** The duplicate check `WHERE property_id = $1 AND date = $2` skips insertion if any task for that property already exists, even for a different task type. A property with a garbage task would cause a service task carry-over to be silently dropped.
- **Impact:** Carried-over service tasks are silently lost when a property already has any other task type on the target date.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-091: Weekly planner only generates Mon-Fri — Saturday/Sunday tasks invisible
- **Severity:** Low
- **Domain:** operations
- **Location:** `api/_handlers/weekly-planner/index.js:19-26`
- **Description:** `getWeekDates` loops `for (let i = 0; i < 5; i++)` — always returning Monday through Friday only.
- **Impact:** Weekend tasks are silently omitted from the planner view.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-092: Task assigned without checking current status — completed tasks can be re-assigned
- **Severity:** Low
- **Domain:** operations
- **Location:** `api/_handlers/tasks/[id]/assign.js:13-17`
- **Description:** The UPDATE unconditionally overwrites `team_id` regardless of task status. Completed or postponed tasks can be re-assigned.
- **Impact:** Workers may receive assignment notifications for tasks already completed.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-093: Dead code — `vacationIds` is always empty in `generateDraftPlan`
- **Severity:** Low
- **Domain:** operations
- **Location:** `src/services/planGeneration.js:102-104`
- **Description:** `const vacationIds = []` with a TODO. Workers on vacation are never excluded from plan generation.
- **Impact:** Workers on vacation receive task assignments and WhatsApp notifications; tasks go unserviced.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-094: `approvedBy` field fetched but never included in command center response
- **Severity:** Low
- **Domain:** operations
- **Location:** `src/services/commandCenter.js:67, 129-138`
- **Description:** The SELECT fetches `approved_by` from `daily_plans` but the returned object omits it. The dashboard cannot show who approved the plan.
- **Impact:** Accountability feature partially broken; approver identity never surfaced.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-095: No month/year validation in timesheet/report generation
- **Severity:** Low
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:109`, `src/services/pdfReport.js:26`
- **Description:** `MONTH_NAMES[month - 1]` returns `undefined` for out-of-range months (0, 13, etc.), producing filenames like `Stundenzettel_Name_undefined_2026.pdf`.
- **Impact:** Broken filenames in Supabase storage; confusing PDF headers.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-096: `getPublicUrl` return value not null-checked
- **Severity:** Low
- **Domain:** financial
- **Location:** `src/services/timesheetGeneration.js:272-274`, `src/services/pdfReport.js:153-155`
- **Description:** If Supabase returns unexpected null `data`, destructuring throws `TypeError`. PDF is uploaded but DB record is never created.
- **Impact:** Unhandled crash during timesheet/report generation.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-097: No date format validation on analytics query params
- **Severity:** Low
- **Domain:** financial
- **Location:** `api/_handlers/analytics/index.js:13-14`
- **Description:** `from` and `to` are passed directly to SQL without format validation. Invalid date strings cause PostgreSQL errors leaking DB internals.
- **Impact:** 500 errors with leaked DB error messages.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-098: Report generation month/year not validated at API layer
- **Severity:** Low
- **Domain:** financial
- **Location:** `api/_handlers/reports/generate.js:12-13`
- **Description:** `parseInt("13")` passes validation and produces `MONTH_NAMES[12]` = `undefined`. Same for `month = 0`.
- **Impact:** Reports with broken filenames and headers.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-099: PDF footer overlaps table on multi-page reports
- **Severity:** Low
- **Domain:** financial
- **Location:** `src/services/pdfReport.js:138`
- **Description:** Footer placed at fixed y=780 regardless of table position. On multi-page reports the footer overlaps table data.
- **Impact:** Overlapping text on multi-page PDF reports.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-100: Report download redirects to unprotected public Supabase URL
- **Severity:** Low
- **Domain:** financial
- **Location:** `api/_handlers/reports/[id]/download.js:16`
- **Description:** `res.redirect(report.pdf_path)` — the public URL is not time-limited. Anyone with the URL can access salary reports without authentication.
- **Impact:** Salary reports accessible to anyone with the URL.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-101: Excel export silently omits Properties sheet if `month` missing
- **Severity:** Low
- **Domain:** financial
- **Location:** `api/_handlers/analytics/export.js:36`
- **Description:** If `month` query param is not provided, the Properties sheet is simply omitted with no indication.
- **Impact:** Users may not realize data is missing from export.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-102: `Content-Disposition` filename not RFC 5987 encoded
- **Severity:** Low
- **Domain:** financial
- **Location:** `api/_handlers/analytics/export.js:79`
- **Description:** Currently safe with date strings, but special characters in future format changes could break the header.
- **Impact:** Minor robustness concern.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-103: AWP parser `isValidDate` hardcodes default year 2024
- **Severity:** Low
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:40`
- **Description:** Default year `2024` is a leap year. If called without explicit year in the future, Feb 29 would be accepted for non-leap years.
- **Impact:** Currently no impact; future risk.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-104: `parseCollectionDates` (legacy) always assigns `restmuell`
- **Severity:** Low
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:148`
- **Description:** The legacy text-based parser assigns all dates as `restmuell` regardless of actual trash type. If this fallback path is triggered in production, it creates incorrect schedules.
- **Impact:** Incorrect garbage schedules if legacy parser is used.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-105: `DATE_REGEX` silently skips 2-digit year dates
- **Severity:** Low
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:23`
- **Description:** The optional year group `(\d{4})?` requires exactly 4 digits. Dates like "15.03.26" (2-digit year) fail the regex.
- **Impact:** If AWP uses 2-digit years in the future, those dates would be ignored.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-106: `schedule/[propertyId]` doesn't validate `propertyId` is numeric
- **Severity:** Low
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/schedule/[propertyId].js:11`
- **Description:** Non-numeric `propertyId` results in `parseInt` returning `NaN`. The query returns zero rows rather than a 400 error.
- **Impact:** Empty array instead of proper error for invalid property IDs.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-107: `upcoming.js` accepts 0 and negative `days` values
- **Severity:** Low
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/upcoming.js:9`
- **Description:** `days = 0` defaults to 7 (unexpected). Negative values produce past dates instead of upcoming ones.
- **Impact:** Unexpected behavior for edge-case input values.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-108: Upload handler doesn't use `withErrorHandler` wrapper
- **Severity:** Low
- **Domain:** garbage
- **Location:** `api/_handlers/garbage/upload.js:8`
- **Description:** Uses raw `async function handler` with manual try/catch instead of the standard `withErrorHandler` wrapper.
- **Impact:** Inconsistent error reporting; harder to debug upload failures.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-109: `extractAddressFromPdf` regex patterns are narrow
- **Severity:** Low
- **Domain:** garbage
- **Location:** `src/services/awpParser.js:166-169`
- **Description:** Regex requires first letter uppercase. Addresses like "am Hugel 7" or "von-der-Tann-Strasse 5" won't match.
- **Impact:** Auto-matching fails for certain addresses, requiring manual property mapping.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-110: Cron jobs accept GET and POST without method check
- **Severity:** Low
- **Domain:** infra
- **Location:** `api/_handlers/cron/nightly.js`, `api/_handlers/cron/morning.js`, `api/_handlers/cron/evening.js`
- **Description:** Cron handlers check Authorization header but accept any HTTP method.
- **Impact:** Minor — increases attack surface slightly.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-111: Nightly cron duplicates evening cron work
- **Severity:** Low
- **Domain:** infra
- **Location:** `api/_handlers/cron/nightly.js:39-41`, `api/_handlers/cron/evening.js:11-13`
- **Description:** Both cron handlers call `generateDraftPlan(tomorrow)` and `notifyHalilPlanReady(plan.id)`. If both run, duplicate plans and notifications may be created.
- **Impact:** Duplicate plans or wasted WhatsApp API quota.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-112: Health endpoint exposes no useful diagnostic information
- **Severity:** Low
- **Domain:** infra
- **Location:** `api/_handlers/health.js:1-3`
- **Description:** Returns `{ status: 'ok' }` without checking database, Twilio, or Supabase connectivity.
- **Impact:** Reports "ok" even when critical dependencies are down; useless for monitoring.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-113: WhatsApp template cache grows unbounded
- **Severity:** Low
- **Domain:** infra
- **Location:** `src/services/whatsapp.js:7, 60-62, 90`
- **Description:** The `templateCache` Map grows indefinitely. In warm serverless instances, this is a memory leak.
- **Impact:** Memory consumption grows over time.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-114: StatsBar uses array index as key
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/components/command-center/StatsBar.jsx:53`
- **Description:** Stats cards keyed by array index. If array order changes, React misidentifies elements.
- **Impact:** Minor — array is static per render.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-115: GarbageSchedule detail list uses array index as key
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/GarbageSchedule.jsx:473`
- **Description:** Read-only list uses index as key.
- **Impact:** Minimal in practice.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-116: Accessibility — SVG icons in nav items have no `aria-hidden`
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/components/Layout.jsx:11-89`
- **Description:** Inline SVG icons not marked `aria-hidden="true"`. Screen readers may try to announce them.
- **Impact:** Verbose and confusing screen reader output.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-117: Accessibility — tables lack `scope` attributes on headers
- **Severity:** Low
- **Domain:** frontend
- **Location:** All pages with `<table>` elements
- **Description:** Table header cells (`<th>`) do not have `scope="col"` attributes.
- **Impact:** Screen readers may not correctly associate headers with data cells.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-118: API client does not handle non-JSON success responses
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/api/client.js:21`
- **Description:** On successful responses, `res.json()` is called without a catch. DELETE responses returning 204 or empty bodies will throw parse errors.
- **Impact:** DELETE operations may cause parse errors.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-119: CommandCenter polling interval has no abort cleanup
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/CommandCenter.jsx:38-42`
- **Description:** `fetchData` updates state without checking if component is mounted. During unmount, a pending fetch could set state.
- **Impact:** Minor — React 18 removed the setState-on-unmounted warning. Theoretical race.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-120: HourBalances hardcoded English labels
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/HourBalances.jsx:139, 145`
- **Description:** "Surplus" and "Deficit" labels are hardcoded in English, not using `t()` translation function.
- **Impact:** Labels do not translate when user switches to German.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-121: DailyOperations hardcoded German/English strings
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/DailyOperations.jsx:224, 380`
- **Description:** Inline ternaries bypass the translation system.
- **Impact:** Strings will not translate if a third language is added.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-122: GarbageSchedule hardcoded German/English strings
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/GarbageSchedule.jsx:235, 239, 241, 273-274, 293-294`
- **Description:** Multiple strings use inline ternaries instead of translation system.
- **Impact:** Same as BUG-121.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-123: DailyTasks hardcoded "Heute"/"Today" string
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/DailyTasks.jsx:128`
- **Description:** Bypasses translation system with inline ternary.
- **Impact:** Same as BUG-121.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-124: Dashboard, DailyPlan, and DailyTasks are orphaned/unreachable routes
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/App.jsx:33-51`
- **Description:** These pages are imported but not rendered in any route. Dead code increases bundle size. DailyTasks and DailyPlan features are inaccessible.
- **Impact:** Dead code; features may be inaccessible to users.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-125: WeeklyPlanner filter uses `is_active` property that may not exist
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/WeeklyPlanner.jsx:274, 281`
- **Description:** `properties.filter(p => p.is_active)` and `workers.filter(w => w.is_active)` assume an `is_active` field exists. If undefined, filter excludes all items.
- **Impact:** Empty dropdowns if `is_active` is not returned by the API.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer

### BUG-126: Vacation year input allows invalid values
- **Severity:** Low
- **Domain:** frontend
- **Location:** `client/src/pages/Vacation.jsx:45`
- **Description:** Year input is `type="number"` with no `min`/`max` constraints. Users can enter negative numbers, zero, or far-future years.
- **Impact:** API receives nonsensical year values.
- **Triage:** ⬜ fix | ⬜ known | ⬜ defer
