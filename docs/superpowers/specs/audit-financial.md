# Financial Domain Audit

**Date:** 2026-03-27
**Scope:** `src/services/timesheetGeneration.js`, `src/services/pdfReport.js`, `src/services/analytics.js`, `api/_handlers/reports/`, `api/_handlers/timesheets/`, `api/_handlers/analytics/`

---

## FINDING-FN-1: `formatClockTime` / `formatDuration` can produce "X:60"

**File:** [timesheetGeneration.js:27-38](src/services/timesheetGeneration.js#L27-L38)
**Severity:** Medium
**Category:** Calculation accuracy

`Math.round((decimalHours - h) * 60)` can produce `60` when the fractional part is very close to 1.0 (e.g., `decimalHours = 7.999` → `h=7`, `m=Math.round(0.999*60)=60` → `"7:60"`). Same issue exists in `formatTotalDuration`.

**Impact:** Invalid time strings appear on PDF timesheets and could confuse payroll processing.

**Fix:** After rounding, check if `m >= 60` and carry over to the hour.

---

## FINDING-FN-2: Division by zero if `hourly_rate` is 0

**File:** [timesheetGeneration.js:110](src/services/timesheetGeneration.js#L110)
**Severity:** High
**Category:** Null/edge-case access

```js
const totalHours = Math.round((Number(monthlySalary) / Number(hourlyRate)) * 100) / 100;
```

If `hourlyRate` is `0`, `null` coerced to 0, or an empty string, the division produces `Infinity` or `NaN`. This propagates through work-day distribution, generating garbage entries.

**Impact:** Corrupted timesheet PDFs, potential infinite loop in day distribution.

**Fix:** Guard: `if (!hourlyRate || Number(hourlyRate) <= 0) return { entries: [], totalHours: 0 };`

---

## FINDING-FN-3: Last-day hours can go negative

**File:** [timesheetGeneration.js:130-135](src/services/timesheetGeneration.js#L130-L135)
**Severity:** Medium
**Category:** Calculation accuracy

The rounding to nearest 0.5h on line 130 can cause cumulative drift. The correction on line 135 (`totalHours - sumWithout`) compensates, but if rounding pushed earlier days above the total, the last day gets negative hours. `Math.round(negative * 2) / 2` preserves the negative value.

**Impact:** A timesheet day could show negative work hours, producing an invalid PDF entry.

**Fix:** Clamp `dayHours[last]` to `Math.max(0, ...)` and log a warning if clamped.

---

## FINDING-FN-4: No month/year validation

**File:** [timesheetGeneration.js:109](src/services/timesheetGeneration.js#L109), [pdfReport.js:26](src/services/pdfReport.js#L26)
**Severity:** Low
**Category:** Missing input validation

`MONTH_NAMES[month - 1]` and `MONTH_SHORT[month - 1]` return `undefined` for out-of-range months (0, 13, etc.). This produces filenames like `Stundenzettel_Name_undefined_2026.pdf`.

**Impact:** Broken filenames in Supabase storage; confusing PDF headers.

**Fix:** Validate `month >= 1 && month <= 12` at service entry points.

---

## FINDING-FN-5: `getPublicUrl` return value not null-checked

**File:** [timesheetGeneration.js:272-274](src/services/timesheetGeneration.js#L272-L274)
**Severity:** Low
**Category:** Null access

```js
const { data: { publicUrl } } = getSupabase().storage.from('photos').getPublicUrl(storagePath);
```

If `data` is null/undefined (unexpected Supabase response), destructuring throws `TypeError: Cannot destructure property 'publicUrl' of undefined`. Same pattern at [pdfReport.js:153-155](src/services/pdfReport.js#L153-L155).

**Impact:** Unhandled crash during timesheet/report generation. The PDF is uploaded but the DB record is never created.

---

## FINDING-FN-6: `generateTimesheets` is not atomic

**File:** [timesheetGeneration.js:237-289](src/services/timesheetGeneration.js#L237-L289)
**Severity:** Medium
**Category:** Missing error handling

The loop over workers uploads PDFs and upserts DB records one at a time. If worker 3 of 5 fails, workers 1-2 have timesheets while 3-5 do not. No rollback of uploads or DB inserts.

**Impact:** Partial generation state with no indication of which workers succeeded. Re-running uses `upsert: true` so it's recoverable, but the API returns an error without reporting partial results.

---

## FINDING-FN-7: Sick leave query misses cross-month spans

**File:** [pdfReport.js:38-42](src/services/pdfReport.js#L38-L42)
**Severity:** High
**Category:** Date/timezone error

```sql
WHERE EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2
```

A sick leave starting March 28 with 10 declared days extends into April, but this query only returns it for March. The April report misses the worker's sick days entirely.

**Impact:** Monthly salary reports undercount sick days for cross-month absences, leading to incorrect payroll calculations.

**Fix:** Use range overlap: `WHERE start_date <= $end_of_month AND start_date + declared_days > $start_of_month`.

---

## FINDING-FN-8: Falsy-zero bug in `aok_approved_days`

**File:** [pdfReport.js:59](src/services/pdfReport.js#L59)
**Severity:** High
**Category:** Null access / logic error

```js
const sickDays = workerSick.reduce((sum, s) => sum + (s.aok_approved_days || s.declared_days), 0);
```

If `aok_approved_days` is explicitly `0` (AOK approved zero days), `0 || s.declared_days` falls through to `declared_days`. This overcounts sick days — the AOK rejection is ignored.

**Impact:** Worker shown as having sick days when AOK approved none, affecting salary calculation.

**Fix:** Use nullish coalescing: `s.aok_approved_days ?? s.declared_days`.

---

## FINDING-FN-9: Null propagation in `vacation_deducted_days` and `unpaid_days`

**File:** [pdfReport.js:60-61](src/services/pdfReport.js#L60-L61)
**Severity:** Medium
**Category:** Null access

```js
const vacDeducted = workerSick.reduce((sum, s) => sum + s.vacation_deducted_days, 0);
const unpaid = workerSick.reduce((sum, s) => sum + s.unpaid_days, 0);
```

If either column is `NULL` in the database, adding `null` to a number produces `NaN`, which then appears in the PDF report as "NaN T".

**Impact:** Corrupted report display.

**Fix:** Use `(s.vacation_deducted_days || 0)` or `(s.unpaid_days ?? 0)`.

---

## FINDING-FN-10: Report delete handler uses wrong storage path

**File:** [reports/[id]/index.js:32](api/_handlers/reports/[id]/index.js#L32)
**Severity:** High
**Category:** Logic error

```js
const storagePath = `reports/Gehaltsbericht_${String(report.month).padStart(2, '0')}_${report.year}.pdf`;
```

But `pdfReport.js:79` generates the path as:
```js
const filename = `Gehaltsbericht_${MONTH_NAMES[month - 1]}_${year}.pdf`;
```

The delete handler uses zero-padded month number (e.g., `03`) while the generator uses German month name (e.g., `Maerz`). The Supabase `remove()` call targets a non-existent path, silently leaving the PDF orphaned.

**Impact:** Deleted reports remain in Supabase storage indefinitely, accumulating storage costs.

**Fix:** Either store the actual `storagePath` in the DB record, or reconstruct it identically using `MONTH_NAMES`.

---

## FINDING-FN-11: No overtime multiplier in cost calculation

**File:** [analytics.js:113](src/services/analytics.js#L113)
**Severity:** Medium
**Category:** Calculation accuracy / business logic

```js
const overtimeCost = overtimeHours * r.hourly_rate;
```

German labor law (ArbZG / collective agreements) typically requires overtime pay at 1.25x–1.5x the base rate. Using the base rate means the cost analytics underreport actual labor costs.

**Impact:** Cost reports and utilization metrics are systematically too low for workers with overtime.

**Fix:** Apply the appropriate overtime multiplier per worker type or per collective agreement.

---

## FINDING-FN-12: `computeDailyAnalyticsForDate` DELETE+INSERT not in transaction

**File:** [analytics.js:177-196](src/services/analytics.js#L177-L196)
**Severity:** Medium
**Category:** Missing error handling / race condition

The `DELETE FROM analytics_daily WHERE date = $1` followed by individual `INSERT` statements is not wrapped in a transaction. If two cron invocations overlap or the process crashes mid-insert, analytics data for that date is lost.

**Impact:** Missing analytics data for certain dates; silent data loss.

**Fix:** Wrap in `BEGIN`/`COMMIT`/`ROLLBACK` using `pool.connect()`.

---

## FINDING-FN-13: `computePropertyMonthlyForMonth` same non-transactional pattern

**File:** [analytics.js:282-301](src/services/analytics.js#L282-L301)
**Severity:** Medium
**Category:** Missing error handling / race condition

Same DELETE+INSERT-without-transaction as FINDING-FN-12. Concurrent calls or crashes during the INSERT leave `analytics_property_monthly` empty for that month.

---

## FINDING-FN-14: No date format validation on analytics query params

**File:** [analytics/index.js:13-14](api/_handlers/analytics/index.js#L13-L14)
**Severity:** Low
**Category:** Missing input validation

`from` and `to` query parameters are passed directly to SQL without format validation. Invalid date strings like `"abc"` will cause a PostgreSQL error. While parameterized (no SQL injection), the error message leaks DB internals.

**Fix:** Validate with a regex like `/^\d{4}-\d{2}-\d{2}$/` before querying.

---

## FINDING-FN-15: Report generation month/year not validated at API layer

**File:** [reports/generate.js:12-13](api/_handlers/reports/generate.js#L12-L13)
**Severity:** Low
**Category:** Missing input validation

```js
const { month, year } = req.body;
if (!month || !year) return res.status(400).json({ error: 'month and year required' });
```

`parseInt("abc")` → `NaN`, and `!NaN` is `true`, so it's caught. But `parseInt("13")` → `13` passes validation and produces `MONTH_NAMES[12]` = `undefined`. Same for `month = 0`.

---

## FINDING-FN-16: `Content-Disposition` filename not RFC 5987 encoded

**File:** [analytics/export.js:79](api/_handlers/analytics/export.js#L79)
**Severity:** Low
**Category:** Special characters

```js
res.setHeader('Content-Disposition', `attachment; filename="analytics-${from}-${to}.xlsx"`);
```

While `from`/`to` are date strings (safe characters), if the format ever changes, special characters could break the header. Minor, but worth noting for robustness.

---

## FINDING-FN-17: Excel export silently omits Properties sheet if `month` missing

**File:** [analytics/export.js:36](api/_handlers/analytics/export.js#L36)
**Severity:** Low
**Category:** Missing error handling

If the `month` query param is not provided, the Properties ("Objekte") sheet is simply omitted from the Excel file with no indication. Users may not realize data is missing.

---

## FINDING-FN-18: Timesheet DELETE handler uses fragile regex for storage path

**File:** [timesheets/[id].js:29](api/_handlers/timesheets/[id].js#L29)
**Severity:** Medium
**Category:** Logic error

```js
const pathMatch = ts.pdf_path.match(/\/photos\/(.+)$/);
```

This regex extracts the storage path from the public URL. If the Supabase URL format changes (e.g., versioned paths, CDN prefix), the regex fails silently and the PDF is orphaned in storage.

**Impact:** Storage leak — deleted timesheets leave PDFs in Supabase.

**Fix:** Store the storage path separately in the DB, not just the public URL.

---

## FINDING-FN-19: PDF footer overlaps table on multi-page reports

**File:** [pdfReport.js:138](src/services/pdfReport.js#L138)
**Severity:** Low
**Category:** PDF generation with edge cases

```js
doc.text(`Erstellt am ...`, 50, 780, { align: 'center' });
```

The footer is placed at fixed y=780 regardless of table position. On multi-page reports where the last page has rows near the bottom, the footer overlaps the table data.

---

## FINDING-FN-20: Report download redirects to unprotected public URL

**File:** [reports/[id]/download.js:16](api/_handlers/reports/[id]/download.js#L16)
**Severity:** Low
**Category:** Security

```js
res.redirect(report.pdf_path);
```

The `pdf_path` is a Supabase public URL. Anyone with the URL can access salary reports without authentication. While the API endpoint requires auth, the underlying URL is not time-limited.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| High     | 3     | FN-2, FN-7, FN-8, FN-10 |
| Medium   | 7     | FN-1, FN-3, FN-6, FN-9, FN-11, FN-12, FN-13, FN-18 |
| Low      | 9     | FN-4, FN-5, FN-14, FN-15, FN-16, FN-17, FN-19, FN-20 |

**Critical path:** FINDING-FN-8 (falsy-zero sick days) and FINDING-FN-7 (cross-month sick leave) directly affect salary calculations and should be prioritized.
