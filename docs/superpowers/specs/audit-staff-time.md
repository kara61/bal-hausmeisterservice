# Audit Report: Staff & Time Domain
Date: 2026-03-27

## Scope

Files audited:
- `src/services/timeCalculation.js`
- `src/services/hourBalance.js`
- `src/services/sickLeave.js`
- `src/services/vacation.js`
- `api/_handlers/workers/index.js`
- `api/_handlers/workers/[id].js`
- `api/_handlers/workers/role.js`
- `api/_handlers/time-entries/index.js`
- `api/_handlers/time-entries/[id].js`
- `api/_handlers/time-entries/flagged.js`
- `api/_handlers/sick-leave/index.js`
- `api/_handlers/sick-leave/[id].js`
- `api/_handlers/vacation/index.js`
- `api/_handlers/hour-balances/index.js`
- `api/_handlers/hour-balances/sync.js`
- `api/_handlers/hour-balances/payout.js`
- `api/_handlers/hour-balances/initial.js`
- `src/middleware/auth.js` (supporting file)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| High     | 6     |
| Medium   | 7     |
| Low      | 5     |
| **Total**| **21**|

---

## Findings

### FINDING-ST-1: Token accepted via query string — token leakage in logs and referrer headers
- **Severity**: Critical
- **File**: `src/middleware/auth.js:10-11`, `src/middleware/auth.js:33-34`
- **Pattern**: Missing auth checks / hardcoded values
- **Description**: Both `requireAuth` and `checkAuth` accept the JWT via `req.query.token`. Query-string tokens are recorded in server access logs, browser history, proxy logs, and Referer headers, which are all outside the application's control. Any person with access to server logs can replay the token.
- **Impact**: Full authentication bypass for any session token that was ever passed via URL. Workers' time records, salary data, and sick-leave details become accessible to anyone with log access.
- **Suggested fix**: Remove the `req.query.token` fallback entirely. Accept the token only through the `Authorization: Bearer <token>` header. If a UI component currently uses query-string tokens, update it to store the token in memory or a short-lived cookie and attach it as a header.

---

### FINDING-ST-2: Minijob hour cap uses 520 € wage limit but ignores the legal 538 € Minijob threshold (as of 2024)
- **Severity**: Critical
- **File**: `src/services/hourBalance.js:29-31`
- **Pattern**: Business logic edge cases (Minijob caps)
- **Description**: The cap for minijob workers is derived from `monthly_salary / hourly_rate`. This relies entirely on whatever values are stored in the database; there is no validation that `monthly_salary` respects the current legal Minijob ceiling (538 €/month as of January 2024, raised from 520 €). If old worker records still carry `monthly_salary = 520`, the calculated `minijobMax` hours will be too low, and hours actually worked within the legal limit will be falsely flagged as surplus/unofficial. Conversely, if `monthly_salary` was entered above 538, the cap is silently too high and hours beyond the legal ceiling are booked as official.
- **Impact**: Incorrect overtime/surplus calculation for all minijob workers; potential social-insurance liability if wages are reported incorrectly.
- **Suggested fix**: Add a server-side constant `MINIJOB_SALARY_CEILING = 538` and clamp `monthly_salary` against it before computing `minijobMax`. Emit a warning (or refuse to sync) when a stored `monthly_salary` exceeds the ceiling.

---

### FINDING-ST-3: Race condition in `recordPayout` — payout can exceed actual balance
- **Severity**: Critical
- **File**: `src/services/hourBalance.js:81-93`
- **Pattern**: Race conditions
- **Description**: `recordPayout` issues an `INSERT … ON CONFLICT DO UPDATE SET payout_hours = hour_balances.payout_hours + $4` without first checking whether `payout_hours + new_amount <= surplus_hours`. Two concurrent payout requests for the same worker/month window will both read the pre-update `payout_hours` and both succeed, resulting in a total payout that exceeds the available balance.
- **Impact**: A worker could be paid out more hours than they have earned. No database-level constraint prevents `payout_hours > surplus_hours`.
- **Suggested fix**: Wrap the check and update in a single `UPDATE … WHERE payout_hours + $4 <= surplus_hours RETURNING *`. If `RETURNING *` yields no row, the balance is insufficient; return a 422 error. Alternatively, use a `SELECT … FOR UPDATE` inside a transaction before the update.

---

### FINDING-ST-4: `deductVacation` silently falls back to current year when year is NULL
- **Severity**: High
- **File**: `src/services/sickLeave.js:81`
- **Pattern**: Timezone/date errors, business logic edge cases
- **Description**: `deductVacation(client, workerId, days, year = null)` defaults to `new Date().getFullYear()` when `year` is omitted. This default is `null` in the first call site at line 26 (the `status === 'overridden'` branch), because no `year` argument is passed:
  ```js
  await deductVacation(client, sl.worker_id, adjustments.vacation_deducted_days);
  ```
  If `sl.start_date` falls in a prior year and the override is processed in the current year, the vacation deduction is applied to the wrong year's balance. For example: a sick leave from December 2025 overridden in January 2026 would deduct vacation from the 2026 balance rather than 2025.
- **Impact**: Vacation balance corruption across year boundaries; overridden sick leaves silently destroy the wrong year's entitlement.
- **Suggested fix**: In the `overridden` branch, derive `year` from `sl.start_date` and pass it to `deductVacation`, the same as the non-override path does at line 52.

---

### FINDING-ST-5: `adjustSickLeave` does not validate that `aok_approved_days <= declared_days`
- **Severity**: High
- **File**: `src/services/sickLeave.js:33-34`
- **Pattern**: Missing input validation, business logic edge cases
- **Description**: `remainingDays = sl.declared_days - aokApproved` can be negative if `adjustments.aok_approved_days` exceeds `sl.declared_days`. There is no guard against this. A negative `remainingDays` skips the `if (remainingDays > 0)` block (correct), but the raw value is stored in `vacation_deducted_days = 0` and `unpaid_days = 0` while `aok_approved_days` is stored as a value greater than `declared_days`. This is an inconsistent record state and could confuse downstream reporting.
- **Impact**: Inconsistent sick-leave records; totals (aok_approved + vacation_deducted + unpaid) no longer equal declared_days.
- **Suggested fix**: Add a validation guard at the start of `adjustSickLeave`: `if (adjustments.aok_approved_days > sl.declared_days) throw new Error('aok_approved_days cannot exceed declared_days')`.

---

### FINDING-ST-6: `vacation/index.js` POST endpoint — no input validation on `worker_id`, `year`, or `entitlement_days`
- **Severity**: High
- **File**: `api/_handlers/vacation/index.js:27-30`
- **Pattern**: Missing input validation
- **Description**: The POST handler reads `worker_id`, `year`, and `entitlement_days` from the request body and passes them directly to `ensureVacationBalance` without any validation. All three can be `undefined`, `null`, non-numeric strings, or negative numbers. Passing `undefined` to the parameterized SQL query will cause a PostgreSQL driver error that leaks a raw error message. A negative `entitlement_days` would silently store a nonsensical entitlement.
- **Impact**: Unhandled 500 errors on malformed requests; potential storage of invalid vacation entitlements.
- **Suggested fix**: Validate that all three fields are present and are valid positive integers before calling `ensureVacationBalance`. Return `400` if validation fails.

---

### FINDING-ST-7: `hour-balances/sync.js` — `year` and `month` are not validated or coerced to integers
- **Severity**: High
- **File**: `api/_handlers/hour-balances/sync.js:9-13`
- **Pattern**: Missing input validation
- **Description**: `year` and `month` are checked for truthiness (`if (!year || !month)`) but are not validated to be integers within a valid range. They are passed directly to `syncMonthForAll(year, month)`. Inside `syncMonthForAll`, `month === 12` is tested without coercion; if `month` arrives as the string `"12"`, the comparison `"12" === 12` is `false`, so December would generate an incorrect `endDate` of `"2024-13-01"` instead of `"2025-01-01"`, causing the SQL date filter to return zero rows and silently mark all workers as having zero surplus hours for December.
- **Impact**: December syncs are silently broken when year/month arrive as strings (standard JSON body without explicit numeric coercion). All workers' December surplus hours are zeroed out.
- **Suggested fix**: In `sync.js`, coerce with `parseInt`: `const year = parseInt(req.body.year); const month = parseInt(req.body.month)`. Add range validation (month 1–12, year reasonable). In `hourBalance.js:syncMonthForAll`, add a type assertion or coerce internally.

---

### FINDING-ST-8: `time-entries/index.js` — parameter index arithmetic is fragile and wrong when only `month` or only `year` is supplied
- **Severity**: High
- **File**: `api/_handlers/time-entries/index.js:18-24`
- **Pattern**: Off-by-one errors, missing input validation
- **Description**: The filter clause is only appended when both `month` AND `year` are present (`if (month && year)`). But the parameter index is computed from the current `params.length` after pushing both values in a single `push(month, year)` call:
  ```js
  params.push(parseInt(month), parseInt(year));
  query += ` AND EXTRACT(MONTH FROM te.date) = $${params.length - 1}
             AND EXTRACT(YEAR FROM te.date) = $${params.length}`;
  ```
  If a subsequent filter (`worker_id`) is added before month/year in a future code change, or if the order of pushes is reordered, the index arithmetic silently produces wrong bindings. Additionally, `parseInt(month)` converts `month=0` to `0`, which would match no rows rather than erroring. There is no validation that `month` is 1–12.
- **Impact**: Silent wrong-result queries if parameter order is ever changed; `month=0` silently returns an empty result set without a 400 error.
- **Suggested fix**: Use separate, sequentially numbered parameters and validate that month is in range [1, 12] and year is a 4-digit integer.

---

### FINDING-ST-9: `calculateDailyHours` returns 0 silently for invalid / unparseable timestamps
- **Severity**: Medium
- **File**: `src/services/timeCalculation.js:5-9`
- **Pattern**: Null access without guards, business logic edge cases
- **Description**: `calculateDailyHours` guards against missing values but does not guard against malformed strings. `new Date('garbage')` produces `Invalid Date`, so `new Date('garbage') - new Date('garbage')` produces `NaN`, and `Math.round(NaN * 100) / 100` = `NaN`. `NaN` is coerced to `0` by `calculateMonthlyHours`'s `reduce` accumulator only if PostgreSQL already returned a number-like value. When `check_in` or `check_out` is a non-null but unparseable string, the function returns `NaN` not `0`, which pollutes the monthly total with `NaN`, making the entire month's surplus calculation return `NaN`.
- **Impact**: Corrupt hour-balance records (stored as `NaN` → `NULL` in Postgres) for months containing any time entry with a malformed timestamp.
- **Suggested fix**: After computing `diffMs`, add `if (isNaN(diffMs) || diffMs < 0) return 0;` before the return.

---

### FINDING-ST-10: Negative duration not guarded — check_out before check_in
- **Severity**: Medium
- **File**: `src/services/timeCalculation.js:7-8`
- **Pattern**: Business logic edge cases, missing input validation
- **Description**: `calculateDailyHours` computes `new Date(checkOut) - new Date(checkIn)`. If `checkOut < checkIn` (a data-entry mistake or a midnight-spanning shift), `diffMs` is negative, and the function returns a negative hours value. This negative value flows into `calculateMonthlyHours` and then into `splitOfficialAndUnofficial`, where a negative `totalHours` would be compared against the cap: `totalHours <= cap` is true, so `official = totalHours` (a negative number) and `unofficial = 0`. The balance for that month would be artificially reduced.
- **Impact**: Negative hours silently reduce a worker's monthly total, leading to under-reported work hours and potentially reducing their overtime/surplus balance.
- **Suggested fix**: In `calculateDailyHours`, add `if (diffMs < 0) return 0;` (or throw if a negative value should be flagged). Separately, the API layer that saves time entries should validate `check_out > check_in`.

---

### FINDING-ST-11: `workers/index.js` — worker creation inserts before duplicate-name check
- **Severity**: Medium
- **File**: `api/_handlers/workers/index.js:32-44`
- **Pattern**: Race conditions, business logic edge cases
- **Description**: The worker is `INSERT`ed into the database first (line 32). Only after the insert succeeds does the code run a `SELECT` to check for a duplicate name (line 38). The duplicate-name check is advisory (it only adds a `_warning` field to the response) rather than a hard constraint, which is acceptable. However, the ordering means the row is committed before the caller is even warned. Two concurrent POST requests for the same name will both succeed and neither will see the warning because each query checks for `id != result.rows[0].id` while the other transaction may not yet be visible. This is also a general observation that the name-uniqueness check is purely advisory with no enforcement.
- **Impact**: Duplicate worker names with no enforced uniqueness; operational confusion when two workers share a name in assignments and reports.
- **Suggested fix**: Move the name-uniqueness check before the INSERT, or enforce a unique partial index (`UNIQUE LOWER(name) WHERE is_active = true`) at the database level so the constraint is atomic.

---

### FINDING-ST-12: `workers/role.js` — `futureCount` variable may be used before assignment
- **Severity**: Medium
- **File**: `api/_handlers/workers/role.js:34-39`
- **Pattern**: Null access without guards
- **Description**: `futureCount` is declared inside the `if (role !== 'field')` block at line 28. At line 39, `{ _warnings: warnings, future_assignment_count: futureCount }` is returned. If `warnings` is non-empty but only contains `'last_field_worker'` (the first warning check at line 24, which runs before `futureCount` is defined), the response at line 39 will include `future_assignment_count: undefined` because `futureCount` was declared inside the second query block. However, the first query (line 20) for `last_field_worker` runs unconditionally inside `if (role !== 'field')`, and the second query (line 28) for `futureCount` also runs unconditionally inside the same block — so in practice `futureCount` is always defined when the `if (warnings.length > 0 && !force)` check is reached. The structural risk is that future edits could separate these query blocks, causing the bug to manifest.
- **Impact**: Currently a latent structural risk rather than an active crash; `future_assignment_count` would be `undefined` if the block structure is ever refactored.
- **Suggested fix**: Initialize `let futureCount = 0` at the top of the `if (role !== 'field')` block before the queries, for defensive clarity.

---

### FINDING-ST-13: `sick-leave/index.js` — unvalidated `status` filter parameter
- **Severity**: Medium
- **File**: `api/_handlers/sick-leave/index.js:22-24`
- **Pattern**: Missing input validation
- **Description**: The `status` query parameter is passed directly to the SQL query as a bind parameter (not as string interpolation, so no SQL injection). However, there is no validation that `status` is one of the known enum values (`pending`, `approved`, `overridden`, etc.). An unexpected value such as an empty string or a typo silently returns zero rows instead of a 400 error, making it difficult for callers to detect bugs.
- **Impact**: Silent empty results instead of explicit errors; no defense-in-depth against unexpected inputs.
- **Suggested fix**: Validate `status` against the allowed enum values and return `400` if it is unrecognized.

---

### FINDING-ST-14: `vacation.js:calculateVacationEntitlement` — pro-rata rule gives full 2 days for month of registration when registered on day 1
- **Severity**: Medium
- **File**: `src/services/vacation.js:18-23`
- **Pattern**: Business logic edge cases, off-by-one errors
- **Description**: The logic at lines 19-23 awards `2` days for months where `regDate <= monthStart` (i.e., the worker was registered before or at the start of the month) and `1` day otherwise (registered during the month). A worker who registers on exactly the first day of a month gets `2` days for that month (correct). A worker who registers on the last day of the month also gets `1` day (correct). However, the award of `1` day for a partial month is a flat rule — it does not scale by how many days in the month the worker was actually present. Under German Mindesturlaub law the pro-rata calculation is typically `(full_year_entitlement / 12)` per month, rounded up, not a binary 2/1 split. This means the accrual may not match the intended entitlement scheme.
- **Impact**: Vacation entitlement miscalculation for workers who join mid-month; workers may be over- or under-entitled.
- **Suggested fix**: Clarify and document the intended accrual rule. If monthly accrual should be `(annual_entitlement / 12)` per full month and half that for partial months, replace the hardcoded `2`/`1` constants with `perMonth = annualEntitlement / 12` and adjust accordingly. Add a parameter for `annualEntitlement`.

---

### FINDING-ST-15: `hourBalance.js:getWorkerBalances` — `payout_hours` assumed to be non-null; NULL causes NaN total
- **Severity**: Medium
- **File**: `src/services/hourBalance.js:70-72`
- **Pattern**: Null access without guards
- **Description**: The total balance is computed as:
  ```js
  const totalBalance = history.reduce(
    (sum, h) => sum + Number(h.surplus_hours) - Number(h.payout_hours), 0
  );
  ```
  `Number(null)` = `0`, so a `NULL` `payout_hours` is treated as `0` (safe). However, `Number(undefined)` = `NaN`. If the `hour_balances` table ever has a row where `surplus_hours` or `payout_hours` is missing from the result set (e.g., a schema mismatch), the entire worker balance collapses to `NaN`. While `Number(null)` works today, the intent is fragile and should be explicit.
- **Impact**: Silent `NaN` balance for a worker if the database schema changes or a row is corrupt.
- **Suggested fix**: Use explicit null coalescing: `(Number(h.surplus_hours) || 0) - (Number(h.payout_hours) || 0)`.

---

### FINDING-ST-16: `workers/index.js` — `joker` role allowed in creation and update but error message says only field/cleaning/office
- **Severity**: Low
- **File**: `api/_handlers/workers/index.js:27-29`, `api/_handlers/workers/[id].js:31-33`
- **Pattern**: Dead code, business logic edge cases
- **Description**: Both the POST handler (index.js:27) and PUT handler ([id].js:31) accept `'joker'` as a valid `worker_role`. The validation error message however says: `'worker_role must be field, cleaning, or office'` — omitting `joker`. The discrepancy between the allowed values and the error message will confuse API consumers.
- **Impact**: Documentation/contract mismatch; API consumers reading the error message would not know `joker` is valid.
- **Suggested fix**: Update the error message to list all four accepted values: `'worker_role must be field, cleaning, office, or joker'`.

---

### FINDING-ST-17: `hour-balances/payout.js` — `payout_hours` truthiness check rejects legitimate zero-hour payouts (edge case)
- **Severity**: Low
- **File**: `api/_handlers/hour-balances/payout.js:10`
- **Pattern**: Missing input validation, business logic edge cases
- **Description**: The guard `if (!worker_id || !year || !month || !payout_hours)` would reject a `payout_hours` value of `0`. While a zero payout is arguably a no-op, the check is semantically incorrect — it conflates "missing" with "zero". A zero payout as a correction entry (to document that no payout was made) would be rejected with a misleading required-field error.
- **Impact**: Low practical risk (zero payouts are rare), but the error message is misleading.
- **Suggested fix**: Change the guard to `payout_hours === undefined || payout_hours === null` rather than relying on falsy check.

---

### FINDING-ST-18: `timeCalculation.js` — `FULLTIME_MONTHLY_HOURS` is hardcoded
- **Severity**: Low
- **File**: `src/services/timeCalculation.js:1`
- **Pattern**: Hardcoded values
- **Description**: `FULLTIME_MONTHLY_HOURS = 173.2` is a hardcoded constant derived from `5 days/week × 4.33 weeks/month × 8 hours/day`. Different full-time workers may have different contracted weekly hours (e.g., 40 h/week vs 38.5 h/week), but the cap is applied uniformly. There is no way to override this per worker without changing the source code.
- **Impact**: Workers with non-standard full-time contracts have their overtime calculated against the wrong cap.
- **Suggested fix**: Accept a `fulltimeMonthlyMax` parameter in `splitOfficialAndUnofficial` (similar to how `minijobMonthlyMax` is already accepted) and derive it from the worker's `monthly_hours` column, falling back to the constant if unset.

---

### FINDING-ST-19: `timeCalculation.js` — `HARCIRAH_AMOUNT` is hardcoded at 14 €
- **Severity**: Low
- **File**: `src/services/timeCalculation.js:3`
- **Pattern**: Hardcoded values
- **Description**: The travel/meal allowance (harcirah) is hardcoded at 14 € and 8.5 hours. German tax-free per-diem rates for domestic travel change periodically (currently 14 € for absences of 8–24 hours and 28 € for full-day absences of 24 hours). The threshold and amount are not configurable without a code change.
- **Impact**: If the legal rate changes, incorrect harcirah amounts are calculated and could cause tax compliance issues.
- **Suggested fix**: Move `HARCIRAH_THRESHOLD_HOURS` and `HARCIRAH_AMOUNT` to a configuration file or environment variable. Consider adding a 24-hour tier for the full-day 28 € rate.

---

### FINDING-ST-20: `workers/[id].js` — numeric fields not coerced to numbers during PUT
- **Severity**: Low
- **File**: `api/_handlers/workers/[id].js:26-29`
- **Pattern**: Missing input validation
- **Description**: For `numericFields` (`hourly_rate`, `monthly_salary`, `vacation_entitlement`), the code only nullifies empty-string and null values. It does not coerce non-empty string values to numbers. If the client sends `hourly_rate: "12.5"` (a string), that string is stored directly in the database. PostgreSQL will coerce it on insert for numeric columns, but the lack of server-side validation means negative values, extremely large numbers, or non-numeric strings are not rejected.
- **Impact**: Malformed numeric data could be stored; negative `hourly_rate` or `monthly_salary` would silently produce wrong surplus calculations.
- **Suggested fix**: For each numeric field, parse and validate the value: `const num = parseFloat(val); if (isNaN(num) || num < 0) return res.status(400).json(...)`.

---

### FINDING-ST-21: `time-entries/[id].js` — setting `resolved = true` does not validate that check_in/check_out are valid
- **Severity**: Low
- **File**: `api/_handlers/time-entries/[id].js:17-20`
- **Pattern**: Business logic edge cases, missing input validation
- **Description**: When `resolved = true` is set on a time entry, `is_flagged` is cleared. However, there is no check that the entry actually has valid `check_in` and `check_out` timestamps at the point of resolution. A flagged entry could be marked resolved while still having a null `check_out`, which would then contribute `0` hours to the monthly total via `calculateDailyHours` — silently under-counting the worker's hours.
- **Impact**: Resolved entries with missing timestamps contribute zero hours; worker monthly totals are understated.
- **Suggested fix**: Before marking an entry resolved, query the current row and verify that `check_in` and `check_out` are both non-null. Return a 422 if either is missing.

---

## Cross-Cutting Observations

1. **No role-based authorization**: All handlers use `checkAuth` which only verifies that a valid JWT exists. There is no check on `req.user.role`. Any authenticated user (worker, manager, admin) can call any endpoint including payouts, sick-leave overrides, and hour-balance sync. A role-based access control layer is absent.

2. **No pagination on list endpoints**: `workers/index.js`, `time-entries/index.js`, `sick-leave/index.js`, and `vacation/index.js` all return unbounded result sets. On a large dataset these will time out or return oversized payloads.

3. **`syncMonthForAll` has no concurrency protection**: Two simultaneous calls to the sync endpoint for the same year/month will run two concurrent `INSERT … ON CONFLICT DO UPDATE` loops over the same workers, potentially producing double-updates. The UPSERT is idempotent for the value written but generates unnecessary DB load and could interleave with a concurrent payout.
