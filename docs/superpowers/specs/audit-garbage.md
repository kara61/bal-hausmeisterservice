# Garbage Domain Audit

**Date:** 2026-03-27
**Scope:** `src/services/garbageScheduling.js`, `src/services/awpParser.js`, `api/_handlers/garbage/`

---

## FINDING-GB-1: `generateGarbageTasks` has no transaction — race conditions

**File:** [garbageScheduling.js:84-118](src/services/garbageScheduling.js#L84-L118)
**Severity:** High
**Category:** Race condition / missing error handling

`generateGarbageTasks` performs multiple queries (check existence, update task_assignment description, insert garbage_task) without a transaction. If the daily cron fires twice or overlapping requests occur:

- Two calls both see "no existing garbage_task" and both proceed to insert
- The `ON CONFLICT DO NOTHING` on `garbage_tasks` prevents duplicate rows, but the task_assignment description gets the garbage text appended twice (e.g., `"gelb Tonnen raus, gelb Tonnen raus"`)

**Impact:** Duplicate text in task descriptions shown to field workers.

**Fix:** Wrap `createGarbageTask` (or the entire `generateGarbageTasks`) in a transaction with `SELECT ... FOR UPDATE` on the task_assignment row.

---

## FINDING-GB-2: Task description appending has no deduplication

**File:** [garbageScheduling.js:147-149](src/services/garbageScheduling.js#L147-L149)
**Severity:** Medium
**Category:** Logic error

```js
const newDescription = assignment.task_description
  ? `${assignment.task_description}, ${description}`
  : description;
```

If a task_assignment already contains "gelb Tonnen raus" and this function appends "gelb Tonnen raus" again (due to retry or re-run), the description becomes `"gelb Tonnen raus, gelb Tonnen raus"`. There's no check whether the description already contains the text.

**Impact:** Cluttered task descriptions confuse field workers.

**Fix:** Check `if (!assignment.task_description?.includes(description))` before appending.

---

## FINDING-GB-3: `deleteScheduleForProperty` orphans related `garbage_tasks`

**File:** [garbageScheduling.js:202-214](src/services/garbageScheduling.js#L202-L214)
**Severity:** High
**Category:** Data integrity

Deleting garbage schedules doesn't cascade to `garbage_tasks` that reference them via `garbage_schedule_id`. If the FK has no `ON DELETE CASCADE`, this leaves orphaned garbage_tasks pointing to non-existent schedules.

**Impact:** Orphaned tasks may cause errors in task listing queries or confuse workers with ghost tasks.

**Fix:** Either add `ON DELETE CASCADE` to the FK, or explicitly delete related `garbage_tasks` before deleting schedules.

---

## FINDING-GB-4: AWP parser `isValidDate` hardcodes default year 2024

**File:** [awpParser.js:40](src/services/awpParser.js#L40)
**Severity:** Low
**Category:** Date error

```js
function isValidDate(month, day, year = 2024) {
```

The default year `2024` is a leap year. If `isValidDate` is called without an explicit year (which doesn't happen in current code paths, but could in future use), Feb 29 would be accepted for non-leap years.

**Impact:** Currently no impact since all callers pass the year. Future risk if someone calls `isValidDate(2, 29)` without a year argument.

---

## FINDING-GB-5: `DOMMatrix` polyfill is incomplete

**File:** [awpParser.js:57-63](src/services/awpParser.js#L57-L63)
**Severity:** Medium
**Category:** AWP parser robustness

```js
globalThis.DOMMatrix = class DOMMatrix {
  constructor(init) {
    const v = init || [1, 0, 0, 1, 0, 0];
    this.a = v[0]; this.b = v[1]; this.c = v[2];
    this.d = v[3]; this.e = v[4]; this.f = v[5];
  }
};
```

This stub only implements the constructor. `pdfjs-dist` may call methods like `multiply()`, `inverse()`, `translate()`, `scale()`, etc. on `DOMMatrix` during rendering of certain PDF page types. If triggered, the error would be `TypeError: d.multiply is not a function` or similar.

**Impact:** Certain PDF layouts (rotated pages, scaled content) would crash the parser.

**Fix:** Use a complete DOMMatrix polyfill package (e.g., `dommatrix`) or use pdfjs-dist's built-in Node.js compatibility mode.

---

## FINDING-GB-6: No error handling for corrupted/encrypted PDFs

**File:** [awpParser.js:82](src/services/awpParser.js#L82)
**Severity:** Medium
**Category:** AWP parser robustness

```js
const doc = await pdfjsLib.getDocument({ data, disableAutoFetch: true, isEvalSupported: false }).promise;
```

If the uploaded file is corrupted, not a PDF, password-protected, or uses an unsupported PDF version, `getDocument` throws. This error propagates unhandled to the upload handler, which returns a generic "Internal server error".

**Impact:** User gets no useful feedback about why their PDF upload failed.

**Fix:** Wrap in try/catch and return a user-friendly 422 error: "Could not parse PDF. Ensure the file is a valid, unencrypted AWP schedule."

---

## FINDING-GB-7: Column X-position detection is fragile

**File:** [awpParser.js:15-20](src/services/awpParser.js#L15-L20)
**Severity:** Medium
**Category:** AWP parser robustness

```js
const COLUMNS = [
  { center: 80,  type: 'restmuell', tolerance: 30 },
  { center: 184, type: 'bio',       tolerance: 30 },
  { center: 289, type: 'papier',    tolerance: 30 },
  { center: 394, type: 'gelb',      tolerance: 30 },
];
```

These hardcoded positions are specific to the current AWP PDF layout. If AWP changes their PDF generator (different margins, font size, page layout), all dates silently fail to match a column and are dropped. The function returns `{ dates: [] }`, which the upload handler reports as "No collection dates found in PDF" — but with no indication that the column layout changed.

**Impact:** Silent data loss after AWP layout changes. Uploaded PDFs appear to contain no dates.

**Fix:** Add a diagnostic: if dates are found by regex but none match columns, return a specific warning like "Dates found but column layout not recognized — AWP format may have changed."

---

## FINDING-GB-8: `parseCollectionDates` (legacy) always assigns `restmuell`

**File:** [awpParser.js:148](src/services/awpParser.js#L148)
**Severity:** Low
**Category:** Logic error

```js
results.push({ trash_type: 'restmuell', collection_date: dateStr });
```

The legacy text-based parser assigns all dates as `restmuell` regardless of actual trash type. While documented as a fallback, if this path is ever triggered in production, it would create incorrect schedule entries.

**Impact:** Incorrect garbage schedules if legacy parser is used as fallback.

---

## FINDING-GB-9: `DATE_REGEX` silently skips 2-digit year dates

**File:** [awpParser.js:23](src/services/awpParser.js#L23)
**Severity:** Low
**Category:** AWP parser robustness

```js
const DATE_REGEX = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/;
```

The optional year group `(\d{4})?` requires exactly 4 digits if present. Dates formatted as "DD.MM.YY" (2-digit year, e.g., "15.03.26") would fail the regex and be silently skipped.

**Impact:** If AWP ever uses 2-digit years, those dates would be ignored.

---

## FINDING-GB-10: Upload handler ILIKE query vulnerable to SQL wildcard injection

**File:** [garbage/upload.js:53](api/_handlers/garbage/upload.js#L53)
**Severity:** Medium
**Category:** SQL injection (pattern)

```js
const { rows } = await pool.query(
  `SELECT id, address, city FROM properties WHERE address ILIKE $1 LIMIT 1`,
  [`%${candidate}%`]
);
```

The `candidate` value (from PDF text or filename) is wrapped in `%...%` but not escaped for LIKE metacharacters. A filename containing `%` or `_` would match unintended properties. For example, filename `"a%b.pdf"` would match any address containing "a" followed eventually by "b".

**Impact:** PDF could be auto-matched to wrong property, importing garbage schedules for the wrong building.

**Fix:** Escape `%` and `_` in the candidate: `candidate.replace(/%/g, '\\%').replace(/_/g, '\\_')`.

---

## FINDING-GB-11: Upload handler doesn't validate file is actually a PDF

**File:** [garbage/upload.js:16-19](api/_handlers/garbage/upload.js#L16-L19)
**Severity:** Medium
**Category:** Upload file validation

```js
const pdfFile = files.pdf?.[0];
if (!pdfFile) return res.status(400).json({ error: 'No PDF file uploaded' });
```

Only checks if a file exists in the `pdf` field, not that it's actually a PDF. A user could upload a JPEG, text file, or executable. `parseAwpPdf` would attempt to parse it and throw a cryptic pdfjs-dist error.

**Impact:** Confusing error messages for non-PDF uploads.

**Fix:** Check `pdfFile.mimetype === 'application/pdf'` or verify the file magic bytes.

---

## FINDING-GB-12: `schedule/[propertyId]` doesn't validate `propertyId` is numeric

**File:** [garbage/schedule/[propertyId].js:11](api/_handlers/garbage/schedule/[propertyId].js#L11)
**Severity:** Low
**Category:** Missing input validation

```js
const propertyId = parseInt(req.query.propertyId, 10);
```

If `propertyId` is non-numeric, `parseInt` returns `NaN`. The query `WHERE property_id = NaN` returns zero rows rather than an error. The user gets an empty array instead of a 400 error.

---

## FINDING-GB-13: `upcoming.js` accepts 0 and negative `days` values

**File:** [garbage/upcoming.js:9](api/_handlers/garbage/upcoming.js#L9)
**Severity:** Low
**Category:** Missing input validation

```js
const days = parseInt(req.query.days, 10) || 7;
```

`days = 0` is falsy, so it defaults to 7 (unexpected). Negative values like `-5` pass through and produce `CURRENT_DATE + -5 * INTERVAL '1 day'` which returns past dates instead of upcoming ones.

---

## FINDING-GB-14: Upload handler doesn't use `withErrorHandler` wrapper

**File:** [garbage/upload.js:8](api/_handlers/garbage/upload.js#L8)
**Severity:** Low
**Category:** Inconsistency / error handling

All other handlers use `withErrorHandler(async (req, res) => { ... })` but `upload.js` uses a raw `async function handler` with a manual try/catch. The error response is generic `"Internal server error"` without structured error details that `withErrorHandler` presumably provides.

**Impact:** Inconsistent error reporting; harder to debug upload failures.

---

## FINDING-GB-15: `map.js` handler doesn't validate `dates` array contents

**File:** [garbage/map.js:9](api/_handlers/garbage/map.js#L9)
**Severity:** Medium
**Category:** Missing input validation

```js
const { property_id, dates, source_pdf } = req.body;
```

The `dates` array is passed directly to `importScheduleFromPdf`. If entries lack `trash_type` or `collection_date` fields, the SQL insert fails with a PostgreSQL error that leaks column names. Malformed dates (e.g., `"2025-13-45"`) would be inserted without validation.

**Impact:** Bad data in `garbage_schedules` table; confusing DB error messages.

**Fix:** Validate each entry has `trash_type` (from allowed enum) and `collection_date` (valid YYYY-MM-DD format).

---

## FINDING-GB-16: Timezone mismatch risk between server and business timezone

**File:** [garbage/upcoming.js:14](api/_handlers/garbage/upcoming.js#L14), [garbageScheduling.js:84-88](src/services/garbageScheduling.js#L84-L88)
**Severity:** Medium
**Category:** Date/timezone error

`upcoming.js` uses `CURRENT_DATE` (PostgreSQL server time) while `generateGarbageTasks` constructs "tomorrow" using JavaScript `new Date()` (serverless function time). If the DB and serverless function are in different timezones, or either differs from Germany/Berlin, the "today" and "tomorrow" definitions can diverge.

Around midnight CET/CEST, a raus task for tomorrow's collection might be generated a day early or a day late.

**Impact:** Garbage bins put out on wrong day — operational failure.

**Fix:** Explicitly set timezone in both JS (`new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })`) and SQL (`CURRENT_DATE AT TIME ZONE 'Europe/Berlin'`), or pass `dateStr` from a single authoritative source.

---

## FINDING-GB-17: `extractAddressFromPdf` regex patterns are narrow

**File:** [awpParser.js:166-169](src/services/awpParser.js#L166-L169)
**Severity:** Low
**Category:** Property mapping edge case

The regex patterns require the first letter to be uppercase (`[A-ZÄÖÜ]`). Addresses like "am Hügel 7" (lowercase "am") or "von-der-Tann-Straße 5" (hyphenated) wouldn't match. PDF text extraction may also lowercase or merge characters unexpectedly.

**Impact:** Auto-matching fails for certain addresses, requiring manual property mapping.

---

## FINDING-GB-18: Leap year handling in date calculations

**File:** [garbageScheduling.js:12-18](src/services/garbageScheduling.js#L12-L18)
**Severity:** None (verified correct)
**Category:** Date math

`calculateRausDates` uses `new Date(year, month - 1, day - 1)` which correctly handles:
- Jan 1 → Dec 31 of previous year
- March 1 (non-leap) → Feb 28
- March 1 (leap) → Feb 29

JavaScript's `Date` constructor handles day underflow correctly. **No bug found.**

---

## FINDING-GB-19: DST transition handling in `generateGarbageTasks`

**File:** [garbageScheduling.js:86-87](src/services/garbageScheduling.js#L86-L87)
**Severity:** None (verified correct)
**Category:** Date math

```js
const tomorrow = new Date(year, month - 1, day + 1);
```

This uses calendar date arithmetic via the `Date` constructor, which handles DST transitions correctly (day+1 always produces the next calendar day regardless of clock changes). **No bug found** in the date math itself — but see FINDING-GB-16 for the timezone authority concern.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| High     | 2     | GB-1, GB-3 |
| Medium   | 7     | GB-2, GB-5, GB-6, GB-7, GB-10, GB-11, GB-15, GB-16 |
| Low      | 6     | GB-4, GB-8, GB-9, GB-12, GB-13, GB-14, GB-17 |
| None     | 2     | GB-18, GB-19 (verified correct) |

**Critical path:** FINDING-GB-1 (race condition in task generation) and FINDING-GB-3 (orphaned garbage_tasks on delete) are data integrity issues that should be fixed first. FINDING-GB-16 (timezone mismatch) is an operational risk for the core garbage scheduling feature.
