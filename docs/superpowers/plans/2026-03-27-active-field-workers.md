# Active Field Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `is_field_worker` flag to workers so only field workers participate in planning, messaging, command center, and analytics — while all workers remain in Steuerberater reports.

**Architecture:** Single boolean column `is_field_worker` on the `workers` table (default `true`). Backend services that drive field operations add `AND is_field_worker = true` to their worker queries. The Workers page UI gets an inline toggle and the edit form gets the same toggle. A convenience API endpoint handles the toggle. Report generation remains unchanged.

**Tech Stack:** PostgreSQL (migration), Node.js/Express (API), React 19 (UI), Vitest (tests)

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/008-field-worker.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 008-field-worker.sql
-- Add is_field_worker flag to distinguish field workers from office/admin staff.
-- Default true: all existing workers remain field workers.
ALTER TABLE workers ADD COLUMN is_field_worker BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Run migration**

Run: `node src/db/migrate.js`
Expected: Migration 008 applies successfully, no errors.

- [ ] **Step 3: Verify column exists**

Run: `node -e "import('./src/db/pool.js').then(({pool}) => pool.query(\"SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='workers' AND column_name='is_field_worker'\").then(r => { console.log(r.rows); process.exit(); }))"`
Expected: `[{ column_name: 'is_field_worker', data_type: 'boolean', column_default: 'true' }]`

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/008-field-worker.sql
git commit -m "feat: add is_field_worker column to workers table"
```

---

### Task 2: Update Test Helper

**Files:**
- Modify: `tests/helpers.js:34-51` (`createTestWorker` function)

- [ ] **Step 1: Add is_field_worker to createTestWorker**

In `tests/helpers.js`, update the `createTestWorker` function to support `is_field_worker`:

```javascript
export async function createTestWorker(overrides = {}) {
  const defaults = {
    name: 'Test Worker',
    phone_number: '+4917612345678',
    worker_type: 'fulltime',
    hourly_rate: 14.0,
    monthly_salary: null,
    registration_date: '2025-01-01',
    vacation_entitlement: 26,
    is_field_worker: true,
  };
  const w = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, is_field_worker)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [w.name, w.phone_number, w.worker_type, w.hourly_rate, w.monthly_salary, w.registration_date, w.vacation_entitlement, w.is_field_worker]
  );
  return result.rows[0];
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All existing tests pass (the default `is_field_worker: true` matches existing behavior).

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.js
git commit -m "feat: add is_field_worker support to createTestWorker helper"
```

---

### Task 3: Plan Generation — Filter by Field Worker

**Files:**
- Modify: `src/services/planGeneration.js:68-76` (worker query in `generateDraftPlan`)
- Modify: `src/services/planGeneration.js:240-249` (worker query in `redistributeSickWorkers`)
- Test: `tests/services/planGeneration.test.js`

- [ ] **Step 1: Write failing test — non-field workers excluded from plan generation**

Add to `tests/services/planGeneration.test.js` inside the `describeWithDb('generateDraftPlan', ...)` block:

```javascript
  it('excludes non-field workers from plan generation', async () => {
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });
    const prop = await createTestProperty({ assigned_weekday: 1, address: 'Teststr 1' });

    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    const assignedWorkerIds = full.assignments.map(a => a.worker_id);
    expect(assignedWorkerIds).not.toContain(officeWorker.id);
    if (full.assignments.length > 0) {
      expect(assignedWorkerIds).toContain(fieldWorker.id);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/planGeneration.test.js -t "excludes non-field"`
Expected: FAIL — office worker gets assigned because `is_field_worker` is not filtered yet.

- [ ] **Step 3: Add is_field_worker filter to generateDraftPlan**

In `src/services/planGeneration.js`, change the worker query in `generateDraftPlan` (line 68-76):

```javascript
  // Get active field workers with preferences
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            COALESCE(wp.preferred_properties, '{}') AS preferred_properties
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.is_field_worker = true`
  );
```

- [ ] **Step 4: Add is_field_worker filter to redistributeSickWorkers**

In `src/services/planGeneration.js`, change the worker query in `redistributeSickWorkers` (line 240-249):

```javascript
  // Get available field workers with preferences and current assignment counts
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            (SELECT COUNT(*) FROM plan_assignments pa2
             WHERE pa2.daily_plan_id = $1 AND pa2.worker_id = w.id) AS assignment_count
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.is_field_worker = true AND w.id != ALL($2::int[])`,
    [plan.id, [...sickIds]]
  );
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/planGeneration.test.js`
Expected: All tests pass, including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/services/planGeneration.js tests/services/planGeneration.test.js
git commit -m "feat: exclude non-field workers from daily plan generation"
```

---

### Task 4: Command Center — Filter by Field Worker

**Files:**
- Modify: `src/services/commandCenter.js:140-155` (`getAssignmentsWithDetails` — no change needed, it joins through plan_assignments which already only has field workers)
- Modify: `src/services/commandCenter.js:157-164` (`getTimeEntries` — filter)
- Modify: `src/services/commandCenter.js:222-231` (`getTimelineEntries` — filter)
- Test: `tests/services/commandCenter.test.js`

Note: The command center gets workers from plan_assignments (which already only contain field workers after Task 3). However, `getTimeEntries` and `getTimelineEntries` query `time_entries` directly — these need filtering so that manually-entered time entries for office workers don't show up.

- [ ] **Step 1: Write failing test — non-field worker time entries excluded from timeline**

Add to `tests/services/commandCenter.test.js` inside the `describeWithDb('getCommandCenterData', ...)` block:

```javascript
  it('excludes non-field worker time entries from timeline', async () => {
    const today = '2026-03-26';
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });
    const property = await createTestProperty({ assigned_weekday: 4 });
    const plan = await createTestPlan({ plan_date: today, status: 'approved' });
    await createTestAssignment(plan.id, fieldWorker.id, property.id);

    // Both workers have time entries
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, NOW()), ($3, $2, NOW())`,
      [fieldWorker.id, today, officeWorker.id]
    );

    const data = await getCommandCenterData(today);

    const timelineNames = data.timeline.map(t => t.worker_name);
    expect(timelineNames).toContain('Ali');
    expect(timelineNames).not.toContain('Buero');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/commandCenter.test.js -t "excludes non-field"`
Expected: FAIL — office worker appears in timeline.

- [ ] **Step 3: Add is_field_worker filter to getTimeEntries**

In `src/services/commandCenter.js`, update `getTimeEntries` (line 157-164):

```javascript
async function getTimeEntries(dateStr) {
  const { rows } = await pool.query(
    `SELECT te.worker_id, te.check_in, te.check_out, te.is_flagged, te.flag_reason
     FROM time_entries te
     JOIN workers w ON w.id = te.worker_id
     WHERE te.date = $1 AND w.is_field_worker = true`,
    [dateStr]
  );
  return rows;
}
```

- [ ] **Step 4: Add is_field_worker filter to getTimelineEntries**

In `src/services/commandCenter.js`, update `getTimelineEntries` (line 222-231):

```javascript
async function getTimelineEntries(dateStr) {
  const { rows } = await pool.query(
    `SELECT te.worker_id, w.name AS worker_name, te.check_in, te.check_out
     FROM time_entries te JOIN workers w ON w.id = te.worker_id
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND w.is_field_worker = true
     ORDER BY te.check_in`,
    [dateStr]
  );
  return rows;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/commandCenter.test.js`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/commandCenter.js tests/services/commandCenter.test.js
git commit -m "feat: exclude non-field workers from command center"
```

---

### Task 5: Analytics — Filter by Field Worker

**Files:**
- Modify: `src/services/analytics.js:202-212` (`getWorkerAnalytics` — add filter)
- Modify: `src/services/analytics.js:260-274` (`getCostAnalytics` — add filter)
- Test: `tests/services/analytics.test.js`

Note: `computeDailyAnalyticsForDate` pulls from `plan_assignments` which already only has field workers (after Task 3). But the query functions that read back analytics data join with `workers` — we should filter there too so historical data for workers who were later changed to non-field doesn't appear.

- [ ] **Step 1: Write failing test — non-field workers excluded from worker analytics**

Add to `tests/services/analytics.test.js` inside the `describeWithDb('Analytics query functions', ...)` block:

```javascript
  it('getWorkerAnalytics excludes non-field workers', async () => {
    const fieldWorker = await createTestWorker({ name: 'Ali', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });

    await pool.query(
      `INSERT INTO analytics_daily (date, worker_id, properties_completed, properties_scheduled, total_duration_minutes, photos_submitted, photos_required, tasks_completed, tasks_postponed, overtime_minutes, check_in_time, sick_leave_declared)
       VALUES ('2026-03-20', $1, 3, 4, 180, 2, 3, 3, 0, 0, '2026-03-20T07:00:00Z', false),
              ('2026-03-20', $2, 1, 1, 60, 0, 0, 1, 0, 0, '2026-03-20T08:00:00Z', false)`,
      [fieldWorker.id, officeWorker.id]
    );

    const result = await getWorkerAnalytics('2026-03-01', '2026-03-31');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Ali');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/analytics.test.js -t "excludes non-field"`
Expected: FAIL — office worker appears in results.

- [ ] **Step 3: Add is_field_worker filter to getWorkerAnalytics**

In `src/services/analytics.js`, update `getWorkerAnalytics` (line 202-212):

```javascript
export async function getWorkerAnalytics(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT ad.*, w.name AS worker_name
     FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.is_field_worker = true
     ORDER BY ad.worker_id, ad.date`,
    [fromDate, toDate]
  );
  return computeWorkerDailyStats(rows);
}
```

- [ ] **Step 4: Add is_field_worker filter to getCostAnalytics**

In `src/services/analytics.js`, update `getCostAnalytics` (line 260-274):

```javascript
export async function getCostAnalytics(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT
       ad.worker_id, w.name AS worker_name, w.hourly_rate,
       SUM(ad.total_duration_minutes)::int AS total_duration_minutes,
       SUM(ad.overtime_minutes)::int AS overtime_minutes,
       SUM(ad.properties_completed)::int AS properties_completed
     FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.is_field_worker = true
     GROUP BY ad.worker_id, w.name, w.hourly_rate
     ORDER BY w.name`,
    [fromDate, toDate]
  );
  return computeCostInsights(rows, 160);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/services/analytics.test.js`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/analytics.js tests/services/analytics.test.js
git commit -m "feat: exclude non-field workers from analytics"
```

---

### Task 6: Workers API — Support is_field_worker + Toggle Endpoint

**Files:**
- Modify: `api/_handlers/workers/index.js:9-13` (GET query — include `is_field_worker`)
- Modify: `api/_handlers/workers/[id].js:16` (PUT — add `is_field_worker` to allowed fields)
- Create: `api/_handlers/workers/field-status.js` (toggle endpoint)

- [ ] **Step 1: Update GET /api/workers to include is_field_worker**

The current query `SELECT * FROM workers WHERE is_active = true ORDER BY name` already returns all columns, so `is_field_worker` is automatically included after the migration. No change needed to `api/_handlers/workers/index.js`.

Verify by reading the query — `SELECT *` returns all columns. **No code change required.**

- [ ] **Step 2: Add is_field_worker to PUT allowed fields**

In `api/_handlers/workers/[id].js`, update the `fields` array on line 16:

```javascript
    const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement', 'registration_date', 'is_field_worker'];
```

And add `is_field_worker` to the boolean handling. Replace the `numericFields` line (line 17):

```javascript
    const numericFields = new Set(['hourly_rate', 'monthly_salary', 'vacation_entitlement']);
    const booleanFields = new Set(['is_field_worker']);
```

And update the value conversion inside the for loop (after line 25):

```javascript
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        let val = req.body[field];
        if (numericFields.has(field) && (val === '' || val === null)) {
          val = null;
        }
        if (booleanFields.has(field)) {
          val = Boolean(val);
        }
        values.push(val);
        paramIndex++;
      }
    }
```

- [ ] **Step 3: Create field-status toggle endpoint**

Create `api/_handlers/workers/field-status.js`:

```javascript
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { worker_id, is_field_worker } = req.body;
  if (!worker_id || typeof is_field_worker !== 'boolean') {
    return res.status(400).json({ error: 'worker_id and is_field_worker (boolean) are required' });
  }

  // Check if this would remove the last field worker
  if (!is_field_worker) {
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM workers WHERE is_active = true AND is_field_worker = true AND id != $1`,
      [worker_id]
    );
    if (count === 0) {
      return res.json({
        _warning: 'last_field_worker',
        message: 'Dies ist der letzte Außendienstmitarbeiter. Tagesplaene koennen nicht mehr erstellt werden.',
      });
    }

    // Check for future plan assignments
    const { rows: futureAssignments } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM plan_assignments pa
       JOIN daily_plans dp ON dp.id = pa.daily_plan_id
       WHERE pa.worker_id = $1 AND dp.plan_date > CURRENT_DATE AND pa.status != 'completed'`,
      [worker_id]
    );
    if (futureAssignments[0].count > 0) {
      // Remove future assignments
      await pool.query(
        `DELETE FROM plan_assignments
         WHERE worker_id = $1 AND daily_plan_id IN (
           SELECT id FROM daily_plans WHERE plan_date > CURRENT_DATE
         ) AND status != 'completed'`,
        [worker_id]
      );
    }
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE workers SET is_field_worker = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *`,
    [is_field_worker, worker_id]
  );

  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  return res.json(updated);
});
```

- [ ] **Step 4: Register the new endpoint in the API router**

Check how routes are registered. The project uses Vercel's file-based API routing under `api/`. The file at `api/_handlers/workers/field-status.js` needs a corresponding route file. Check if there's a `api/workers/` directory structure:

Run: `ls api/workers/ 2>/dev/null || ls api/ | head -20`

If the project uses a centralized router (e.g., `api/workers.js` that imports from `_handlers`), add the route there. Typically the pattern is:

Look at an existing route file like `api/workers.js` or `api/workers/[id].js` to understand the routing pattern, then create the equivalent for `field-status`.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add api/_handlers/workers/[id].js api/_handlers/workers/field-status.js
git commit -m "feat: add is_field_worker to worker API and toggle endpoint"
```

---

### Task 7: Translation Keys

**Files:**
- Modify: `client/src/i18n/translations.js` (add German and English keys)

- [ ] **Step 1: Add translation keys for field worker UI**

In `client/src/i18n/translations.js`, add to the German (`de`) section after the existing `workers.vacationEntitlement` key (around line 103):

```javascript
    'workers.fieldWorker': 'Außendienst',
    'workers.office': 'Büro',
    'workers.filterAll': 'Alle',
    'workers.filterField': 'Außendienst',
    'workers.filterOffice': 'Büro',
    'workers.lastFieldWorkerWarning': 'Kein Außendienstmitarbeiter mehr vorhanden. Tagespläne können nicht erstellt werden.',
    'workers.futureAssignmentsWarning': 'Dieser Mitarbeiter hat zukünftige Einsätze. Diese werden entfernt.',
```

And add to the English (`en`) section after the existing `workers.vacationEntitlement` key (around line 443):

```javascript
    'workers.fieldWorker': 'Field Worker',
    'workers.office': 'Office',
    'workers.filterAll': 'All',
    'workers.filterField': 'Field',
    'workers.filterOffice': 'Office',
    'workers.lastFieldWorkerWarning': 'No field workers remaining. Daily plans cannot be generated.',
    'workers.futureAssignmentsWarning': 'This worker has future assignments. They will be removed.',
```

- [ ] **Step 2: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add translation keys for field worker UI"
```

---

### Task 8: Workers Page — Inline Toggle and Filter

**Files:**
- Modify: `client/src/pages/Workers.jsx`

- [ ] **Step 1: Add filter state and toggle handler**

In `client/src/pages/Workers.jsx`, add after the existing state declarations (line 11):

```javascript
  const [filter, setFilter] = useState('all'); // 'all' | 'field' | 'office'
```

Add the toggle handler after `handleDelete` (after line 52):

```javascript
  const handleFieldToggle = async (worker) => {
    const newValue = !worker.is_field_worker;
    try {
      setError(null);
      const result = await api.put('/workers/field-status', {
        worker_id: worker.id,
        is_field_worker: newValue,
      });
      if (result?._warning === 'last_field_worker') {
        if (!confirm(t('workers.lastFieldWorkerWarning'))) return;
        // Re-send with confirmation (the API already toggled it, just warn)
      }
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };
```

- [ ] **Step 2: Add filter tabs and filtered worker list**

Add the filter tabs after the warning alert (after line 74), inside the main div before the table wrapper:

```jsx
      <div className="flex gap-sm mb-md">
        {['all', 'field', 'office'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t(`workers.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
          </button>
        ))}
      </div>
```

Add the filtered workers computation before the return statement:

```javascript
  const filteredWorkers = workers.filter(w => {
    if (filter === 'field') return w.is_field_worker;
    if (filter === 'office') return !w.is_field_worker;
    return true;
  });
```

Then replace `workers.map` with `filteredWorkers.map` in the table body.

- [ ] **Step 3: Add Field Worker column to table**

Add a new `<th>` after the Vacation Days column header (line 91):

```jsx
              <th>{t('workers.fieldWorker')}</th>
```

Add the toggle cell in each row after the vacation days cell (after line 105), and add the "Office" badge to the name cell:

For the name cell, update it to include a badge:

```jsx
                <td style={{ fontWeight: 600 }}>
                  {w.name}
                  {!w.is_field_worker && (
                    <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>
                      {t('workers.office')}
                    </span>
                  )}
                </td>
```

For the new toggle cell:

```jsx
                <td>
                  <label className="toggle-switch" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={w.is_field_worker}
                      onChange={() => handleFieldToggle(w)}
                      style={{ cursor: 'pointer' }}
                    />
                  </label>
                </td>
```

Update the empty state colSpan from 6 to 7:

```jsx
              <tr><td colSpan={7}><div className="empty-state"><div className="empty-state-text">{t('workers.none')}</div></div></td></tr>
```

- [ ] **Step 4: Verify the page renders correctly**

Run: `cd client && npm run dev`
Expected: Workers page shows field worker toggle column, filter tabs, and office badges. Toggling a worker calls the API and refreshes the list.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Workers.jsx
git commit -m "feat: add field worker toggle and filter tabs to workers page"
```

---

### Task 9: Worker Edit Form — Add Field Worker Toggle

**Files:**
- Modify: `client/src/components/WorkerForm.jsx`

- [ ] **Step 1: Add is_field_worker to form state**

In `client/src/components/WorkerForm.jsx`, update the default form state (line 17-19):

```javascript
    if (!worker) return {
      name: '', phone_number: '', worker_type: 'fulltime', hourly_rate: '', monthly_salary: '',
      registration_date: '', vacation_entitlement: '', is_field_worker: true,
    };
```

And the existing worker state (line 21-27) — add after `vacation_entitlement`:

```javascript
    return {
      ...worker,
      registration_date: worker.registration_date ? worker.registration_date.split('T')[0] : '',
      hourly_rate: worker.hourly_rate || '',
      monthly_salary: worker.monthly_salary || '',
      vacation_entitlement: worker.vacation_entitlement || '',
      is_field_worker: worker.is_field_worker !== false,
    };
```

- [ ] **Step 2: Add toggle to the form**

Add after the worker_type select (after line 74), inside the `form-row` div:

```jsx
        <div className="form-group">
          <label className="form-label">{t('workers.fieldWorker')}</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_field_worker}
              onChange={e => update('is_field_worker', e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            {form.is_field_worker ? t('workers.filterField') : t('workers.office')}
          </label>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/WorkerForm.jsx
git commit -m "feat: add field worker toggle to worker edit form"
```

---

### Task 10: Verify Unchanged Services

**Files:** (read-only verification, no changes)
- `src/services/pdfReport.js` — must NOT filter by `is_field_worker`
- `src/services/notifications.js` — notifications to Halil don't query workers directly
- `src/services/accountabilityFlow.js` — operates on plan_assignments (already filtered by Task 3)
- `src/services/taskScheduling.js` — operates on properties/teams, not worker queries directly

- [ ] **Step 1: Verify pdfReport.js does NOT filter by is_field_worker**

Read `src/services/pdfReport.js` and confirm that its worker query uses `WHERE is_active = true` without `is_field_worker`. This is correct — all workers must appear in Steuerberater reports.

- [ ] **Step 2: Verify notifications.js is already safe**

Read `src/services/notifications.js` — it sends messages to `config.halilWhatsappNumber` (Halil's number), not to workers. No worker queries — no change needed.

- [ ] **Step 3: Verify accountabilityFlow.js is already safe**

The accountability flow operates on `property_visits` and `plan_assignments` which are populated during plan generation (Task 3). Since non-field workers never get plan assignments, they never get property visits, so they never receive WhatsApp prompts. No change needed.

- [ ] **Step 4: Verify taskScheduling.js is already safe**

Read `src/services/taskScheduling.js` — it queries `properties` and `task_assignments` by `team_id` and `property_id`. It doesn't query workers directly for assignment. The daily plan flow (Task 3) already handles field worker filtering. No change needed.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass.

- [ ] **Step 6: Commit (if any verification-driven fixes were needed)**

Only commit if fixes were needed. Otherwise, skip this step.

---

### Task 11: End-to-End Smoke Test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Server starts without errors.

- [ ] **Step 2: Manual verification checklist**

Open the app in a browser and verify:

1. Workers page loads with all workers visible
2. New "Field Worker" column with toggle switches is present
3. Filter tabs (All / Field / Office) work correctly
4. Toggling a worker to "off" shows "Office" badge on their name
5. Editing a worker shows the field worker checkbox
6. Non-field workers do not appear in the Daily Plan page
7. Non-field workers do not appear in the Command Center
8. Reports page still shows all workers (field + office)

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: end-to-end smoke test fixes for field worker feature"
```
