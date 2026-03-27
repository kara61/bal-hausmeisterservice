# Audit Report: Operations Domain
Date: 2026-03-27

Scope: `src/services/planGeneration.js`, `src/services/taskScheduling.js`, `src/services/accountabilityFlow.js`, `src/services/commandCenter.js`, and all files under `api/_handlers/daily-plans/`, `api/_handlers/weekly-planner/`, `api/_handlers/tasks/`, `api/_handlers/plan-assignments/`, `api/_handlers/command-center/`.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 7 |
| Medium | 8 |
| Low | 5 |
| **Total** | **23** |

---

## Findings

### FINDING-OP-1: Token accepted via query-string — credential leakage in logs
- **Severity**: Critical
- **File**: `src/middleware/auth.js:33`
- **Pattern**: Missing input validation / auth weakness
- **Description**: `checkAuth` (and `requireAuth`) accept a JWT via `req.query.token` as a fallback when no `Authorization` header is present. Every API route in the audited domain uses `checkAuth`. Query-string tokens appear in server access logs, browser history, Referrer headers sent to third parties, and Vercel function logs verbatim.
- **Impact**: Any attacker with read access to logs (including Vercel's own dashboard, shared log-drains, or a nosy team member) can harvest valid JWTs and impersonate any user indefinitely until the token expires.
- **Suggested fix**: Remove the `req.query?.token` fallback entirely. Require the `Authorization: Bearer <token>` header only. If browser-side use is needed (e.g., SSE), use a short-lived, single-use token exchanged over a POST body, never a query parameter.

---

### FINDING-OP-2: Carry-over chain creates infinite duplicates across multiple runs
- **Severity**: Critical
- **File**: `src/services/taskScheduling.js:107-135`
- **Pattern**: Business logic edge case — task carry-over chains
- **Description**: `carryOverTasks` queries `task_assignments WHERE date = $1 AND status IN ('pending', 'in_progress')`. It marks originals as `carried_over` and inserts new rows on `toDate`. However the duplicate check (line 122–125) only tests `property_id + date`, not `task_description`. If the endpoint is called more than once for the same `(fromDate, toDate)` pair before all rows are marked `carried_over`, or if a task was legitimately created for `toDate` independently, additional rows are created for different task descriptions. More critically: if `carryOverTasks` is later called with `toDate` as the new `fromDate`, those carried tasks are carried again — nothing in the query excludes rows whose origin was already a carry-over. There is no `carried_from_id` column in `task_assignments` (unlike `plan_assignments` which does track `carried_from_id`), so the chain cannot be detected or broken.
- **Impact**: A property may accumulate multiple pending rows for the same task across many days, producing duplicate WhatsApp notifications, double-counting in reports, and worker confusion.
- **Suggested fix**: Add a `carried_from_id` column to `task_assignments` (as already exists in `plan_assignments`). In `carryOverTasks`, also filter `AND carried_from_id IS NULL` (or use a `status != 'carried_over'` guard more carefully) to stop propagation. Strengthen the duplicate check on line 122 to include `task_description`.

---

### FINDING-OP-3: `postponeTask` crashes with unguarded `.property_id` access when task is not found
- **Severity**: Critical
- **File**: `src/services/taskScheduling.js:138-160`
- **Pattern**: Null access without guards
- **Description**: `postponeTask` runs the UPDATE on line 139 without first verifying the task exists. `rows[0]` is destructured into `task` on line 145. If the `id` does not exist in the database the UPDATE returns zero rows, `rows[0]` is `undefined`, and the subsequent access `task.property_id` on line 148 throws `TypeError: Cannot read properties of undefined (reading 'property_id')`. This uncaught exception propagates up to `withErrorHandler`, which returns a generic 500 — giving the caller no indication the task ID was invalid.
- **Impact**: Callers receive an opaque 500 instead of a 404; also the postponed row for the new date is never created, silently dropping the postponement.
- **Suggested fix**: Check `if (!task) throw new Object404Error('Task not found')` after line 145, or do a SELECT first. Mirror the guard pattern in `planGeneration.js:postponePlanTask` which correctly throws `'Assignment not found'`.

---

### FINDING-OP-4: Timezone inconsistency between `taskScheduling.js` and `weekly-planner/index.js`
- **Severity**: High
- **File**: `src/services/taskScheduling.js:33-35` vs `api/_handlers/weekly-planner/index.js:157-158`
- **Pattern**: Timezone/date errors
- **Description**: `shouldTaskRunOnDate` (used by plan generation) constructs dates with `new Date(year, month-1, day)` — local time, so `.getDay()` returns the local weekday. The weekly-planner forecast loop (line 157–158) constructs dates with `new Date(dateStr + 'T00:00:00Z')` and calls `.getUTCDay()` — UTC. When the server runs in a timezone where midnight UTC is the previous calendar day (e.g., UTC+2 server or any UTC− offset), the two functions will disagree on which weekday a given date falls on. This is a recurrence of the class of timezone bugs that was already fixed elsewhere in the weekly planner (per commit history). The biweekly calculation in `taskScheduling.js:48-51` also uses `new Date(task.biweekly_start_date)` without forcing UTC, which will parse a bare `YYYY-MM-DD` string as UTC midnight but then compute `d.getTime()` against a local-time `d` — the difference in milliseconds will be off by the UTC offset, skewing `diffWeeks`.
- **Impact**: Properties assigned to a given weekday will appear on the wrong day in the weekly planner forecast, or will be missed entirely. Biweekly tasks may run on the wrong two-week cycle after DST transitions or for servers in non-UTC timezones.
- **Suggested fix**: Pick one convention (UTC throughout) and apply it consistently. In `taskScheduling.js`, replace `new Date(year, month-1, day)` with `new Date(Date.UTC(year, month-1, day))` and use `.getUTCDay()`. In the biweekly calculation, force `new Date(task.biweekly_start_date + 'T00:00:00Z')`.

---

### FINDING-OP-5: `generateDraftPlan` is not idempotent — concurrent calls create duplicate assignments
- **Severity**: High
- **File**: `src/services/planGeneration.js:43-174`
- **Pattern**: Race condition
- **Description**: The existence check on line 45–49 (`SELECT * FROM daily_plans WHERE plan_date = $1`) and the INSERT on line 52–55 are not wrapped in a transaction or protected with a unique constraint check. Two simultaneous POST requests to `/api/daily-plans` for the same date will both see no existing plan and both attempt to INSERT, resulting in either a duplicate-key error (if `plan_date` has a UNIQUE constraint) or two draft plans with duplicated assignment rows (if it does not). The assignment loop that follows (lines 121–170) is also not transactional — a partial failure mid-loop leaves the plan in a half-populated state with no rollback.
- **Impact**: Duplicate plans or partial plans; workers receive multiple or conflicting assignment notifications; dashboard shows inconsistent data.
- **Suggested fix**: Wrap the entire function body in a single database transaction (`BEGIN`/`COMMIT`). Use `INSERT INTO daily_plans ... ON CONFLICT (plan_date) DO NOTHING RETURNING *` and re-fetch when the INSERT returns nothing. Add a `UNIQUE` constraint on `daily_plans(plan_date)` if not already present.

---

### FINDING-OP-6: `redistributeSickWorkers` only reassigns `worker_role = 'field'` workers — cleaning roles left unhandled
- **Severity**: High
- **File**: `src/services/planGeneration.js:266-276`
- **Pattern**: Business logic edge case
- **Description**: The query that builds the replacement worker pool on line 266 hardcodes `w.worker_role = 'field'`. If a sick worker has role `'cleaning'`, the function still finds their assignments (line 258–263, no role filter) but then calls `findBestWorkerForProperty` against a pool that contains zero `cleaning` workers. `findBestWorkerForProperty` returns `null` (line 18), the assignment is silently skipped, and the cleaning task remains assigned to an absent worker. The `details` array will not include that assignment — no signal is given that it failed.
- **Impact**: Cleaning tasks for sick workers are never redistributed. Properties go uncleaned; supervisors are not alerted.
- **Suggested fix**: Build the replacement pool per role (as `generateDraftPlan` does on line 128). Filter replacement candidates by the same `worker_role` as the sick worker's original assignment. Or remove the hardcoded role filter and let `findBestWorkerForProperty`'s role-agnostic logic run, then match by `assignment.worker_role`.

---

### FINDING-OP-7: `carryOverPlanTasks` re-uses `assignment_order` from the source plan without renumbering
- **Severity**: High
- **File**: `src/services/planGeneration.js:383-395`
- **Pattern**: Business logic edge case / off-by-one
- **Description**: Carried-over assignments are inserted on the target plan with `assignment.assignment_order` copied verbatim (line 387). If the target plan already has assignments (e.g., it was auto-generated before the carry-over is applied), duplicate `assignment_order` values will exist within the same `daily_plan_id`, breaking any ORDER BY or sequential dispatch logic that assumes orders are unique. The same problem exists in `postponePlanTask` (line 424–428).
- **Impact**: Worker dispatch order becomes unpredictable; UI may display tasks in wrong sequence; any code assuming `assignment_order` is unique per plan will malfunction.
- **Suggested fix**: On insert, set `assignment_order` to `(SELECT COALESCE(MAX(assignment_order), 0) + 1 FROM plan_assignments WHERE daily_plan_id = $target_plan_id)` or renumber after insertion.

---

### FINDING-OP-8: `approvePlan` hardcodes `approvedBy = 'halil'`
- **Severity**: High
- **File**: `api/_handlers/daily-plans/approve.js:16`
- **Pattern**: Hardcoded values
- **Description**: The call `approvePlan(parseInt(id, 10), 'halil')` always records the approver as the string literal `'halil'`, ignoring `req.user` (which is set by `checkAuth`). Any user with a valid JWT can approve a plan, and it will always appear to have been approved by 'halil'.
- **Impact**: Audit trail is corrupted. There is no accountability for who actually approved plans. If the business requires supervisor-only approval, the authorization check is also absent.
- **Suggested fix**: Replace `'halil'` with `req.user?.id || req.user?.sub || req.user?.username`. Also consider adding a role check to restrict approval to supervisors only.

---

### FINDING-OP-9: `getAlerts` — flagged-entry query missing date filter leaks historical alerts into every response
- **Severity**: High
- **File**: `src/services/commandCenter.js:174-178`
- **Pattern**: Business logic edge case / missing input validation
- **Description**: The flagged time entries query has no date filter — it returns up to 10 unresolved flagged entries from any date in history (`ORDER BY te.date DESC LIMIT 10`). The `dateStr` parameter accepted by `getAlerts` is ignored for this query. The command center endpoint passes `dateStr` (from `req.query.date`) to `getCommandCenterData`, which passes it to `getAlerts`, but the flagged-entry subquery retrieves historical flags unrelated to the requested date.
- **Impact**: The dashboard always shows old, stale alerts from past days even when those days' plans are being reviewed in isolation. High-volume operations will bury today's alerts under old ones. Additionally, if `resolved` column does not exist on the `time_entries` table (it is not confirmed in the audit scope), this query will throw a runtime error crashing the entire command center.
- **Suggested fix**: Add `AND te.date = $1` to the flagged entries query, or accept that it is intentionally global and document it. Verify the `resolved` column exists in the schema.

---

### FINDING-OP-10: No date-format validation on any handler that accepts `date` or `new_date` inputs
- **Severity**: High
- **File**: Multiple: `api/_handlers/daily-plans/index.js:22`, `api/_handlers/tasks/carryover.js:9`, `api/_handlers/tasks/postpone.js:9`, `api/_handlers/plan-assignments/[id]/postpone.js:13`
- **Pattern**: Missing input validation
- **Description**: Every handler checks for presence of a date field (`if (!date)`) but none validate format or range. A caller can pass `date = "'; DROP TABLE daily_plans; --"` — but because parameterized queries are used throughout, SQL injection is blocked. However, passing `"not-a-date"`, `"2024-02-30"`, or `"99999-01-01"` will propagate into PostgreSQL where it may either throw an unhandled cast error (returned as 500) or insert a semantically invalid date silently. The `new_date` passed to `postponeTask` and `postponePlanTask` is also unvalidated — a past date can be provided, creating a "postponement" that is already overdue.
- **Impact**: Malformed input causes 500 errors with no user-friendly message; postponements to past dates create immediately-missed tasks; no protection against unreasonably far-future dates that would generate spurious plans.
- **Suggested fix**: Add a `isValidDateStr` guard: `if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return res.status(400).json({ error: 'Invalid date format' })`. For postponement, also verify `new_date >= today`.

---

### FINDING-OP-11: `plan-assignments/[id].js` — status update accepts arbitrary status strings
- **Severity**: Medium
- **File**: `api/_handlers/plan-assignments/[id].js:15-23`
- **Pattern**: Missing input validation
- **Description**: The status-update branch accepts `status` from `req.body` and writes it directly to the database with no allowlist check. Any string can be stored as a plan assignment's status (e.g., `"hacked"`, `"approved"`, `"'"`, or an SQL-looking string). Unlike `tasks/[id]/status.js` which defines `VALID_STATUSES` and rejects unknown values, this handler has no such guard.
- **Impact**: Database rows with invalid status values corrupt dashboard aggregations, filter logic in `carryOverPlanTasks` (which checks for `pending` or `in_progress`), and the `deriveWorkerStatus` logic in `commandCenter.js`.
- **Suggested fix**: Add a VALID_STATUSES allowlist matching the business statuses (`pending`, `in_progress`, `done`, `completed`, `postponed`, `carried_over`) and return 400 for anything outside it.

---

### FINDING-OP-12: `getWorkerFlowState` returns `allDone = false` when a worker has zero visits — misleading for empty-day workers
- **Severity**: Medium
- **File**: `src/services/accountabilityFlow.js:141`
- **Pattern**: Business logic edge case
- **Description**: `allDone` is `visits.length > 0 && visits.every(...)`. When a worker has no visits for the day (e.g., a sick day, a worker not assigned anything), `allDone` is `false`. Any caller that checks `allDone` to determine if a worker has finished their day will incorrectly conclude the worker still has work to do. `currentVisit` and `nextVisit` are both `null`, which partially signals "nothing assigned", but `allDone: false` contradicts this.
- **Impact**: Command center or accountability notifications may incorrectly follow up with workers who have no scheduled visits.
- **Suggested fix**: Return `allDone: visits.length === 0 || visits.every(v => v.status === 'completed')` — or add a separate `hasAssignments` boolean to let callers distinguish "all done" from "nothing assigned".

---

### FINDING-OP-13: `markCompleted` does not guard against completing a visit that was never marked as arrived
- **Severity**: Medium
- **File**: `src/services/accountabilityFlow.js:83-101`
- **Pattern**: Business logic edge case / missing input validation
- **Description**: `markCompleted` runs an unconditional UPDATE with `duration_minutes = EXTRACT(EPOCH FROM (NOW() - arrived_at))::int / 60`. If `arrived_at` is NULL (because `markArrived` was never called), PostgreSQL evaluates `NOW() - NULL = NULL`, so `duration_minutes` is set to NULL silently. There is no status guard preventing completion of a visit still in `'assigned'` state — a worker could skip the "arrived" step and jump directly to "completed", bypassing the time-tracking and on-site accountability entirely.
- **Impact**: Duration tracking is silently wrong (NULL); accountability checks based on time-on-site are bypassed; `formatDaySummary` will receive `null` for `arrived_at` and `new Date(null)` returns epoch time, producing wildly incorrect duration strings.
- **Suggested fix**: Add a guard: fetch the visit first, check `status === 'in_progress'` (or at least `arrived_at IS NOT NULL`), and return 400/409 if the visit has not been marked as arrived.

---

### FINDING-OP-14: `formatDaySummary` does not guard against `arrived_at` or `completed_at` being null/invalid
- **Severity**: Medium
- **File**: `src/services/accountabilityFlow.js:20`
- **Pattern**: Null access without guards
- **Description**: `Math.round((new Date(v.completed_at) - new Date(v.arrived_at)) / 60000)` will produce `NaN` if either timestamp is null (e.g., a visit completed without `arrived_at` as described in FINDING-OP-13). `NaN` propagates to `totalMinutes`, making `totalH` and `totalM` also `NaN`, and the final summary string will contain `"NaNh NaNm"`.
- **Impact**: Workers receive malformed summary messages; trust in the system is eroded.
- **Suggested fix**: Guard with `if (!v.completed_at || !v.arrived_at) return 'Unbekannte Dauer'` before computing `mins`.

---

### FINDING-OP-15: `shouldTaskRunOnDate` biweekly branch — negative `diffWeeks` causes incorrect scheduling
- **Severity**: Medium
- **File**: `src/services/taskScheduling.js:48-52`
- **Pattern**: Off-by-one / timezone error
- **Description**: If `biweekly_start_date` is in the future relative to `dateStr`, `diffMs` is negative, `diffWeeks` via `Math.round` is a negative integer. `-2 % 2 === 0` in JavaScript (returns `0`), so a date *before* the start date is incorrectly evaluated as "active" for a biweekly task. The task will be scheduled on every matching weekday before the `biweekly_start_date`, which is the wrong cycle.
- **Impact**: Tasks are generated for dates prior to when the schedule was supposed to begin.
- **Suggested fix**: Add `if (diffMs < 0) return false;` before the modulo check.

---

### FINDING-OP-16: Weekly planner `getHistoryTasks` — `plan_date` and `due_date` date-key extraction uses `new Date()` without UTC forcing
- **Severity**: Medium
- **File**: `api/_handlers/weekly-planner/index.js:61`, `93`
- **Pattern**: Timezone/date errors
- **Description**: `toDateStr(new Date(row.plan_date))` and `toDateStr(new Date(row.due_date))` create Date objects from PostgreSQL timestamp values. When the database column type is `date` (no time component), pg-node returns it as a JavaScript `Date` set to midnight UTC. `toISOString().split('T')[0]` is then safe. But if the column is `timestamp` or `timestamptz`, the local conversion can shift the date by one day in UTC− timezones. The existing fix applied to navigation uses `'T00:00:00Z'` suffix everywhere, but these two conversions in `getHistoryTasks` do not use that pattern and are inconsistent with the rest of the file.
- **Impact**: History tasks appear on the wrong day in the planner (one day off) in UTC− server environments.
- **Suggested fix**: Use the same pattern as the rest of the file: if `row.plan_date` is already a `YYYY-MM-DD` string from Postgres, pass it directly to `toDateStr` without wrapping in `new Date()`. If it may be a Date object, use `row.plan_date instanceof Date ? row.plan_date.toISOString().split('T')[0] : row.plan_date` (same pattern as `planGeneration.js:195-197`).

---

### FINDING-OP-17: `generateDraftPlan` — zero available workers yields an empty plan with no warning
- **Severity**: Medium
- **File**: `src/services/planGeneration.js:81`, `148-153`
- **Pattern**: Business logic edge case — plan generation with zero workers
- **Description**: If all workers are sick or there are no active field/cleaning workers, `available` is an empty array. The loop at line 121 proceeds; `roleWorkers` (line 128) is empty; `findBestWorkerForProperty` returns `null` for every pick; `picked` stays empty; `assignedWorkersByRole` maps every role to `[]`; the inner assignment-insert loop (line 161) never executes. The function returns the plan object with zero assignments and no indication that workers are missing. `generateDraftPlan` also exits early on line 81 (`if (todaysTasks.length === 0) return plan`) returning a plan before any of this runs, but when tasks exist and workers don't, the caller gets a plan that silently has no assignments.
- **Impact**: Supervisors may not notice that a generated plan is empty due to total worker absence, missing an alert that all tasks need manual reassignment.
- **Suggested fix**: After the assignment loop, check if any tasks remain unassigned and add a `warnings` field to the return value, or throw/log a structured alert. Consider an early check: if `available.length === 0 && todaysTasks.length > 0`, immediately return a plan with a `{ warnings: ['No available workers'] }` payload.

---

### FINDING-OP-18: `commandCenter/index.js` — `date` defaults to `new Date().toISOString().split('T')[0]` which is UTC, not local time
- **Severity**: Medium
- **File**: `api/_handlers/command-center/index.js:12`
- **Pattern**: Timezone/date errors
- **Description**: `new Date().toISOString().split('T')[0]` yields the current UTC date. If the server (or Vercel's serverless edge) runs in UTC but the business operates in a UTC+ timezone (e.g., Germany: UTC+1/UTC+2), a user loading the command center after midnight local time but before midnight UTC will see the previous day's data. The same pattern exists in `api/_handlers/weekly-planner/index.js:282`.
- **Impact**: The command center shows yesterday's data for the first 1–2 hours of each new business day in Germany (Central European Time), causing operational confusion.
- **Suggested fix**: Either always require the client to pass an explicit `date` parameter (removing the server-side default), or compute the local date using a known timezone: `new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', ... }).format(new Date())`.

---

### FINDING-OP-19: `carryOverTasks` inserts with `team_id = task.team_id` which may be null — silently drops team assignment
- **Severity**: Low
- **File**: `src/services/taskScheduling.js:127-133`
- **Pattern**: Null access without guards / business logic edge case
- **Description**: The INSERT for the carried-over task at line 128 passes `task.team_id` as `$2`. If the original task has no team assigned (`team_id IS NULL`), the new task is also inserted without a team. This is arguably correct behaviour, but there is no comment or warning returned to the caller. The same applies to `postponeTask` at line 153. More significantly: the duplicate check on line 122 (`WHERE property_id = $1 AND date = $2`) will skip insertion if *any* task for that property already exists on `toDate`, even if it is for a completely different task type. A day where a property already has a garbage task would cause a legitimate service task carry-over to be silently dropped.
- **Impact**: Carried-over service tasks are silently lost when a property already has any other task type on the target date.
- **Suggested fix**: Strengthen the duplicate check to include `task_description` (same fix as FINDING-OP-2), and add `worker_role` to the check.

---

### FINDING-OP-20: `weekly-planner` — only Mon–Fri (5 days) generated; Saturday/Sunday tasks always invisible
- **Severity**: Low
- **File**: `api/_handlers/weekly-planner/index.js:19-26`
- **Pattern**: Hardcoded values / business logic edge case
- **Description**: `getWeekDates` loops `for (let i = 0; i < 5; i++)` — always returning exactly Monday through Friday. Any properties with `assigned_weekday = 6` (Saturday) or `= 0` (Sunday) are never shown in the weekly planner. If the business ever has weekend service obligations these will be invisible.
- **Impact**: Weekend tasks are silently omitted from the planner view; supervisors cannot review or plan for them.
- **Suggested fix**: If weekends are intentionally excluded, add a comment. If they may be needed, change `5` to `7` or make it a configurable parameter.

---

### FINDING-OP-21: `tasks/[id]/assign.js` — task assigned without checking if task is already assigned or in a terminal state
- **Severity**: Low
- **File**: `api/_handlers/tasks/[id]/assign.js:13-17`
- **Pattern**: Business logic edge case / missing input validation
- **Description**: The UPDATE unconditionally overwrites `team_id` regardless of the task's current status. A completed (`'done'`) or postponed task can be re-assigned to a team without any guard. No notification is sent to the old team (unlike `reassign.js` which does notify the old team).
- **Impact**: Workers on a team may receive assignment notifications for tasks that are already completed or are otherwise in an invalid state.
- **Suggested fix**: Fetch the task first, check it is in `'pending'` or `'in_progress'` status, and return 409 Conflict if it is `'done'` or `'postponed'`.

---

### FINDING-OP-22: Dead code — `vacationIds` is always an empty array in `generateDraftPlan`
- **Severity**: Low
- **File**: `src/services/planGeneration.js:102-104`
- **Pattern**: Dead code
- **Description**: Lines 102–104 declare `const vacationIds = []` with a TODO comment acknowledging that vacation periods are not yet tracked. The variable is passed to `getAvailableWorkers` but has no effect. The comment is accurate but the empty array also means workers on vacation are never excluded from plan generation — this is not just dead code but a missing feature that will silently assign tasks to absent workers.
- **Impact**: Workers on vacation will receive task assignments and WhatsApp notifications, and tasks will go unserviced.
- **Suggested fix**: Implement the `vacation_periods` table as described in the TODO, or at minimum document this gap as a known limitation and log a warning at startup.

---

### FINDING-OP-23: `getCommandCenterData` — `approvedBy` field never included in response but `approved_at` is
- **Severity**: Low
- **File**: `src/services/commandCenter.js:67`, `129-138`
- **Pattern**: Dead code / business logic gap
- **Description**: The SELECT on line 67 fetches `approved_by` from `daily_plans`, but the returned object on line 129–138 spreads only `approvedAt: plan.approved_at` and omits `approvedBy`. The field is fetched from the database and then discarded. This is harmless but wasteful and means the dashboard cannot show who approved the plan, undermining the audit trail.
- **Impact**: Minor — the fetch column is wasted; no security risk. But the accountability feature is partially broken since the approver identity is never surfaced.
- **Suggested fix**: Add `approvedBy: plan.approved_by` to the returned object alongside `approvedAt`.
