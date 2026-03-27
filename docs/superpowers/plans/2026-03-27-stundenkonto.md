# Stundenkonto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stundenkonto page that tracks accumulated surplus hours per field/cleaning worker, with sync from time entries, payout recording, and initial balance setting.

**Architecture:** New `hour_balances` table stores one row per worker per month with surplus and payout amounts. A service layer calculates surplus from time entries using existing `splitOfficialAndUnofficial`. Four API endpoints serve the data. A new React page shows worker balances with expandable monthly detail.

**Tech Stack:** PostgreSQL (Supabase), Node.js/Express API, React 19, Vite, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/011-hour-balances.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 011-hour-balances.sql
-- Create hour_balances table for Stundenkonto tracking.

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

CREATE INDEX idx_hour_balances_worker ON hour_balances(worker_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run the migration SQL against Supabase project `uytcfocsegoixdaiwhmb` using `mcp__plugin_supabase_supabase__apply_migration` with name `011_hour_balances`.

- [ ] **Step 3: Verify the migration**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'hour_balances' ORDER BY ordinal_position;
```

Expected: id, worker_id, year, month, surplus_hours, payout_hours, note, created_at, updated_at.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/011-hour-balances.sql
git commit -m "feat: add hour_balances table for Stundenkonto tracking"
```

---

### Task 2: Test Helper

**Files:**
- Modify: `tests/helpers.js`

- [ ] **Step 1: Add `createTestHourBalance` helper**

Add after the `createTestVisitPhoto` function (at the end of the file):

```javascript
export async function createTestHourBalance(workerId, overrides = {}) {
  const defaults = {
    year: 2026,
    month: 1,
    surplus_hours: 0,
    payout_hours: 0,
    note: null,
  };
  const h = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO hour_balances (worker_id, year, month, surplus_hours, payout_hours, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [workerId, h.year, h.month, h.surplus_hours, h.payout_hours, h.note]
  );
  return result.rows[0];
}
```

- [ ] **Step 2: Add `hour_balances` to `cleanDb`**

In the `cleanDb` function, add `DELETE FROM hour_balances;` before `DELETE FROM property_tasks;`:

```javascript
    DELETE FROM hour_balances;
    DELETE FROM property_tasks;
```

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.js
git commit -m "test: add createTestHourBalance helper and clean hour_balances in cleanDb"
```

---

### Task 3: Hour Balance Service — Sync Logic (TDD)

**Files:**
- Create: `src/services/hourBalance.js`
- Create: `tests/services/hourBalance.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/hourBalance.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { calculateSurplusHours } from '../../src/services/hourBalance.js';

describe('calculateSurplusHours', () => {
  it('returns 0 for empty entries', () => {
    expect(calculateSurplusHours([], 'fulltime')).toBe(0);
  });

  it('returns 0 when hours are under fulltime cap', () => {
    // 20 days * 8h = 160h, cap is 173.2h
    const entries = Array.from({ length: 20 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T16:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'fulltime')).toBe(0);
  });

  it('returns surplus when hours exceed fulltime cap', () => {
    // 22 days * 9h = 198h, cap is 173.2h, surplus = 24.8h
    const entries = Array.from({ length: 22 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T07:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T16:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'fulltime')).toBe(24.8);
  });

  it('returns surplus for minijob based on custom cap', () => {
    // 10 days * 5h = 50h, minijob cap = 40h, surplus = 10h
    const entries = Array.from({ length: 10 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T14:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'minijob', 40)).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/hourBalance.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `src/services/hourBalance.js`:

```javascript
import { pool } from '../db/pool.js';
import { calculateMonthlyHours, splitOfficialAndUnofficial } from './timeCalculation.js';

export function calculateSurplusHours(entries, workerType, minijobMonthlyMax = null) {
  const totalHours = calculateMonthlyHours(entries);
  const { unofficial } = splitOfficialAndUnofficial(totalHours, workerType, minijobMonthlyMax);
  return unofficial;
}

export async function syncMonthForAll(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { rows: workers } = await pool.query(
    `SELECT id, worker_type, hourly_rate, monthly_salary
     FROM workers WHERE worker_role IN ('field', 'cleaning') AND is_active = true`
  );

  const results = [];
  for (const worker of workers) {
    const { rows: entries } = await pool.query(
      `SELECT check_in, check_out FROM time_entries
       WHERE worker_id = $1 AND date >= $2 AND date < $3`,
      [worker.id, startDate, endDate]
    );

    const minijobMax = worker.worker_type === 'minijob' && worker.hourly_rate
      ? Math.round((worker.monthly_salary / worker.hourly_rate) * 100) / 100
      : null;

    const surplus = calculateSurplusHours(entries, worker.worker_type, minijobMax);

    const { rows } = await pool.query(
      `INSERT INTO hour_balances (worker_id, year, month, surplus_hours)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (worker_id, year, month)
       DO UPDATE SET surplus_hours = $4, updated_at = NOW()
       RETURNING *`,
      [worker.id, year, month, surplus]
    );
    results.push(rows[0]);
  }
  return results;
}

export async function getWorkerBalances() {
  const { rows: workers } = await pool.query(
    `SELECT id, name, worker_role, worker_type
     FROM workers WHERE worker_role IN ('field', 'cleaning') AND is_active = true
     ORDER BY name`
  );

  const { rows: balances } = await pool.query(
    `SELECT * FROM hour_balances
     WHERE worker_id = ANY($1)
     ORDER BY year, month`,
    [workers.map(w => w.id)]
  );

  const balancesByWorker = {};
  for (const b of balances) {
    if (!balancesByWorker[b.worker_id]) balancesByWorker[b.worker_id] = [];
    balancesByWorker[b.worker_id].push(b);
  }

  return workers.map(w => {
    const history = balancesByWorker[w.id] || [];
    const totalBalance = history.reduce(
      (sum, h) => sum + Number(h.surplus_hours) - Number(h.payout_hours), 0
    );
    return {
      ...w,
      balance: Math.round(totalBalance * 100) / 100,
      history,
    };
  });
}

export async function recordPayout(workerId, year, month, payoutHours, note) {
  const { rows } = await pool.query(
    `INSERT INTO hour_balances (worker_id, year, month, payout_hours, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (worker_id, year, month)
     DO UPDATE SET payout_hours = hour_balances.payout_hours + $4,
                   note = COALESCE($5, hour_balances.note),
                   updated_at = NOW()
     RETURNING *`,
    [workerId, year, month, payoutHours, note]
  );
  return rows[0];
}

export async function setInitialBalance(workerId, year, surplusHours, note) {
  const { rows } = await pool.query(
    `INSERT INTO hour_balances (worker_id, year, month, surplus_hours, note)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (worker_id, year, month)
     DO UPDATE SET surplus_hours = $3, note = $4, updated_at = NOW()
     RETURNING *`,
    [workerId, year, surplusHours, note || 'Anfangssaldo']
  );
  return rows[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/hourBalance.test.js`

Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/hourBalance.js tests/services/hourBalance.test.js
git commit -m "feat: add hourBalance service with surplus calculation and sync logic"
```

---

### Task 4: API Endpoints

**Files:**
- Create: `api/_handlers/hour-balances/index.js`
- Create: `api/_handlers/hour-balances/sync.js`
- Create: `api/_handlers/hour-balances/payout.js`
- Create: `api/_handlers/hour-balances/initial.js`
- Modify: `api/index.js`

- [ ] **Step 1: Create GET /hour-balances handler**

Create `api/_handlers/hour-balances/index.js`:

```javascript
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getWorkerBalances } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const balances = await getWorkerBalances();
  return res.json(balances);
});
```

- [ ] **Step 2: Create POST /hour-balances/sync handler**

Create `api/_handlers/hour-balances/sync.js`:

```javascript
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: 'year and month are required' });

  const results = await syncMonthForAll(year, month);
  return res.json(results);
});
```

- [ ] **Step 3: Create POST /hour-balances/payout handler**

Create `api/_handlers/hour-balances/payout.js`:

```javascript
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { recordPayout } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { worker_id, year, month, payout_hours, note } = req.body;
  if (!worker_id || !year || !month || !payout_hours) {
    return res.status(400).json({ error: 'worker_id, year, month, and payout_hours are required' });
  }

  const result = await recordPayout(worker_id, year, month, payout_hours, note);
  return res.json(result);
});
```

- [ ] **Step 4: Create POST /hour-balances/initial handler**

Create `api/_handlers/hour-balances/initial.js`:

```javascript
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { setInitialBalance } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { worker_id, year, surplus_hours, note } = req.body;
  if (!worker_id || !year || surplus_hours === undefined) {
    return res.status(400).json({ error: 'worker_id, year, and surplus_hours are required' });
  }

  const result = await setInitialBalance(worker_id, year, surplus_hours, note);
  return res.json(result);
});
```

- [ ] **Step 5: Register routes in api/index.js**

Add imports after the analytics import (around line 50):

```javascript
import hourBalancesIndexHandler from './_handlers/hour-balances/index.js';
import hourBalancesSyncHandler from './_handlers/hour-balances/sync.js';
import hourBalancesPayoutHandler from './_handlers/hour-balances/payout.js';
import hourBalancesInitialHandler from './_handlers/hour-balances/initial.js';
```

Add routes to the `routes` array, after the Analytics section:

```javascript
  // Hour Balances (Stundenkonto)
  ['hour-balances/sync', hourBalancesSyncHandler],
  ['hour-balances/payout', hourBalancesPayoutHandler],
  ['hour-balances/initial', hourBalancesInitialHandler],
  ['hour-balances', hourBalancesIndexHandler],
```

Note: specific routes (`sync`, `payout`, `initial`) must come before the catch-all `hour-balances` route.

- [ ] **Step 6: Commit**

```bash
git add api/_handlers/hour-balances/ api/index.js
git commit -m "feat: add API endpoints for Stundenkonto (GET, sync, payout, initial)"
```

---

### Task 5: Translations

**Files:**
- Modify: `client/src/i18n/translations.js`

- [ ] **Step 1: Add German translations**

Add after the vacation section in `de` (find `'vacation.` keys and add after them):

```javascript
    // Hour Balances (Stundenkonto)
    'nav.hourBalances': 'Stundenkonto',
    'hourBalances.title': 'Stundenkonto',
    'hourBalances.balance': 'Saldo',
    'hourBalances.surplus': 'Mehrarbeit',
    'hourBalances.payout': 'Auszahlung',
    'hourBalances.details': 'Details',
    'hourBalances.syncMonth': 'Monat synchronisieren',
    'hourBalances.setInitial': 'Anfangssaldo setzen',
    'hourBalances.recordPayout': 'Auszahlung erfassen',
    'hourBalances.initialBalance': 'Anfangssaldo',
    'hourBalances.hours': 'Std',
    'hourBalances.note': 'Notiz',
    'hourBalances.month': 'Monat',
    'hourBalances.year': 'Jahr',
    'hourBalances.noData': 'Keine Eintraege',
    'hourBalances.initial': 'Anfang',
    'hourBalances.worker': 'Mitarbeiter',
    'hourBalances.amount': 'Stunden',
    'hourBalances.synced': 'Synchronisiert',
    'hourBalances.saved': 'Gespeichert',
```

- [ ] **Step 2: Add English translations**

Add after the vacation section in `en`:

```javascript
    // Hour Balances (Stundenkonto)
    'nav.hourBalances': 'Hour Balances',
    'hourBalances.title': 'Hour Balances',
    'hourBalances.balance': 'Balance',
    'hourBalances.surplus': 'Surplus',
    'hourBalances.payout': 'Payout',
    'hourBalances.details': 'Details',
    'hourBalances.syncMonth': 'Sync Month',
    'hourBalances.setInitial': 'Set Initial Balance',
    'hourBalances.recordPayout': 'Record Payout',
    'hourBalances.initialBalance': 'Initial Balance',
    'hourBalances.hours': 'hrs',
    'hourBalances.note': 'Note',
    'hourBalances.month': 'Month',
    'hourBalances.year': 'Year',
    'hourBalances.noData': 'No entries',
    'hourBalances.initial': 'Initial',
    'hourBalances.worker': 'Worker',
    'hourBalances.amount': 'Hours',
    'hourBalances.synced': 'Synced',
    'hourBalances.saved': 'Saved',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add translation keys for Stundenkonto page"
```

---

### Task 6: HourBalances Page

**Files:**
- Create: `client/src/pages/HourBalances.jsx`

- [ ] **Step 1: Create the page component**

Create `client/src/pages/HourBalances.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

const MONTH_KEYS = ['', 'month.1', 'month.2', 'month.3', 'month.4', 'month.5', 'month.6',
  'month.7', 'month.8', 'month.9', 'month.10', 'month.11', 'month.12'];

export default function HourBalances() {
  const [workers, setWorkers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const [showInitial, setShowInitial] = useState(false);
  const [showPayout, setShowPayout] = useState(null);
  const { t } = useLang();

  const now = new Date();
  const [syncYear, setSyncYear] = useState(now.getFullYear());
  const [syncMonth, setSyncMonth] = useState(now.getMonth() + 1);
  const [initialForm, setInitialForm] = useState({ worker_id: '', year: now.getFullYear(), surplus_hours: '', note: '' });
  const [payoutForm, setPayoutForm] = useState({ payout_hours: '', note: '' });

  const load = async () => {
    try {
      const data = await api.get('/hour-balances');
      setWorkers(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    try {
      setError(null);
      await api.post('/hour-balances/sync', { year: syncYear, month: syncMonth });
      setSuccess(t('hourBalances.synced'));
      setShowSync(false);
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleInitial = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      await api.post('/hour-balances/initial', {
        worker_id: Number(initialForm.worker_id),
        year: Number(initialForm.year),
        surplus_hours: Number(initialForm.surplus_hours),
        note: initialForm.note || null,
      });
      setSuccess(t('hourBalances.saved'));
      setShowInitial(false);
      setInitialForm({ worker_id: '', year: now.getFullYear(), surplus_hours: '', note: '' });
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handlePayout = async (e, workerId) => {
    e.preventDefault();
    try {
      setError(null);
      const now = new Date();
      await api.post('/hour-balances/payout', {
        worker_id: workerId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        payout_hours: Number(payoutForm.payout_hours),
        note: payoutForm.note || null,
      });
      setSuccess(t('hourBalances.saved'));
      setShowPayout(null);
      setPayoutForm({ payout_hours: '', note: '' });
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const formatMonth = (year, month) => {
    if (month === 0) return `${t('hourBalances.initial')} ${year}`;
    return `${t(MONTH_KEYS[month])} ${year}`;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('hourBalances.title')}</h1>
        <div className="flex gap-sm">
          <button onClick={() => setShowSync(!showSync)} className="btn btn-secondary">
            {t('hourBalances.syncMonth')}
          </button>
          <button onClick={() => setShowInitial(!showInitial)} className="btn btn-secondary">
            {t('hourBalances.setInitial')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}
      {success && <div className="alert alert-success mb-md animate-fade-in">{success}</div>}

      {/* Sync Form */}
      {showSync && (
        <div className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.syncMonth')}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" value={syncYear} onChange={e => setSyncYear(Number(e.target.value))} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.month')}</label>
              <select value={syncMonth} onChange={e => setSyncMonth(Number(e.target.value))} className="select" style={{ width: '150px' }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t(MONTH_KEYS[i + 1])}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button onClick={handleSync} className="btn btn-primary">{t('hourBalances.syncMonth')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Balance Form */}
      {showInitial && (
        <form onSubmit={handleInitial} className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.setInitial')}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.worker')}</label>
              <select required value={initialForm.worker_id} onChange={e => setInitialForm({ ...initialForm, worker_id: e.target.value })} className="select">
                <option value="">--</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" required value={initialForm.year} onChange={e => setInitialForm({ ...initialForm, year: e.target.value })} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.amount')}</label>
              <input type="number" step="0.1" required value={initialForm.surplus_hours} onChange={e => setInitialForm({ ...initialForm, surplus_hours: e.target.value })} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.note')}</label>
              <input value={initialForm.note} onChange={e => setInitialForm({ ...initialForm, note: e.target.value })} className="input" />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            </div>
          </div>
        </form>
      )}

      {/* Worker Balances Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('hourBalances.balance')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <>
                <tr key={w.id}>
                  <td style={{ fontWeight: 600 }}>
                    {w.name}
                    <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>{t(`workers.role.${w.worker_role}`)}</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontWeight: 600, color: w.balance > 0 ? 'var(--success)' : w.balance < 0 ? 'var(--danger)' : 'inherit' }}>
                      {w.balance.toFixed(1)} {t('hourBalances.hours')}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      {t('hourBalances.details')}
                    </button>
                  </td>
                </tr>
                {expanded === w.id && (
                  <tr key={`${w.id}-detail`}>
                    <td colSpan={3} style={{ padding: 0 }}>
                      <div style={{ padding: '12px 24px', background: 'var(--bg-secondary)' }}>
                        <table className="data-table" style={{ marginBottom: '12px' }}>
                          <thead>
                            <tr>
                              <th>{t('hourBalances.month')}</th>
                              <th>{t('hourBalances.surplus')}</th>
                              <th>{t('hourBalances.payout')}</th>
                              <th>{t('hourBalances.balance')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let running = 0;
                              return (w.history || []).map((h, i) => {
                                running += Number(h.surplus_hours) - Number(h.payout_hours);
                                return (
                                  <tr key={i}>
                                    <td>{formatMonth(h.year, h.month)}</td>
                                    <td className="mono">{Number(h.surplus_hours).toFixed(1)}</td>
                                    <td className="mono">{Number(h.payout_hours) > 0 ? Number(h.payout_hours).toFixed(1) : '—'}</td>
                                    <td className="mono" style={{ fontWeight: 600 }}>{running.toFixed(1)}</td>
                                  </tr>
                                );
                              });
                            })()}
                            {(!w.history || w.history.length === 0) && (
                              <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center' }}>{t('hourBalances.noData')}</td></tr>
                            )}
                          </tbody>
                        </table>

                        {/* Payout Form */}
                        {showPayout === w.id ? (
                          <form onSubmit={e => handlePayout(e, w.id)} className="flex gap-sm items-end">
                            <div className="form-group">
                              <label className="form-label">{t('hourBalances.amount')}</label>
                              <input type="number" step="0.1" required value={payoutForm.payout_hours}
                                onChange={e => setPayoutForm({ ...payoutForm, payout_hours: e.target.value })}
                                className="input" style={{ width: '100px' }} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">{t('hourBalances.note')}</label>
                              <input value={payoutForm.note}
                                onChange={e => setPayoutForm({ ...payoutForm, note: e.target.value })}
                                className="input" style={{ width: '200px' }} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-sm">{t('common.save')}</button>
                            <button type="button" onClick={() => setShowPayout(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                          </form>
                        ) : (
                          <button onClick={() => { setShowPayout(w.id); setPayoutForm({ payout_hours: '', note: '' }); }} className="btn btn-secondary btn-sm">
                            {t('hourBalances.recordPayout')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={3}><div className="empty-state"><div className="empty-state-text">{t('hourBalances.noData')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd client && npx vite build`

Expected: Build succeeds (the page isn't routed yet, but it should compile without errors).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/HourBalances.jsx
git commit -m "feat: add HourBalances page with worker list, detail view, sync, and payout"
```

---

### Task 7: Navigation and Routing

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Add route in App.jsx**

Add the import at the top with the other page imports:

```javascript
import HourBalances from './pages/HourBalances';
```

Add the route inside the protected layout routes, after the `vacation` route:

```jsx
            <Route path="hour-balances" element={<HourBalances />} />
```

- [ ] **Step 2: Add nav item in Layout.jsx**

In the `getNavSections` function, find the Staff section (the one with `t('nav.staff')` label). Add a new nav item after the vacation item:

```javascript
      {
        path: '/hour-balances',
        label: t('nav.hourBalances'),
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
      },
```

This uses a clock icon which fits the "hour tracking" concept.

- [ ] **Step 3: Verify frontend build**

Run: `cd client && npx vite build`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: add Stundenkonto route and navigation item under Staff section"
```

---

### Task 8: Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Full frontend build**

Run: `cd client && npx vite build`

Expected: Build succeeds.

- [ ] **Step 3: Verify table via Supabase MCP**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'hour_balances' ORDER BY ordinal_position;
```

Expected: All columns present.

- [ ] **Step 4: Verify no import errors**

```bash
grep -r "hourBalance" --include="*.js" --include="*.jsx" api/ src/ client/src/
```

Expected: All imports resolve correctly — service file, API handlers, page component.
