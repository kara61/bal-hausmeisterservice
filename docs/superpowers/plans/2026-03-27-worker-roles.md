# Worker Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `is_field_worker` boolean with `worker_role` enum (`field`/`cleaning`/`office`) across DB, API, services, frontend, and tests.

**Architecture:** Single migration adds `worker_role`, migrates existing data, drops `is_field_worker`. All backend queries and frontend components switch from boolean checks to role-based checks. The API endpoint `PUT /workers/field-status` becomes `PUT /workers/role`.

**Tech Stack:** PostgreSQL, Node.js/Express (Vercel Functions), React 19, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/009-worker-roles.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 009-worker-roles.sql
-- Replace is_field_worker boolean with worker_role enum.

-- Step 1: Add worker_role column
ALTER TABLE workers ADD COLUMN worker_role VARCHAR(20) DEFAULT 'office';

-- Step 2: Migrate existing data
UPDATE workers SET worker_role = 'field' WHERE is_field_worker = true;
UPDATE workers SET worker_role = 'cleaning' WHERE id = 15; -- Marwa Ahmadi

-- Step 3: Add constraints
ALTER TABLE workers ALTER COLUMN worker_role SET NOT NULL;
ALTER TABLE workers ADD CONSTRAINT workers_role_check CHECK (worker_role IN ('field', 'cleaning', 'office'));

-- Step 4: Drop old column
ALTER TABLE workers DROP COLUMN is_field_worker;
```

- [ ] **Step 2: Run migration against Supabase**

Run via Supabase MCP `execute_sql` or `apply_migration` with the SQL above against project `uytcfocsegoixdaiwhmb`.

- [ ] **Step 3: Verify migration**

Run via Supabase MCP:
```sql
SELECT id, name, worker_role FROM workers WHERE is_active = true ORDER BY name;
```

Expected: Ertugrul → `field`, Dorde → `field`, Marwa → `cleaning`, all others → `office`.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/009-worker-roles.sql
git commit -m "feat: add worker_role migration replacing is_field_worker"
```

---

### Task 2: Test Helper Update

**Files:**
- Modify: `tests/helpers.js` (lines 35-51)

- [ ] **Step 1: Update `createTestWorker` to use `worker_role`**

Replace the `is_field_worker` references in `tests/helpers.js`:

Old (lines 35-51):
```javascript
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
```

New:
```javascript
  const defaults = {
    name: 'Test Worker',
    phone_number: '+4917612345678',
    worker_type: 'fulltime',
    hourly_rate: 14.0,
    monthly_salary: null,
    registration_date: '2025-01-01',
    vacation_entitlement: 26,
    worker_role: 'field',
  };
  const w = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [w.name, w.phone_number, w.worker_type, w.hourly_rate, w.monthly_salary, w.registration_date, w.vacation_entitlement, w.worker_role]
  );
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers.js
git commit -m "refactor: update test helper to use worker_role"
```

---

### Task 3: Update Test Files

**Files:**
- Modify: `tests/services/analytics.test.js` (lines 255-256)
- Modify: `tests/services/commandCenter.test.js` (lines 108-109)
- Modify: `tests/services/planGeneration.test.js` (lines 123-124)

- [ ] **Step 1: Update analytics.test.js**

Replace:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });
```

With:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', worker_role: 'field' });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
```

- [ ] **Step 2: Update commandCenter.test.js**

Replace:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });
```

With:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
```

- [ ] **Step 3: Update planGeneration.test.js**

Replace:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', is_field_worker: true });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', is_field_worker: false });
```

With:
```javascript
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
```

- [ ] **Step 4: Commit**

```bash
git add tests/services/analytics.test.js tests/services/commandCenter.test.js tests/services/planGeneration.test.js
git commit -m "refactor: update test files to use worker_role"
```

---

### Task 4: Update Service Layer — planGeneration.js

**Files:**
- Modify: `src/services/planGeneration.js` (lines 75, 248)

- [ ] **Step 1: Update `generateDraftPlan` query (line 75)**

Replace:
```javascript
     WHERE w.is_active = true AND w.is_field_worker = true`
```

With:
```javascript
     WHERE w.is_active = true AND w.worker_role = 'field'`
```

- [ ] **Step 2: Update `redistributeSickWorkers` query (line 248)**

Replace:
```javascript
     WHERE w.is_active = true AND w.is_field_worker = true AND w.id != ALL($2::int[])`,
```

With:
```javascript
     WHERE w.is_active = true AND w.worker_role = 'field' AND w.id != ALL($2::int[])`,
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/planGeneration.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/planGeneration.js
git commit -m "refactor: planGeneration uses worker_role instead of is_field_worker"
```

---

### Task 5: Update Service Layer — analytics.js

**Files:**
- Modify: `src/services/analytics.js` (lines 207, 269)

- [ ] **Step 1: Update `getWorkerAnalytics` query (line 207)**

Replace:
```javascript
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.is_field_worker = true
```

With:
```javascript
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.worker_role = 'field'
```

- [ ] **Step 2: Update `getCostAnalytics` query (line 269)**

Replace:
```javascript
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.is_field_worker = true
```

With:
```javascript
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.worker_role = 'field'
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/analytics.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/analytics.js
git commit -m "refactor: analytics uses worker_role instead of is_field_worker"
```

---

### Task 6: Update Service Layer — commandCenter.js

**Files:**
- Modify: `src/services/commandCenter.js` (lines 162, 228)

- [ ] **Step 1: Update `getTimeEntries` query (line 162)**

Replace:
```javascript
     WHERE te.date = $1 AND w.is_field_worker = true`,
```

With:
```javascript
     WHERE te.date = $1 AND w.worker_role = 'field'`,
```

- [ ] **Step 2: Update `getTimelineEntries` query (line 228)**

Replace:
```javascript
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND w.is_field_worker = true
```

With:
```javascript
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND w.worker_role = 'field'
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/commandCenter.test.js`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/commandCenter.js
git commit -m "refactor: commandCenter uses worker_role instead of is_field_worker"
```

---

### Task 7: Update API — workers/[id].js

**Files:**
- Modify: `api/_handlers/workers/[id].js` (lines 16-18)

- [ ] **Step 1: Replace `is_field_worker` with `worker_role` in the PUT handler**

Replace lines 16-18:
```javascript
    const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement', 'registration_date', 'is_field_worker'];
    const numericFields = new Set(['hourly_rate', 'monthly_salary', 'vacation_entitlement']);
    const booleanFields = new Set(['is_field_worker']);
```

With:
```javascript
    const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement', 'registration_date', 'worker_role'];
    const numericFields = new Set(['hourly_rate', 'monthly_salary', 'vacation_entitlement']);
    const enumFields = new Set(['worker_role']);
```

Also replace the boolean handling block (lines 30-32):
```javascript
        if (booleanFields.has(field)) {
          val = Boolean(val);
        }
```

With validation:
```javascript
        if (enumFields.has(field)) {
          if (!['field', 'cleaning', 'office'].includes(val)) {
            return res.status(400).json({ error: 'worker_role must be field, cleaning, or office' });
          }
        }
```

- [ ] **Step 2: Commit**

```bash
git add api/_handlers/workers/[id].js
git commit -m "refactor: workers PUT accepts worker_role instead of is_field_worker"
```

---

### Task 8: Update API — workers/index.js (POST)

**Files:**
- Modify: `api/_handlers/workers/index.js` (lines 16, 27-31)

- [ ] **Step 1: Add `worker_role` to the POST handler**

Replace line 16:
```javascript
    const { name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement } = req.body;
```

With:
```javascript
    const { name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role } = req.body;
```

Add role validation after the `worker_type` check (after line 24):
```javascript
    const role = worker_role || 'field';
    if (!['field', 'cleaning', 'office'].includes(role)) {
      return res.status(400).json({ error: 'worker_role must be field, cleaning, or office' });
    }
```

Replace the INSERT query (lines 27-31):
```javascript
      const result = await pool.query(
        `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, phone_number, worker_type, hourly_rate || null, monthly_salary || null, registration_date || null, vacation_entitlement || 0, role]
      );
```

- [ ] **Step 2: Commit**

```bash
git add api/_handlers/workers/index.js
git commit -m "refactor: workers POST accepts worker_role"
```

---

### Task 9: Rename API — field-status.js → role.js

**Files:**
- Create: `api/_handlers/workers/role.js`
- Delete: `api/_handlers/workers/field-status.js`
- Modify: `api/index.js` (lines 10, 63)

- [ ] **Step 1: Create `api/_handlers/workers/role.js`**

```javascript
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { worker_id, role, force } = req.body;
  if (!worker_id || !['field', 'cleaning', 'office'].includes(role)) {
    return res.status(400).json({ error: 'worker_id and role (field/cleaning/office) are required' });
  }

  let warnings = [];

  if (role !== 'field') {
    // Check if this would remove the last field worker
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM workers WHERE is_active = true AND worker_role = 'field' AND id != $1`,
      [worker_id]
    );
    if (count === 0) {
      warnings.push('last_field_worker');
    }

    // Check for future plan assignments
    const { rows: [{ count: futureCount }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM plan_assignments pa
       JOIN daily_plans dp ON dp.id = pa.daily_plan_id
       WHERE pa.worker_id = $1 AND dp.plan_date > CURRENT_DATE AND pa.status != 'completed'`,
      [worker_id]
    );
    if (futureCount > 0) {
      warnings.push('future_assignments');
    }

    // If warnings exist and not forced, return warnings for confirmation
    if (warnings.length > 0 && !force) {
      return res.json({ _warnings: warnings, future_assignment_count: futureCount });
    }

    // Remove future plan assignments
    if (futureCount > 0) {
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
    `UPDATE workers SET worker_role = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *`,
    [role, worker_id]
  );

  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  return res.json(updated);
});
```

- [ ] **Step 2: Update `api/index.js` — change import and route**

Replace line 10:
```javascript
import workersFieldStatusHandler from './_handlers/workers/field-status.js';
```

With:
```javascript
import workersRoleHandler from './_handlers/workers/role.js';
```

Replace line 63:
```javascript
  ['workers/field-status', workersFieldStatusHandler],
```

With:
```javascript
  ['workers/role', workersRoleHandler],
```

- [ ] **Step 3: Delete the old file**

```bash
git rm api/_handlers/workers/field-status.js
```

- [ ] **Step 4: Commit**

```bash
git add api/_handlers/workers/role.js api/index.js
git commit -m "refactor: rename workers/field-status to workers/role endpoint"
```

---

### Task 10: Update Translations

**Files:**
- Modify: `client/src/i18n/translations.js` (German lines 104-110, English lines 451-457)

- [ ] **Step 1: Update German translations**

Replace lines 104-110:
```javascript
    'workers.fieldWorker': 'Außendienst',
    'workers.office': 'Büro',
    'workers.filterAll': 'Alle',
    'workers.filterField': 'Außendienst',
    'workers.filterOffice': 'Büro',
    'workers.lastFieldWorkerWarning': 'Kein Außendienstmitarbeiter mehr vorhanden. Tagespläne können nicht erstellt werden.',
    'workers.futureAssignmentsWarning': 'Dieser Mitarbeiter hat zukünftige Einsätze. Diese werden entfernt.',
```

With:
```javascript
    'workers.role': 'Rolle',
    'workers.role.field': 'Außendienst',
    'workers.role.cleaning': 'Reinigung',
    'workers.role.office': 'Büro',
    'workers.filterAll': 'Alle',
    'workers.filterField': 'Außendienst',
    'workers.filterCleaning': 'Reinigung',
    'workers.filterOffice': 'Büro',
    'workers.lastFieldWorkerWarning': 'Kein Außendienstmitarbeiter mehr vorhanden. Tagespläne können nicht erstellt werden.',
    'workers.futureAssignmentsWarning': 'Dieser Mitarbeiter hat zukünftige Einsätze. Diese werden entfernt.',
```

- [ ] **Step 2: Update English translations**

Replace lines 451-457:
```javascript
    'workers.fieldWorker': 'Field Worker',
    'workers.office': 'Office',
    'workers.filterAll': 'All',
    'workers.filterField': 'Field',
    'workers.filterOffice': 'Office',
    'workers.lastFieldWorkerWarning': 'No field workers remaining. Daily plans cannot be generated.',
    'workers.futureAssignmentsWarning': 'This worker has future assignments. They will be removed.',
```

With:
```javascript
    'workers.role': 'Role',
    'workers.role.field': 'Field',
    'workers.role.cleaning': 'Cleaning',
    'workers.role.office': 'Office',
    'workers.filterAll': 'All',
    'workers.filterField': 'Field',
    'workers.filterCleaning': 'Cleaning',
    'workers.filterOffice': 'Office',
    'workers.lastFieldWorkerWarning': 'No field workers remaining. Daily plans cannot be generated.',
    'workers.futureAssignmentsWarning': 'This worker has future assignments. They will be removed.',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add worker role translation keys"
```

---

### Task 11: Update WorkerForm Component

**Files:**
- Modify: `client/src/components/WorkerForm.jsx` (lines 19, 27, 78-88)

- [ ] **Step 1: Update form defaults and initialization**

Replace line 19:
```javascript
      registration_date: '', vacation_entitlement: '', is_field_worker: true,
```

With:
```javascript
      registration_date: '', vacation_entitlement: '', worker_role: 'field',
```

Replace line 27:
```javascript
      is_field_worker: worker.is_field_worker !== false,
```

With:
```javascript
      worker_role: worker.worker_role || 'field',
```

- [ ] **Step 2: Replace checkbox with role dropdown**

Replace lines 78-88 (the `is_field_worker` form group):
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

With:
```jsx
        <div className="form-group">
          <label className="form-label">{t('workers.role')}</label>
          <select className="select" value={form.worker_role} onChange={e => update('worker_role', e.target.value)}>
            <option value="field">{t('workers.role.field')}</option>
            <option value="cleaning">{t('workers.role.cleaning')}</option>
            <option value="office">{t('workers.role.office')}</option>
          </select>
        </div>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/WorkerForm.jsx
git commit -m "feat: replace is_field_worker checkbox with role dropdown in WorkerForm"
```

---

### Task 12: Update Workers Page

**Files:**
- Modify: `client/src/pages/Workers.jsx`

- [ ] **Step 1: Update filter tabs (line 115)**

Replace:
```jsx
        {['all', 'field', 'office'].map(f => (
```

With:
```jsx
        {['all', 'field', 'cleaning', 'office'].map(f => (
```

- [ ] **Step 2: Update filter logic (lines 80-84)**

Replace:
```javascript
  const filteredWorkers = workers.filter(w => {
    if (filter === 'field') return w.is_field_worker;
    if (filter === 'office') return !w.is_field_worker;
    return true;
  });
```

With:
```javascript
  const filteredWorkers = workers.filter(w => {
    if (filter === 'all') return true;
    return w.worker_role === filter;
  });
```

- [ ] **Step 3: Update tab label rendering (lines 119-121)**

Replace:
```jsx
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t(`workers.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
```

This already works — the `filterCleaning` key was added in Task 10. No change needed.

- [ ] **Step 4: Replace the `handleFieldToggle` function (lines 55-78)**

Replace:
```javascript
  const handleFieldToggle = async (worker, force = false) => {
    const newValue = !worker.is_field_worker;
    try {
      setError(null);
      setWarning(null);
      const result = await api.put('/workers/field-status', {
        worker_id: worker.id,
        is_field_worker: newValue,
        force,
      });
      if (result?._warnings) {
        const messages = [];
        if (result._warnings.includes('last_field_worker')) messages.push(t('workers.lastFieldWorkerWarning'));
        if (result._warnings.includes('future_assignments')) messages.push(t('workers.futureAssignmentsWarning'));
        if (confirm(messages.join('\n\n'))) {
          await handleFieldToggle(worker, true);
        }
        return;
      }
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };
```

With:
```javascript
  const handleRoleChange = async (worker, newRole, force = false) => {
    try {
      setError(null);
      setWarning(null);
      const result = await api.put('/workers/role', {
        worker_id: worker.id,
        role: newRole,
        force,
      });
      if (result?._warnings) {
        const messages = [];
        if (result._warnings.includes('last_field_worker')) messages.push(t('workers.lastFieldWorkerWarning'));
        if (result._warnings.includes('future_assignments')) messages.push(t('workers.futureAssignmentsWarning'));
        if (confirm(messages.join('\n\n'))) {
          await handleRoleChange(worker, newRole, true);
        }
        return;
      }
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };
```

- [ ] **Step 5: Update table header (line 135)**

Replace:
```jsx
              <th>{t('workers.fieldWorker')}</th>
```

With:
```jsx
              <th>{t('workers.role')}</th>
```

- [ ] **Step 6: Update table row — name badge (line 143-144)**

Replace:
```jsx
                  {!w.is_field_worker && <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>{t('workers.office')}</span>}
```

With:
```jsx
                  {w.worker_role !== 'field' && <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>{t(`workers.role.${w.worker_role}`)}</span>}
```

- [ ] **Step 7: Update table row — replace checkbox with role dropdown (line 154)**

Replace:
```jsx
                <td><input type="checkbox" checked={w.is_field_worker} onChange={() => handleFieldToggle(w)} style={{ cursor: 'pointer' }} /></td>
```

With:
```jsx
                <td>
                  <select
                    className="select"
                    value={w.worker_role}
                    onChange={e => handleRoleChange(w, e.target.value)}
                    style={{ minWidth: '100px' }}
                  >
                    <option value="field">{t('workers.role.field')}</option>
                    <option value="cleaning">{t('workers.role.cleaning')}</option>
                    <option value="office">{t('workers.role.office')}</option>
                  </select>
                </td>
```

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Workers.jsx
git commit -m "feat: Workers page uses role dropdown instead of field worker toggle"
```

---

### Task 13: Run Full Test Suite & Verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Fix any remaining `is_field_worker` references**

Run: `grep -r "is_field_worker" --include="*.js" --include="*.jsx" src/ api/ client/`
Expected: No matches (only test files and docs may have references).

- [ ] **Step 3: Start dev server and verify Workers page**

Run: `npm run dev`
Verify:
- Workers page loads with 4 filter tabs: All / Außendienst / Reinigung / Büro
- Each worker row shows a role dropdown instead of a checkbox
- Changing role via dropdown triggers confirmation when needed
- New worker form has a role dropdown defaulting to "Außendienst"

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any remaining is_field_worker references"
```
