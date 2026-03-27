# Frontend Domain Audit

**Date**: 2026-03-27
**Scope**: `client/src/pages/`, `client/src/components/`, `client/src/api/client.js`, `client/src/App.jsx`
**Auditor**: Claude Opus 4.6

---

## Summary

Audited 17 pages, 12 components, 1 API client, and the root App component. Found 32 issues across critical, high, medium, and low severity. The most pervasive problems are: missing `useEffect` dependency arrays (causing stale closures or infinite loops), unhandled API errors in `Workers.jsx`, date timezone inconsistencies from `toISOString()`, missing loading states, and accessibility gaps throughout.

---

## Findings

### FINDING-FE-1: Workers page has uncaught API error on initial load
- **Severity**: High
- **File(s)**: `client/src/pages/Workers.jsx`
- **Line(s)**: 21-24
- **Description**: `loadWorkers` does not have a try/catch. If the API call fails, the promise rejection is unhandled and no error is shown to the user.
- **Risk**: Unhandled promise rejection causes silent failure; user sees empty table with no explanation.
- **Recommendation**: Wrap `api.get('/workers')` in try/catch and call `setError(err.message)` on failure, matching the pattern used in other pages.

### FINDING-FE-2: useEffect missing dependency arrays cause stale closures
- **Severity**: High
- **File(s)**: `client/src/pages/TimeEntries.jsx`, `client/src/pages/SickLeave.jsx`, `client/src/pages/Vacation.jsx`, `client/src/pages/HourBalances.jsx`, `client/src/pages/ExtraJobs.jsx`, `client/src/pages/Reports.jsx`, `client/src/pages/DailyTasks.jsx`, `client/src/pages/DailyPlan.jsx`, `client/src/pages/DailyOperations.jsx`, `client/src/pages/Workers.jsx`, `client/src/pages/Properties.jsx`
- **Line(s)**: Various `useEffect` calls (e.g., TimeEntries.jsx:35, DailyPlan.jsx:23-26, Workers.jsx:27)
- **Description**: Multiple `useEffect` hooks call async functions that close over state (e.g., `month`, `year`, `date`) but do not include the async function or relevant state in the dependency array. React lint rules would flag these. In some cases `load` is declared as a standalone function and referenced inside `useEffect(() => { load(); }, [date])` without `load` in deps.
- **Risk**: Stale closure bugs where the fetched data does not correspond to current UI state. Also triggers React exhaustive-deps lint warnings.
- **Recommendation**: Either move the async function inside the `useEffect`, or wrap it with `useCallback` with proper deps, or use the function reference in the deps array.

### FINDING-FE-3: Date constructed with `toISOString()` produces wrong date in non-UTC timezones
- **Severity**: High
- **File(s)**: `client/src/pages/DailyPlan.jsx`, `client/src/pages/DailyOperations.jsx`, `client/src/pages/DailyTasks.jsx`, `client/src/pages/Dashboard.jsx`, `client/src/pages/CommandCenter.jsx`
- **Line(s)**: DailyPlan.jsx:14, DailyOperations.jsx:6-7, DailyTasks.jsx:6-8, Dashboard.jsx:7, CommandCenter.jsx:20
- **Description**: `todayStr()` and similar use `new Date().toISOString().slice(0,10)` which converts to UTC. For a user in CET (UTC+1/+2) after midnight but before 01:00/02:00 UTC, this returns yesterday's date.
- **Risk**: Users see the wrong day's data around midnight. Daily plans, tasks, and operations show stale data.
- **Recommendation**: Use local date construction: `const d = new Date(); const str = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');` -- as already done in `WeeklyPlanner.jsx` with `toDateStr()`.

### FINDING-FE-4: DailyPlan and DailyOperations fetch ALL plans then filter client-side
- **Severity**: Medium
- **File(s)**: `client/src/pages/DailyPlan.jsx`, `client/src/pages/DailyOperations.jsx`
- **Line(s)**: DailyPlan.jsx:32-36, DailyOperations.jsx:40-44
- **Description**: Both pages call `api.get('/daily-plans')` to fetch all plans, then iterate to find the one matching the selected date. This is O(n) on all plans and transfers unnecessary data.
- **Risk**: Performance degrades as plan count grows. Unnecessary network bandwidth.
- **Recommendation**: Add a server-side query parameter (e.g., `/daily-plans?date=2026-03-27`) and return a single plan.

### FINDING-FE-5: `confirm()` and `prompt()` used for user interactions
- **Severity**: Medium
- **File(s)**: `client/src/pages/GarbageSchedule.jsx`, `client/src/pages/Workers.jsx`, `client/src/pages/Properties.jsx`, `client/src/pages/ExtraJobs.jsx`, `client/src/pages/DailyTasks.jsx`, `client/src/pages/DailyOperations.jsx`, `client/src/pages/Reports.jsx`
- **Line(s)**: GarbageSchedule.jsx:199,210, Workers.jsx:50, Properties.jsx:96, ExtraJobs.jsx:62, DailyTasks.jsx:72-75, DailyOperations.jsx:104-106
- **Description**: Native `confirm()` and `prompt()` are used for delete confirmations and collecting postpone reasons. These block the main thread, cannot be styled, do not support i18n, and may be blocked by some browsers.
- **Risk**: Poor UX, accessibility issues (screen readers struggle with native dialogs), and no ability to cancel in-flight operations.
- **Recommendation**: Replace with custom modal components that support the app's design system and translations.

### FINDING-FE-6: Login form has no loading/disabled state during submission
- **Severity**: Medium
- **File(s)**: `client/src/pages/Login.jsx`
- **Line(s)**: 14-23, 57
- **Description**: The login button has no `disabled` state while the login request is in-flight. Users can click submit multiple times.
- **Risk**: Multiple concurrent login requests; confusing UX if the network is slow.
- **Recommendation**: Add a `loading` state, disable the button while submitting, and show a spinner or text change.

### FINDING-FE-7: Analytics export opens URL without authentication header
- **Severity**: High
- **File(s)**: `client/src/pages/Analytics.jsx`
- **Line(s)**: 89-93
- **Description**: `handleExport` uses `window.open(url, '_blank')` to download the export file. This does not include the Bearer token in the Authorization header.
- **Risk**: The export endpoint will return 401 Unauthorized (or the API client will redirect to login if it intercepts), making the export feature non-functional unless the server has a separate auth mechanism (e.g., cookie or token query param).
- **Recommendation**: Either pass the token as a query parameter (as done in `Reports.jsx` lines 66-68) or use `fetch()` with proper headers and trigger a blob download.

### FINDING-FE-8: Reports download exposes JWT token in URL
- **Severity**: High
- **File(s)**: `client/src/pages/Reports.jsx`
- **Line(s)**: 66-68, 70-72
- **Description**: `handleDownload` and `handleDownloadTimesheet` pass the JWT token as a query parameter in `window.open()`. This token is logged in browser history, server access logs, and any intermediary proxy logs.
- **Risk**: Token leakage via URL. If an attacker gains access to browser history or server logs, they can impersonate the user.
- **Recommendation**: Use `fetch()` with Authorization header, create a Blob from the response, and trigger a download via a temporary `<a>` element with `URL.createObjectURL()`.

### FINDING-FE-9: CommandCenter uses `window.open` with `_self` instead of React Router navigation
- **Severity**: Medium
- **File(s)**: `client/src/pages/CommandCenter.jsx`
- **Line(s)**: 44-52
- **Description**: `handleAlertAction` uses `window.open('/sick-leave', '_self')` instead of React Router's `navigate()`. This causes a full page reload.
- **Risk**: Full page reload loses all React state, causes unnecessary flicker, and defeats the purpose of SPA routing.
- **Recommendation**: Import `useNavigate` and use `navigate('/sick-leave')`.

### FINDING-FE-10: StatsBar uses array index as key
- **Severity**: Low
- **File(s)**: `client/src/components/command-center/StatsBar.jsx`
- **Line(s)**: 53
- **Description**: The stats cards are keyed by array index (`key={i}`). While the array is static per render, this is a React anti-pattern.
- **Risk**: If the array order ever changes (e.g., conditional cards), React will misidentify elements and cause incorrect DOM updates.
- **Recommendation**: Use `card.label` as the key since it is unique.

### FINDING-FE-11: PropertyForm task list uses array index as key
- **Severity**: Medium
- **File(s)**: `client/src/components/PropertyForm.jsx`
- **Line(s)**: 136
- **Description**: `tasks.map((task, i) => <div key={i}>...)` uses index as key for a dynamic, reorderable list.
- **Risk**: When tasks are added or removed, React will incorrectly reuse DOM nodes, causing input values to appear in wrong rows or state corruption.
- **Recommendation**: Generate a unique ID for each task (e.g., `crypto.randomUUID()` or a counter) when added.

### FINDING-FE-12: WeeklyPlanner task list uses array index as key
- **Severity**: Medium
- **File(s)**: `client/src/pages/WeeklyPlanner.jsx`
- **Line(s)**: 376
- **Description**: `tasks.map((task, i) => <div key={i}>...)` uses index as key.
- **Risk**: Same as FINDING-FE-11. If tasks are reordered or filtered, DOM reconciliation will produce incorrect results.
- **Recommendation**: Use a unique task identifier (e.g., `task.id` or a composite of `task.property_id + task.task_name`).

### FINDING-FE-13: GarbageSchedule detail list uses array index as key
- **Severity**: Low
- **File(s)**: `client/src/pages/GarbageSchedule.jsx`
- **Line(s)**: 473
- **Description**: `detail.map((entry, i) => <div key={i}>...)`.
- **Risk**: Minimal in practice since the list is read-only, but violates best practices.
- **Recommendation**: Use `entry.collection_date + entry.trash_type` as key.

### FINDING-FE-14: No loading state for initial data fetch on several pages
- **Severity**: Medium
- **File(s)**: `client/src/pages/Workers.jsx`, `client/src/pages/Properties.jsx`, `client/src/pages/SickLeave.jsx`, `client/src/pages/ExtraJobs.jsx`
- **Line(s)**: Workers.jsx (no loading state variable), Properties.jsx (no loading state variable), SickLeave.jsx (no loading state variable), ExtraJobs.jsx (no loading state variable)
- **Description**: These pages have no `loading` state. The table renders immediately with zero rows, then data appears. There is no loading indicator.
- **Risk**: Users may briefly see "no data" empty state before data loads, creating a confusing flash.
- **Recommendation**: Add a `loading` boolean state, show a spinner or skeleton while data is being fetched.

### FINDING-FE-15: Empty catch block silently swallows errors
- **Severity**: Medium
- **File(s)**: `client/src/pages/DailyOperations.jsx`, `client/src/pages/DailyPlan.jsx`, `client/src/pages/WeeklyPlanner.jsx`
- **Line(s)**: DailyOperations.jsx:62, DailyPlan.jsx:55-56, WeeklyPlanner.jsx:87
- **Description**: `loadWorkers` in DailyOperations has an empty `catch {}`. DailyPlan has `catch (err) { // Non-critical }`. WeeklyPlanner has `.catch(() => {})` for properties and workers.
- **Risk**: API failures are silently swallowed. If the workers endpoint is down, the reassign dropdown will be empty with no indication why.
- **Recommendation**: At minimum log the error to console; ideally show a non-blocking warning.

### FINDING-FE-16: Accessibility -- form inputs missing labels
- **Severity**: Medium
- **File(s)**: `client/src/pages/Login.jsx`
- **Line(s)**: 39-55
- **Description**: Login form inputs use `placeholder` text but have no `<label>` elements or `aria-label` attributes.
- **Risk**: Screen readers cannot identify the purpose of the input fields. Fails WCAG 2.1 Level A (1.3.1 Info and Relationships).
- **Recommendation**: Add `<label>` elements associated via `htmlFor`/`id`, or add `aria-label` attributes.

### FINDING-FE-17: Accessibility -- interactive elements missing accessible names
- **Severity**: Medium
- **File(s)**: `client/src/pages/DailyOperations.jsx`, `client/src/pages/WeeklyPlanner.jsx`, `client/src/components/Layout.jsx`
- **Line(s)**: DailyOperations.jsx:177-183 (prev/next buttons), WeeklyPlanner.jsx:211-219 (nav buttons), Layout.jsx:141-165 (language/theme buttons)
- **Description**: Icon-only buttons lack `aria-label` attributes. Screen readers will announce them as empty or "button".
- **Risk**: Not navigable for users with assistive technology.
- **Recommendation**: Add `aria-label` to all icon-only buttons (e.g., `aria-label="Previous day"`, `aria-label="Next day"`).

### FINDING-FE-18: Accessibility -- SVG icons in nav items have no aria-hidden
- **Severity**: Low
- **File(s)**: `client/src/components/Layout.jsx`
- **Line(s)**: 11-89 (all nav item icons)
- **Description**: Inline SVG icons in navigation items are not marked with `aria-hidden="true"`. Screen readers may try to announce them.
- **Risk**: Verbose and confusing screen reader output.
- **Recommendation**: Add `aria-hidden="true"` to decorative SVGs, or wrap them in a span with `aria-hidden`.

### FINDING-FE-19: Accessibility -- tables lack `scope` attributes on headers
- **Severity**: Low
- **File(s)**: All pages with `<table>` elements (TimeEntries, SickLeave, Vacation, Workers, Properties, ExtraJobs, Reports, HourBalances, GarbageSchedule, Analytics)
- **Line(s)**: Various `<th>` elements
- **Description**: Table header cells (`<th>`) do not have `scope="col"` attributes.
- **Risk**: Screen readers may not correctly associate header cells with data cells.
- **Recommendation**: Add `scope="col"` to all `<th>` elements in `<thead>`.

### FINDING-FE-20: API client returns `undefined` on 401
- **Severity**: Medium
- **File(s)**: `client/src/api/client.js`
- **Line(s)**: 14-18
- **Description**: When a 401 response is received, the function removes the token, redirects to `/login`, and then returns `undefined` (implicit return). Any calling code that awaits the result and tries to use it (e.g., `setData(result)`) will receive `undefined`.
- **Risk**: Downstream code may throw a TypeError (e.g., "Cannot read properties of undefined") before the redirect takes effect.
- **Recommendation**: Throw an error after the redirect, or return a rejected promise, so callers' catch blocks handle it cleanly.

### FINDING-FE-21: API client does not handle non-JSON error responses
- **Severity**: Low
- **File(s)**: `client/src/api/client.js`
- **Line(s)**: 21
- **Description**: On non-ok responses, `res.json().catch(() => ({ error: 'Request failed' }))` is used, which gracefully handles non-JSON. However, on successful responses (line 25), `res.json()` is called without a catch. If the server returns a 200 with non-JSON body (e.g., empty body for DELETE), this will throw.
- **Risk**: DELETE responses that return 204 No Content or empty bodies will cause parse errors.
- **Recommendation**: Check `res.status === 204` or `Content-Length: 0` before parsing JSON.

### FINDING-FE-22: GarbageSchedule upload bypasses API client
- **Severity**: Medium
- **File(s)**: `client/src/pages/GarbageSchedule.jsx`
- **Line(s)**: 144-156
- **Description**: The file upload handler directly uses `fetch()` with manual token retrieval from `localStorage`, bypassing the `api` client. This duplicates auth logic and does not benefit from the 401 redirect handler.
- **Risk**: If the token is expired, the user will see a raw error instead of being redirected to login. Auth logic is duplicated and may drift.
- **Recommendation**: Either extend the API client to support FormData (by conditionally omitting `Content-Type`), or at minimum replicate the 401 handling.

### FINDING-FE-23: FlagBadge renders unsanitized `reason` text
- **Severity**: Low
- **File(s)**: `client/src/components/FlagBadge.jsx`
- **Line(s)**: 4
- **Description**: The `reason` prop is rendered directly as text content `{reason}`. React's JSX escaping prevents XSS for text nodes, so this is safe. No `dangerouslySetInnerHTML` is used anywhere in the codebase.
- **Risk**: No XSS risk. This is informational -- the codebase correctly avoids `dangerouslySetInnerHTML`.
- **Recommendation**: No action needed. This is a positive finding.

### FINDING-FE-24: CommandCenter polling interval has no cleanup guard
- **Severity**: Low
- **File(s)**: `client/src/pages/CommandCenter.jsx`
- **Line(s)**: 38-42
- **Description**: The polling `useEffect` properly clears the interval on unmount. However, `fetchData` updates state without checking if the component is still mounted. In React 18 strict mode, this could cause a setState-on-unmounted warning.
- **Risk**: Minor -- React 18 actually removed the "setState on unmounted" warning. But during the brief window between unmount and interval clear, a pending fetch could set state.
- **Recommendation**: Use an AbortController to cancel in-flight requests on cleanup.

### FINDING-FE-25: SickLeave edit form uses `parseInt` without fallback for empty input
- **Severity**: Medium
- **File(s)**: `client/src/pages/SickLeave.jsx`
- **Line(s)**: 126, 131, 136
- **Description**: `parseInt(e.target.value)` is called on number inputs. If the user clears the input, `parseInt('')` returns `NaN`, which is sent to the API.
- **Risk**: API receives `NaN` values which may cause server-side errors or corrupt data.
- **Recommendation**: Use `parseInt(e.target.value) || 0` or validate before submission.

### FINDING-FE-26: HourBalances hardcoded English labels
- **Severity**: Low
- **File(s)**: `client/src/pages/HourBalances.jsx`
- **Line(s)**: 139, 145
- **Description**: The stat labels "Surplus" and "Deficit" are hardcoded in English, not using the `t()` translation function.
- **Risk**: Labels do not translate when the user switches to German.
- **Recommendation**: Replace with `t('hourBalances.surplus')` and `t('hourBalances.deficit')`.

### FINDING-FE-27: DailyOperations hardcoded German/English strings
- **Severity**: Low
- **File(s)**: `client/src/pages/DailyOperations.jsx`
- **Line(s)**: 224, 380
- **Description**: `{lang === 'de' ? 'Mitarbeiter' : 'Workers'}` and `{lang === 'de' ? 'Objekte' : 'properties'}` bypass the translation system.
- **Risk**: If a third language is added, these strings will not translate.
- **Recommendation**: Add translation keys and use `t()`.

### FINDING-FE-28: GarbageSchedule hardcoded German/English strings
- **Severity**: Low
- **File(s)**: `client/src/pages/GarbageSchedule.jsx`
- **Line(s)**: 235, 239, 241, 273-274, 293-294
- **Description**: Multiple strings like "Vorherige", "Naechste", "Heute", "Rausstellen", "Reinholen" use inline ternaries instead of the translation system.
- **Risk**: Same as FINDING-FE-27.
- **Recommendation**: Add translation keys and use `t()`.

### FINDING-FE-29: DailyTasks hardcoded "Heute"/"Today" string
- **Severity**: Low
- **File(s)**: `client/src/pages/DailyTasks.jsx`
- **Line(s)**: 128
- **Description**: `{lang === 'de' ? 'Heute' : 'Today'}` bypasses translation system.
- **Risk**: Same as FINDING-FE-27.
- **Recommendation**: Use `t('common.today')`.

### FINDING-FE-30: Dashboard and DailyPlan are orphaned / unreachable routes
- **Severity**: Low
- **File(s)**: `client/src/App.jsx`, `client/src/pages/Dashboard.jsx`, `client/src/pages/DailyPlan.jsx`, `client/src/pages/DailyTasks.jsx`
- **Line(s)**: App.jsx:33-51
- **Description**: `Dashboard.jsx`, `DailyPlan.jsx`, and `DailyTasks.jsx` are not included in any route in `App.jsx`. They are imported but never rendered (Dashboard is not imported at all; DailyPlan and DailyTasks are imported but have no route). CommandCenter replaced Dashboard as the index route.
- **Risk**: Dead code increases bundle size. DailyTasks and DailyPlan features are inaccessible to users.
- **Recommendation**: Remove unused imports and files, or add routes if the pages are intended to be reachable.

### FINDING-FE-31: WeeklyPlanner filter uses `is_active` property that may not exist
- **Severity**: Low
- **File(s)**: `client/src/pages/WeeklyPlanner.jsx`
- **Line(s)**: 274, 281
- **Description**: `properties.filter(p => p.is_active)` and `workers.filter(w => w.is_active)` assume an `is_active` field. The Properties page does not filter by this field, suggesting the API may not include it or it may not be set on all records.
- **Risk**: If `is_active` is undefined (truthy check passes for undefined is false), the filter will exclude all items, resulting in empty dropdowns.
- **Recommendation**: Verify the API returns `is_active` on property and worker objects. If not available, remove the filter or use a different field.

### FINDING-FE-32: Vacation year input allows invalid values
- **Severity**: Low
- **File(s)**: `client/src/pages/Vacation.jsx`
- **Line(s)**: 45
- **Description**: The year input is `type="number"` with no `min`/`max` constraints. Users can enter negative numbers, zero, or far-future years.
- **Risk**: API receives nonsensical year values.
- **Recommendation**: Add `min={2020}` and `max={2030}` (or similar reasonable bounds) to the input.

---

## Summary Table

| ID | Severity | File(s) | Category |
|----|----------|---------|----------|
| FE-1 | High | Workers.jsx | Unhandled API failure |
| FE-2 | High | 11 pages | useEffect dependency arrays |
| FE-3 | High | 5 pages | Timezone date bug |
| FE-4 | Medium | DailyPlan, DailyOperations | Performance |
| FE-5 | Medium | 7 pages | UX / Accessibility |
| FE-6 | Medium | Login.jsx | Missing loading state |
| FE-7 | High | Analytics.jsx | Auth / broken feature |
| FE-8 | High | Reports.jsx | Security / token leakage |
| FE-9 | Medium | CommandCenter.jsx | Navigation bug |
| FE-10 | Low | StatsBar.jsx | Key props |
| FE-11 | Medium | PropertyForm.jsx | Key props |
| FE-12 | Medium | WeeklyPlanner.jsx | Key props |
| FE-13 | Low | GarbageSchedule.jsx | Key props |
| FE-14 | Medium | 4 pages | Missing loading state |
| FE-15 | Medium | 3 pages | Silent error swallowing |
| FE-16 | Medium | Login.jsx | Accessibility |
| FE-17 | Medium | 3 files | Accessibility |
| FE-18 | Low | Layout.jsx | Accessibility |
| FE-19 | Low | 10 pages | Accessibility |
| FE-20 | Medium | client.js | API error handling |
| FE-21 | Low | client.js | API error handling |
| FE-22 | Medium | GarbageSchedule.jsx | Auth bypass |
| FE-23 | Low | FlagBadge.jsx | XSS (positive finding) |
| FE-24 | Low | CommandCenter.jsx | Memory leak |
| FE-25 | Medium | SickLeave.jsx | Input validation |
| FE-26 | Low | HourBalances.jsx | i18n |
| FE-27 | Low | DailyOperations.jsx | i18n |
| FE-28 | Low | GarbageSchedule.jsx | i18n |
| FE-29 | Low | DailyTasks.jsx | i18n |
| FE-30 | Low | App.jsx, 3 pages | Dead code |
| FE-31 | Low | WeeklyPlanner.jsx | Data assumption |
| FE-32 | Low | Vacation.jsx | Input validation |

**Totals**: 5 High, 13 Medium, 14 Low
