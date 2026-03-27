# Spec 3: Stundenkonto

**Date:** 2026-03-27
**Status:** Draft
**Part of:** Worker Roles → Structured Property Tasks → Stundenkonto (3-spec series)
**Depends on:** Spec 1 (Worker Roles) — completed, Spec 2 (Structured Property Tasks) — completed

## Summary

A dedicated page for tracking surplus hours per worker. When a field or cleaning worker works more than their monthly cap (173.2h for fulltime, salary/rate for minijob), the excess accumulates in their Stundenkonto. Halil can view balances, record payouts, set initial balances, and sync monthly surplus from time entries. This is purely internal tracking — nothing from Stundenkonto goes to the Steuerberater.

## Motivation

- The system already calculates official vs surplus hours (`splitOfficialAndUnofficial` in `timeCalculation.js`) but doesn't persist or display the running balance
- Ertugrul and Dorde (field workers) and Marwa (cleaning) regularly accumulate surplus hours that need tracking
- Halil needs to see each worker's accumulated balance and record when he pays out surplus hours
- Currently this is tracked manually or not at all

## Who Sees This

Only field workers (`worker_role = 'field'`) and cleaning workers (`worker_role = 'cleaning'`) appear on the Stundenkonto page. Office workers don't track field hours.

## Database Changes

### New table: `hour_balances`

```sql
CREATE TABLE hour_balances (
  id            SERIAL PRIMARY KEY,
  worker_id     INTEGER NOT NULL REFERENCES workers(id),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  surplus_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  payout_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
  note          VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, year, month)
);
```

**Column semantics:**
- `surplus_hours` — surplus earned that month (total worked minus cap). For month=0, this is the manual initial balance.
- `payout_hours` — hours paid out that month. Reduces the running balance.
- `month` — 1-12 for regular months, 0 for the initial balance entry.
- `note` — optional text (e.g., "Anfangssaldo", "Bar ausgezahlt").

**Running balance** = `SUM(surplus_hours - payout_hours)` across all rows for a worker.

## API Changes

### New endpoints

- **`GET /hour-balances`** — returns all field + cleaning workers with:
  - Worker info (id, name, worker_role)
  - Current balance (SUM of surplus_hours - payout_hours)
  - Monthly history rows ordered by year, month

- **`POST /hour-balances/sync`** — accepts `{ year, month }`. For each field/cleaning worker:
  1. Fetch time entries for that month
  2. Calculate total hours via `calculateMonthlyHours`
  3. Split via `splitOfficialAndUnofficial` to get surplus
  4. Upsert into `hour_balances` (update if row exists, insert if not)
  - Does NOT overwrite `payout_hours` — only updates `surplus_hours`

- **`POST /hour-balances/payout`** — accepts `{ worker_id, year, month, payout_hours, note }`. Updates the `payout_hours` and `note` on the row for that worker/year/month. Creates the row if it doesn't exist.

- **`POST /hour-balances/initial`** — accepts `{ worker_id, year, surplus_hours, note }`. Creates or updates the month=0 row for that worker/year. This is the manual initial balance.

### New service: `src/services/hourBalance.js`

Contains the sync logic:
- `syncMonthForWorker(workerId, year, month)` — fetches time entries, calculates surplus, upserts
- `syncMonthForAll(year, month)` — runs sync for all field/cleaning workers
- `getWorkerBalances()` — queries all balances with running totals

Uses existing `calculateMonthlyHours` and `splitOfficialAndUnofficial` from `timeCalculation.js`.

## Frontend Changes

### New page: `client/src/pages/HourBalances.jsx`

**Navigation:** New item "Stundenkonto" under the "Personal" (Staff) section, after "Urlaub" (Vacation).

**Main view — worker list with balances:**

| Mitarbeiter | Saldo | Aktion |
|---|---|---|
| Ertugrul Bal | 24.5 Std | Details |
| Dorde Vulic | 12.0 Std | Details |
| Marwa Ahmadi | 8.3 Std | Details |

Action buttons below the table:
- "Monat synchronisieren" — opens a month/year picker, then calls POST /hour-balances/sync
- "Anfangssaldo setzen" — opens a form: select worker, enter hours, optional note

**Detail view — clicking "Details" expands inline:**

| Monat | Mehrarbeit | Auszahlung | Saldo |
|---|---|---|---|
| Anfang 2026 | 15.0 | — | 15.0 |
| Jan 2026 | 8.2 | — | 23.2 |
| Feb 2026 | 6.3 | 5.0 | 24.5 |
| Mrz 2026 | 0.0 | — | 24.5 |

- Running balance (Saldo) calculated cumulatively row by row
- "Auszahlung erfassen" button at the bottom of the detail view
- Payout form: enter hours amount and optional note

### Navigation update

Add to `client/src/App.jsx` (or wherever nav is configured):
- Route: `/hour-balances`
- Nav item: under Staff section, after Vacation

### Translations

New keys needed:
- `nav.hourBalances` — "Stundenkonto" / "Hour Balances"
- `hourBalances.title` — "Stundenkonto" / "Hour Balances"
- `hourBalances.balance` — "Saldo" / "Balance"
- `hourBalances.surplus` — "Mehrarbeit" / "Surplus"
- `hourBalances.payout` — "Auszahlung" / "Payout"
- `hourBalances.details` — "Details" / "Details"
- `hourBalances.syncMonth` — "Monat synchronisieren" / "Sync Month"
- `hourBalances.setInitial` — "Anfangssaldo setzen" / "Set Initial Balance"
- `hourBalances.recordPayout` — "Auszahlung erfassen" / "Record Payout"
- `hourBalances.initialBalance` — "Anfangssaldo" / "Initial Balance"
- `hourBalances.hours` — "Std" / "hrs"
- `hourBalances.note` — "Notiz" / "Note"
- `hourBalances.month` — "Monat" / "Month"
- `hourBalances.year` — "Jahr" / "Year"
- `hourBalances.noData` — "Keine Eintraege" / "No entries"
- `hourBalances.initial` — "Anfang" / "Initial"

## What Stays the Same

- `timeCalculation.js` — unchanged, we reuse its functions
- `pdfReport.js` — unchanged, Stundenkonto is separate from Steuerberater reports
- Time entries, sick leave, vacation — unchanged
- Worker roles, property tasks — unchanged (from Specs 1 and 2)
- Analytics — unchanged

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/db/migrations/011-hour-balances.sql` | New migration: create table |
| `src/services/hourBalance.js` | New service: sync logic, balance queries |
| `api/_handlers/hour-balances/index.js` | GET handler for balances list |
| `api/_handlers/hour-balances/sync.js` | POST handler for month sync |
| `api/_handlers/hour-balances/payout.js` | POST handler for recording payouts |
| `api/_handlers/hour-balances/initial.js` | POST handler for initial balance |
| `api/index.js` | Register new routes |
| `client/src/pages/HourBalances.jsx` | New page component |
| `client/src/App.jsx` | Add route and nav item |
| `client/src/i18n/translations.js` | New keys |
| `tests/helpers.js` | Add `createTestHourBalance` helper |
| `tests/services/hourBalance.test.js` | Tests for sync logic |
