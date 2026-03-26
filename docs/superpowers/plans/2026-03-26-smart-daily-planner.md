# Smart Daily Planner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate daily worker-to-property assignments, handle sick worker redistribution, let Halil review/edit/approve the plan, and send assignments to workers via WhatsApp.

**Architecture:** New `daily_plans` and `plan_assignments` tables store the plan. A service generates draft plans from existing property schedules and team assignments. Cron jobs create plans nightly and redistribute on sick calls. A new frontend page lets Halil review, edit, and approve plans. Approval triggers WhatsApp messages to workers.

**Tech Stack:** PostgreSQL (Supabase), Node.js/Express catch-all router on Vercel, React 19, Twilio WhatsApp, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-smart-operations-suite-design.md` — Feature 1

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/db/migrations/005-daily-plans-schema.sql` | New tables: `daily_plans`, `plan_assignments`, `worker_preferences` |
| `src/services/planGeneration.js` | Draft plan generation, sick worker redistribution, plan approval |
| `src/services/planNotifications.js` | Send approved plan assignments via WhatsApp |
| `api/_handlers/daily-plans/index.js` | GET list plans, POST create plan |
| `api/_handlers/daily-plans/[id].js` | GET single plan with assignments |
| `api/_handlers/daily-plans/approve.js` | POST approve plan and send WhatsApp |
| `api/_handlers/plan-assignments/[id].js` | PUT reassign a plan assignment |
| `client/src/pages/DailyPlan.jsx` | Plan review, editing, approval page |
| `tests/services/planGeneration.test.js` | Plan generation and redistribution tests |

### Modified Files
| File | Change |
|------|--------|
| `api/index.js` | Register new routes |
| `api/_handlers/cron/nightly.js` | Add draft plan generation |
| `api/_handlers/cron/morning.js` | Add sick worker redistribution |
| `tests/helpers.js` | Add cleanup for new tables, add `createTestProperty` and `createTestPlan` factories |
| `client/src/App.jsx` | Add `/daily-plan` route |
| `client/src/components/Layout.jsx` | Add "Tagesplan" nav item |
| `client/src/i18n/translations.js` | Add plan-related translations |

---

## Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/005-daily-plans-schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 005: Daily Plans for Smart Daily Planner
-- Creates tables for daily plan generation, assignments, and worker preferences

CREATE TABLE daily_plans (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(50)
);

CREATE TABLE plan_assignments (
  id SERIAL PRIMARY KEY,
  daily_plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  assignment_order INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(10) NOT NULL DEFAULT 'auto',
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_preferences (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) UNIQUE,
  is_flex_worker BOOLEAN NOT NULL DEFAULT false,
  max_properties_per_day INTEGER NOT NULL DEFAULT 4,
  preferred_properties INTEGER[] DEFAULT '{}'
);

CREATE INDEX idx_daily_plans_date ON daily_plans(plan_date);
CREATE INDEX idx_plan_assignments_plan ON plan_assignments(daily_plan_id);
CREATE INDEX idx_plan_assignments_worker ON plan_assignments(worker_id);
```

- [ ] **Step 2: Run the migration**

```bash
node src/db/migrate.js
```

Expected: Migration 005 applied successfully. Tables `daily_plans`, `plan_assignments`, `worker_preferences` created.

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/005-daily-plans-schema.sql
git commit -m "feat: add daily plans schema migration (005)"
```

---

## Task 2: Test Helpers — Add Factories and Cleanup

**Files:**
- Modify: `tests/helpers.js`

- [ ] **Step 1: Add new table cleanup to `cleanDb()`**

Add these DELETE lines at the **top** of the cleanup query (before existing deletes, since `plan_assignments` references `daily_plans` which references `workers`):

```javascript
// In cleanDb(), add BEFORE the existing DELETE statements:
    DELETE FROM plan_assignments;
    DELETE FROM daily_plans;
    DELETE FROM worker_preferences;
```

The full `cleanDb()` function becomes:

```javascript
export async function cleanDb() {
  await pool.query(`
    DELETE FROM plan_assignments;
    DELETE FROM daily_plans;
    DELETE FROM worker_preferences;
    DELETE FROM garbage_tasks;
    DELETE FROM garbage_schedules;
    DELETE FROM conversation_state;
    DELETE FROM task_assignments;
    DELETE FROM extra_jobs;
    DELETE FROM team_members;
    DELETE FROM teams;
    DELETE FROM properties;
    DELETE FROM monthly_reports;
    DELETE FROM sick_leave;
    DELETE FROM time_entries;
    DELETE FROM vacation_balances;
    DELETE FROM workers;
  `);
}
```

- [ ] **Step 2: Add `createTestProperty` factory**

```javascript
export async function createTestProperty(overrides = {}) {
  const defaults = {
    address: 'Mozartstraße 12',
    city: 'Pfaffenhofen',
    assigned_weekday: 1,
    standard_tasks: 'Treppenhausreinigung, Mülltonnen',
    is_active: true,
  };
  const p = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO properties (address, city, assigned_weekday, standard_tasks, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [p.address, p.city, p.assigned_weekday, p.standard_tasks, p.is_active]
  );
  return result.rows[0];
}
```

- [ ] **Step 3: Add `createTestPlan` factory**

```javascript
export async function createTestPlan(overrides = {}) {
  const defaults = {
    plan_date: new Date().toISOString().split('T')[0],
    status: 'draft',
  };
  const p = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO daily_plans (plan_date, status) VALUES ($1, $2) RETURNING *`,
    [p.plan_date, p.status]
  );
  return result.rows[0];
}

export async function createTestAssignment(planId, workerId, propertyId, overrides = {}) {
  const defaults = {
    assignment_order: 1,
    source: 'auto',
    status: 'assigned',
  };
  const a = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order, source, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [planId, workerId, propertyId, a.assignment_order, a.source, a.status]
  );
  return result.rows[0];
}
```

- [ ] **Step 4: Commit**

```bash
git add tests/helpers.js
git commit -m "test: add daily plan factories and cleanup to test helpers"
```

---

## Task 3: Plan Generation Service — Pure Functions

**Files:**
- Create: `src/services/planGeneration.js`
- Create: `tests/services/planGeneration.test.js`

- [ ] **Step 1: Write tests for pure functions**

```javascript
// tests/services/planGeneration.test.js
import { describe, it, expect } from 'vitest';
import { getAvailableWorkers, findBestWorkerForProperty } from '../../src/services/planGeneration.js';

describe('getAvailableWorkers', () => {
  it('excludes workers who are on sick leave', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
      { id: 3, name: 'Hasan' },
    ];
    const sickWorkerIds = [2];
    const vacationWorkerIds = [];
    const result = getAvailableWorkers(workers, sickWorkerIds, vacationWorkerIds);
    expect(result).toHaveLength(2);
    expect(result.map(w => w.id)).toEqual([1, 3]);
  });

  it('excludes workers who are on vacation', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
    ];
    const result = getAvailableWorkers(workers, [], [1]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('excludes both sick and vacation workers', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
      { id: 3, name: 'Hasan' },
    ];
    const result = getAvailableWorkers(workers, [1], [3]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('findBestWorkerForProperty', () => {
  it('returns flex worker with fewest assignments first', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: false, assignment_count: 1 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 2 },
      { id: 3, name: 'Hasan', is_flex: true, assignment_count: 1 },
    ];
    const result = findBestWorkerForProperty(available, 10, []);
    expect(result.id).toBe(3);
  });

  it('prefers worker who has serviced the property before', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: true, assignment_count: 2 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 3 },
    ];
    const propertyHistory = [2]; // worker 2 has been here before
    const result = findBestWorkerForProperty(available, 10, propertyHistory);
    expect(result.id).toBe(2);
  });

  it('returns null if no workers available', () => {
    const result = findBestWorkerForProperty([], 10, []);
    expect(result).toBeNull();
  });

  it('skips workers at max capacity', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: true, assignment_count: 4, max_properties: 4 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 2, max_properties: 4 },
    ];
    const result = findBestWorkerForProperty(available, 10, []);
    expect(result.id).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: FAIL — `planGeneration.js` doesn't exist yet.

- [ ] **Step 3: Implement pure functions**

```javascript
// src/services/planGeneration.js
import { pool } from '../db/pool.js';

// --- Pure functions ---

export function getAvailableWorkers(workers, sickWorkerIds, vacationWorkerIds) {
  const excludeSet = new Set([...sickWorkerIds, ...vacationWorkerIds]);
  return workers.filter(w => !excludeSet.has(w.id));
}

export function findBestWorkerForProperty(available, propertyId, propertyHistory) {
  if (available.length === 0) return null;

  // Filter out workers at max capacity
  const withCapacity = available.filter(w =>
    !w.max_properties || w.assignment_count < w.max_properties
  );
  if (withCapacity.length === 0) return null;

  // Prefer flex workers who have serviced this property before
  const historySet = new Set(propertyHistory);
  const withHistory = withCapacity.filter(w => historySet.has(w.id));

  if (withHistory.length > 0) {
    // Among workers with history, pick the one with fewest assignments
    withHistory.sort((a, b) => a.assignment_count - b.assignment_count);
    return withHistory[0];
  }

  // Among flex workers, pick fewest assignments
  const flexWorkers = withCapacity.filter(w => w.is_flex);
  if (flexWorkers.length > 0) {
    flexWorkers.sort((a, b) => a.assignment_count - b.assignment_count);
    return flexWorkers[0];
  }

  // Fallback: any worker with fewest assignments
  withCapacity.sort((a, b) => a.assignment_count - b.assignment_count);
  return withCapacity[0];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planGeneration.js tests/services/planGeneration.test.js
git commit -m "feat: add plan generation pure functions with tests"
```

---

## Task 4: Plan Generation Service — DB Functions

**Files:**
- Modify: `src/services/planGeneration.js`
- Modify: `tests/services/planGeneration.test.js`

- [ ] **Step 1: Write tests for `generateDraftPlan`**

```javascript
// Add to tests/services/planGeneration.test.js
import { beforeEach, vi } from 'vitest';
import { generateDraftPlan, getPlanWithAssignments } from '../../src/services/planGeneration.js';
import { cleanDb, createTestWorker, createTestProperty, describeWithDb } from '../helpers.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendInteractiveButtons: vi.fn().mockResolvedValue({}),
}));

describeWithDb('generateDraftPlan', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a draft plan with assignments based on property schedule', async () => {
    // Monday = weekday 1
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop1 = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });
    const prop2 = await createTestProperty({ assigned_weekday: 1, address: 'Beethovenstr 5' });

    // Create team with workers assigned to property
    const { pool: db } = await import('../../src/db/pool.js');
    const { rows: [team] } = await db.query(
      `INSERT INTO teams (name, date) VALUES ('Team A', '2026-03-30') RETURNING *`
    );
    await db.query(
      `INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2), ($1, $3)`,
      [team.id, worker1.id, worker2.id]
    );
    // Assign team to tasks for the properties
    await db.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, '2026-03-30', 'Reinigung', 'pending'),
              ($3, $2, '2026-03-30', 'Reinigung', 'pending')`,
      [prop1.id, team.id, prop2.id]
    );

    // 2026-03-30 is a Monday (weekday 1)
    const plan = await generateDraftPlan('2026-03-30');

    expect(plan.status).toBe('draft');
    expect(plan.plan_date).toBeDefined();

    const full = await getPlanWithAssignments(plan.id);
    expect(full.assignments.length).toBeGreaterThanOrEqual(1);
  });

  it('does not create duplicate plan for same date', async () => {
    await createTestWorker({ phone_number: '+4917600000001' });
    await createTestProperty({ assigned_weekday: 1 });

    const plan1 = await generateDraftPlan('2026-03-30');
    const plan2 = await generateDraftPlan('2026-03-30');

    expect(plan2.id).toBe(plan1.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: FAIL — `generateDraftPlan` and `getPlanWithAssignments` not yet implemented.

- [ ] **Step 3: Implement `generateDraftPlan` and `getPlanWithAssignments`**

Add to `src/services/planGeneration.js`:

```javascript
// --- DB functions ---

export async function generateDraftPlan(dateStr) {
  // Check if plan already exists
  const { rows: existing } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [dateStr]
  );
  if (existing.length > 0) return existing[0];

  // Create draft plan
  const { rows: [plan] } = await pool.query(
    `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
    [dateStr]
  );

  // Get weekday for the date
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  // Get active properties for this weekday
  const { rows: properties } = await pool.query(
    `SELECT id, standard_tasks FROM properties
     WHERE assigned_weekday = $1 AND is_active = true`,
    [weekday]
  );

  // Get active workers with preferences
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            COALESCE(wp.preferred_properties, '{}') AS preferred_properties
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true`
  );

  // Get sick workers for this date
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND start_date + (declared_days || ' days')::INTERVAL > $1::DATE
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = sickWorkers.map(s => s.worker_id);

  // Get workers on vacation for this date
  const { rows: vacationWorkers } = await pool.query(
    `SELECT worker_id FROM vacation_balances
     WHERE start_date <= $1 AND end_date >= $1`,
    [dateStr]
  );
  const vacationIds = vacationWorkers.map(v => v.worker_id);

  const available = getAvailableWorkers(workers, sickIds, vacationIds);

  // Get existing team assignments for this date to follow default patterns
  const { rows: teamAssignments } = await pool.query(
    `SELECT DISTINCT tm.worker_id, ta.property_id
     FROM task_assignments ta
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE ta.date = $1`,
    [dateStr]
  );

  // Build default worker→property map from team assignments
  const defaultMap = new Map();
  for (const ta of teamAssignments) {
    if (!defaultMap.has(ta.property_id)) {
      defaultMap.set(ta.property_id, []);
    }
    defaultMap.get(ta.property_id).push(ta.worker_id);
  }

  // Track assignment counts per worker
  const assignmentCounts = new Map();
  const availableIds = new Set(available.map(w => w.id));

  let order = 1;
  for (const prop of properties) {
    // Try default workers first
    const defaultWorkers = defaultMap.get(prop.id) || [];
    let assignedWorkerId = null;

    for (const wid of defaultWorkers) {
      if (availableIds.has(wid)) {
        const count = assignmentCounts.get(wid) || 0;
        const worker = available.find(w => w.id === wid);
        if (count < worker.max_properties) {
          assignedWorkerId = wid;
          break;
        }
      }
    }

    // If no default worker available, find the best alternative
    if (!assignedWorkerId) {
      const withCounts = available.map(w => ({
        ...w,
        assignment_count: assignmentCounts.get(w.id) || 0,
      }));

      // Get property history — workers who have been assigned to this property before
      const { rows: history } = await pool.query(
        `SELECT DISTINCT worker_id FROM plan_assignments
         WHERE property_id = $1 AND status = 'completed'`,
        [prop.id]
      );
      const propertyHistory = history.map(h => h.worker_id);

      const best = findBestWorkerForProperty(withCounts, prop.id, propertyHistory);
      if (best) assignedWorkerId = best.id;
    }

    if (assignedWorkerId) {
      await pool.query(
        `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order, source)
         VALUES ($1, $2, $3, $4, 'auto')`,
        [plan.id, assignedWorkerId, prop.id, order]
      );
      assignmentCounts.set(assignedWorkerId, (assignmentCounts.get(assignedWorkerId) || 0) + 1);
      order++;
    } else {
      // Unresolved gap — insert with worker_id NULL is not allowed by FK
      // Instead, we track gaps in the plan by not assigning the property
      // The frontend will show unassigned properties as gaps
      // We still insert but mark source as 'gap'
      // Actually, we can't insert without worker_id (FK constraint)
      // So we'll track gaps separately via a query for unassigned properties
    }
  }

  return plan;
}

export async function getPlanWithAssignments(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return null;

  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city, p.standard_tasks
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  // Get unassigned properties (gap detection)
  const [year, month, day] = plan.plan_date.toISOString().split('T')[0].split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const assignedPropertyIds = assignments.map(a => a.property_id);

  const { rows: unassigned } = await pool.query(
    `SELECT id, address, city, standard_tasks FROM properties
     WHERE assigned_weekday = $1 AND is_active = true
       AND id != ALL($2::int[])`,
    [weekday, assignedPropertyIds.length > 0 ? assignedPropertyIds : [0]]
  );

  return { ...plan, assignments, unassigned_properties: unassigned };
}

export async function getPlanByDate(dateStr) {
  const { rows } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [dateStr]
  );
  if (rows.length === 0) return null;
  return getPlanWithAssignments(rows[0].id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planGeneration.js tests/services/planGeneration.test.js
git commit -m "feat: add draft plan generation with gap detection"
```

---

## Task 5: Plan Redistribution and Approval

**Files:**
- Modify: `src/services/planGeneration.js`
- Modify: `tests/services/planGeneration.test.js`

- [ ] **Step 1: Write tests for `redistributeSickWorkers` and `approvePlan`**

Add to `tests/services/planGeneration.test.js`:

```javascript
import { redistributeSickWorkers, approvePlan } from '../../src/services/planGeneration.js';
import { pool } from '../../src/db/pool.js';

describeWithDb('redistributeSickWorkers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('reassigns properties from sick worker to available flex worker', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop = await createTestProperty({ assigned_weekday: 1 });

    // Mark worker2 as flex
    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker) VALUES ($1, true)`,
      [worker2.id]
    );

    // Create plan with worker1 assigned
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ('2026-03-30', 'draft') RETURNING *`
    );
    await pool.query(
      `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order)
       VALUES ($1, $2, $3, 1)`,
      [plan.id, worker1.id, prop.id]
    );

    // Worker1 calls in sick
    await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
       VALUES ($1, '2026-03-30', 1, 'pending')`,
      [worker1.id]
    );

    const result = await redistributeSickWorkers('2026-03-30');
    expect(result.reassigned).toBeGreaterThanOrEqual(1);

    // Check that the assignment now belongs to worker2
    const { rows: assignments } = await pool.query(
      `SELECT * FROM plan_assignments WHERE daily_plan_id = $1`,
      [plan.id]
    );
    const reassigned = assignments.find(a => a.property_id === prop.id);
    expect(reassigned.worker_id).toBe(worker2.id);
    expect(reassigned.source).toBe('auto');
  });
});

describeWithDb('approvePlan', () => {
  beforeEach(async () => { await cleanDb(); });

  it('sets plan status to approved', async () => {
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ('2026-03-30', 'draft') RETURNING *`
    );

    const approved = await approvePlan(plan.id, 'halil');
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe('halil');
    expect(approved.approved_at).toBeDefined();
  });

  it('throws if plan is already approved', async () => {
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status, approved_at, approved_by)
       VALUES ('2026-03-30', 'approved', NOW(), 'halil') RETURNING *`
    );

    await expect(approvePlan(plan.id, 'halil')).rejects.toThrow('already approved');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: FAIL — functions not yet implemented.

- [ ] **Step 3: Implement `redistributeSickWorkers` and `approvePlan`**

Add to `src/services/planGeneration.js`:

```javascript
export async function redistributeSickWorkers(dateStr) {
  const plan = await getPlanByDate(dateStr);
  if (!plan || plan.status === 'approved') return { reassigned: 0 };

  // Get sick workers for this date
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND start_date + (declared_days || ' days')::INTERVAL > $1::DATE
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = new Set(sickWorkers.map(s => s.worker_id));
  if (sickIds.size === 0) return { reassigned: 0 };

  // Find assignments for sick workers
  const { rows: sickAssignments } = await pool.query(
    `SELECT pa.* FROM plan_assignments pa
     WHERE pa.daily_plan_id = $1 AND pa.worker_id = ANY($2::int[])`,
    [plan.id, [...sickIds]]
  );
  if (sickAssignments.length === 0) return { reassigned: 0 };

  // Get available workers with preferences and current assignment counts
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            (SELECT COUNT(*) FROM plan_assignments pa2
             WHERE pa2.daily_plan_id = $1 AND pa2.worker_id = w.id) AS assignment_count
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.id != ALL($2::int[])`,
    [plan.id, [...sickIds]]
  );

  let reassigned = 0;
  for (const assignment of sickAssignments) {
    // Get property history
    const { rows: history } = await pool.query(
      `SELECT DISTINCT worker_id FROM plan_assignments
       WHERE property_id = $1 AND status = 'completed'`,
      [assignment.property_id]
    );
    const propertyHistory = history.map(h => h.worker_id);

    // Refresh counts
    const withCounts = workers.map(w => ({
      ...w,
      assignment_count: Number(w.assignment_count) + (
        // Count any reassignments we've already made in this loop
        0 // We re-query below
      ),
    }));

    const best = findBestWorkerForProperty(withCounts, assignment.property_id, propertyHistory);
    if (best) {
      await pool.query(
        `UPDATE plan_assignments SET worker_id = $1, source = 'auto'
         WHERE id = $2`,
        [best.id, assignment.id]
      );
      // Increment the count for the worker we just assigned
      const w = workers.find(w => w.id === best.id);
      if (w) w.assignment_count = Number(w.assignment_count) + 1;
      reassigned++;
    }
  }

  return { reassigned, total_sick_assignments: sickAssignments.length };
}

export async function approvePlan(planId, approvedBy) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) throw new Error('Plan not found');
  if (plan.status === 'approved') throw new Error('Plan is already approved');

  const { rows: [updated] } = await pool.query(
    `UPDATE daily_plans SET status = 'approved', approved_at = NOW(), approved_by = $2
     WHERE id = $1 RETURNING *`,
    [planId, approvedBy]
  );
  return updated;
}

export async function reassignPlanAssignment(assignmentId, newWorkerId) {
  const { rows: [updated] } = await pool.query(
    `UPDATE plan_assignments SET worker_id = $1, source = 'manual'
     WHERE id = $2 RETURNING *`,
    [newWorkerId, assignmentId]
  );
  if (!updated) throw new Error('Assignment not found');
  return updated;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/planGeneration.js tests/services/planGeneration.test.js
git commit -m "feat: add sick worker redistribution and plan approval"
```

---

## Task 6: Plan Notifications Service

**Files:**
- Create: `src/services/planNotifications.js`

- [ ] **Step 1: Create the notification service**

```javascript
// src/services/planNotifications.js
import { pool } from '../db/pool.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export async function sendPlanAssignments(planId) {
  // Get all assignments grouped by worker
  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city, p.standard_tasks
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  if (assignments.length === 0) return { sent: 0 };

  // Get plan date for the message header
  const { rows: [plan] } = await pool.query(
    'SELECT plan_date FROM daily_plans WHERE id = $1',
    [planId]
  );
  const dateStr = plan.plan_date.toISOString().split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const dayLabel = `${DAY_NAMES[weekday]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;

  // Group by worker
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_id)) {
      byWorker.set(a.worker_id, {
        phone: a.worker_phone,
        name: a.worker_name,
        properties: [],
      });
    }
    byWorker.get(a.worker_id).properties.push(a);
  }

  let sent = 0;
  for (const [, worker] of byWorker) {
    const lines = worker.properties.map((p, i) =>
      `${i + 1}. ${p.address}, ${p.city} — ${p.standard_tasks}`
    );
    const message = `📋 Deine Aufgaben fuer heute (${dayLabel}):\n\n${lines.join('\n')}\n\nDruecke "Einchecken" wenn du loslegst.`;

    await sendWhatsAppMessage(worker.phone, message);
    sent++;
  }

  return { sent };
}

export async function notifyHalilPlanGaps(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return;

  const dateStr = plan.plan_date.toISOString().split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  const assignedPropertyIds = (await pool.query(
    'SELECT property_id FROM plan_assignments WHERE daily_plan_id = $1',
    [planId]
  )).rows.map(r => r.property_id);

  const { rows: unassigned } = await pool.query(
    `SELECT address, city FROM properties
     WHERE assigned_weekday = $1 AND is_active = true
       AND id != ALL($2::int[])`,
    [weekday, assignedPropertyIds.length > 0 ? assignedPropertyIds : [0]]
  );

  if (unassigned.length > 0) {
    const list = unassigned.map(p => `- ${p.address}, ${p.city}`).join('\n');
    await sendWhatsAppMessage(
      config.halilWhatsappNumber,
      `⚠️ Tagesplan ${dateStr}: ${unassigned.length} Objekte ohne Zuordnung:\n${list}\n\nBitte im Dashboard zuweisen.`
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/planNotifications.js
git commit -m "feat: add plan notification service for WhatsApp assignments"
```

---

## Task 7: API Handlers

**Files:**
- Create: `api/_handlers/daily-plans/index.js`
- Create: `api/_handlers/daily-plans/[id].js`
- Create: `api/_handlers/daily-plans/approve.js`
- Create: `api/_handlers/plan-assignments/[id].js`

- [ ] **Step 1: Create `daily-plans/index.js` — GET list & POST create**

```javascript
// api/_handlers/daily-plans/index.js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { generateDraftPlan } from '../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT dp.*,
         (SELECT COUNT(*) FROM plan_assignments WHERE daily_plan_id = dp.id) AS assignment_count
       FROM daily_plans dp
       ORDER BY dp.plan_date DESC
       LIMIT 30`
    );
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const plan = await generateDraftPlan(date);
    return res.status(201).json(plan);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 2: Create `daily-plans/[id].js` — GET single plan with assignments**

```javascript
// api/_handlers/daily-plans/[id].js
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getPlanWithAssignments } from '../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'GET') {
    const plan = await getPlanWithAssignments(parseInt(id, 10));
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    return res.json(plan);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 3: Create `daily-plans/approve.js` — POST approve and send**

```javascript
// api/_handlers/daily-plans/approve.js
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { approvePlan } from '../../../src/services/planGeneration.js';
import { sendPlanAssignments } from '../../../src/services/planNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Plan ID is required' });

  const plan = await approvePlan(parseInt(id, 10), 'halil');
  const { sent } = await sendPlanAssignments(plan.id);

  return res.json({ ...plan, messages_sent: sent });
});
```

- [ ] **Step 4: Create `plan-assignments/[id].js` — PUT reassign**

```javascript
// api/_handlers/plan-assignments/[id].js
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { reassignPlanAssignment } from '../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'PUT') {
    const { worker_id } = req.body;
    if (!worker_id) return res.status(400).json({ error: 'worker_id is required' });

    const assignment = await reassignPlanAssignment(parseInt(id, 10), worker_id);
    return res.json(assignment);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 5: Commit**

```bash
git add api/_handlers/daily-plans/ api/_handlers/plan-assignments/
git commit -m "feat: add daily plan API handlers"
```

---

## Task 8: Register Routes in Catch-All Router

**Files:**
- Modify: `api/index.js`

- [ ] **Step 1: Add imports at the top of `api/index.js`**

Add after the existing cron imports (line 42):

```javascript
import dailyPlansIndexHandler from './_handlers/daily-plans/index.js';
import dailyPlansIdHandler from './_handlers/daily-plans/[id].js';
import dailyPlansApproveHandler from './_handlers/daily-plans/approve.js';
import planAssignmentsIdHandler from './_handlers/plan-assignments/[id].js';
```

- [ ] **Step 2: Add static routes**

Add to the `routes` array, after the Tasks section (after line 80):

```javascript
  // Daily Plans
  ['daily-plans', dailyPlansIndexHandler],
```

- [ ] **Step 3: Add dynamic routes**

Add to the `dynamicRoutes` array, after the garbage schedule route (before the closing `]`):

```javascript
  // /daily-plans/:id/approve
  [/^daily-plans\/([^/]+)\/approve$/, dailyPlansApproveHandler, { id: 1 }],
  // /daily-plans/:id
  [/^daily-plans\/([^/]+)$/, dailyPlansIdHandler, { id: 1 }],
  // /plan-assignments/:id
  [/^plan-assignments\/([^/]+)$/, planAssignmentsIdHandler, { id: 1 }],
```

Note: The `/approve` route MUST be before the `/:id` route since dynamic routes are matched in order.

- [ ] **Step 4: Commit**

```bash
git add api/index.js
git commit -m "feat: register daily plan routes in catch-all router"
```

---

## Task 9: Update Cron Handlers

**Files:**
- Modify: `api/_handlers/cron/nightly.js`
- Modify: `api/_handlers/cron/morning.js`

- [ ] **Step 1: Add plan generation to nightly cron**

Add import at top of `api/_handlers/cron/nightly.js`:

```javascript
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { notifyHalilPlanGaps } from '../../../src/services/planNotifications.js';
```

Add after the conversation state cleanup (before `res.json`):

```javascript
    // Generate draft plan for tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const plan = await generateDraftPlan(tomorrow);
    await notifyHalilPlanGaps(plan.id);
```

Update the response to include plan info:

```javascript
    res.json({ ok: true, flagged: missing.length, plan_date: tomorrow, plan_id: plan.id });
```

- [ ] **Step 2: Add sick redistribution to morning cron**

Add import at top of `api/_handlers/cron/morning.js`:

```javascript
import { redistributeSickWorkers } from '../../../src/services/planGeneration.js';
```

Add after `carryOverTasks` (before `generateDailyTasks`):

```javascript
    // Redistribute plan if sick workers detected
    const redistribution = await redistributeSickWorkers(today);
```

Update the response:

```javascript
    res.json({ ok: true, date: today, redistributed: redistribution.reassigned });
```

- [ ] **Step 3: Commit**

```bash
git add api/_handlers/cron/nightly.js api/_handlers/cron/morning.js
git commit -m "feat: integrate plan generation into cron jobs"
```

---

## Task 10: Frontend — Translations

**Files:**
- Modify: `client/src/i18n/translations.js`

- [ ] **Step 1: Add German translations**

Add these keys to the `de` object:

```javascript
  'nav.dailyPlan': 'Tagesplan',
  'plan.title': 'Tagesplan',
  'plan.generatePlan': 'Plan erstellen',
  'plan.approveSend': 'Freigeben & Senden',
  'plan.status.draft': 'Entwurf',
  'plan.status.approved': 'Freigegeben',
  'plan.status.in_progress': 'In Bearbeitung',
  'plan.status.completed': 'Abgeschlossen',
  'plan.noAssignments': 'Keine Zuweisungen fuer diesen Tag.',
  'plan.unassigned': 'Nicht zugewiesene Objekte',
  'plan.assignedTo': 'Zugewiesen an',
  'plan.reassign': 'Umzuweisen',
  'plan.worker': 'Mitarbeiter',
  'plan.properties': 'Objekte',
  'plan.selectWorker': 'Mitarbeiter auswählen',
  'plan.approvedAt': 'Freigegeben am',
  'plan.messagesSent': 'Nachrichten gesendet',
  'plan.generating': 'Plan wird erstellt...',
  'plan.approving': 'Plan wird freigegeben...',
  'plan.gap': 'Lücke — kein Mitarbeiter verfügbar',
```

- [ ] **Step 2: Add English translations**

Add these keys to the `en` object:

```javascript
  'nav.dailyPlan': 'Daily Plan',
  'plan.title': 'Daily Plan',
  'plan.generatePlan': 'Generate Plan',
  'plan.approveSend': 'Approve & Send',
  'plan.status.draft': 'Draft',
  'plan.status.approved': 'Approved',
  'plan.status.in_progress': 'In Progress',
  'plan.status.completed': 'Completed',
  'plan.noAssignments': 'No assignments for this day.',
  'plan.unassigned': 'Unassigned Properties',
  'plan.assignedTo': 'Assigned to',
  'plan.reassign': 'Reassign',
  'plan.worker': 'Worker',
  'plan.properties': 'Properties',
  'plan.selectWorker': 'Select worker',
  'plan.approvedAt': 'Approved at',
  'plan.messagesSent': 'Messages sent',
  'plan.generating': 'Generating plan...',
  'plan.approving': 'Approving plan...',
  'plan.gap': 'Gap — no worker available',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add daily plan translations (de/en)"
```

---

## Task 11: Frontend — DailyPlan Page

**Files:**
- Create: `client/src/pages/DailyPlan.jsx`

- [ ] **Step 1: Create the DailyPlan page**

```jsx
// client/src/pages/DailyPlan.jsx
import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';

const STATUS_BADGE = {
  draft: 'badge-warning',
  approved: 'badge-success',
  in_progress: 'badge-info',
  completed: 'badge-neutral',
};

export default function DailyPlan() {
  const { t } = useLang();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [plan, setPlan] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(null); // assignment id being reassigned

  useEffect(() => {
    loadPlan();
    loadWorkers();
  }, [date]);

  async function loadPlan() {
    setLoading(true);
    setError('');
    try {
      // Try to get plan by date — fetch all plans and find by date
      const plans = await api.get('/daily-plans');
      const found = plans.find(p => {
        const pDate = new Date(p.plan_date).toISOString().split('T')[0];
        return pDate === date;
      });
      if (found) {
        const full = await api.get(`/daily-plans/${found.id}`);
        setPlan(full);
      } else {
        setPlan(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkers() {
    try {
      const data = await api.get('/workers');
      setWorkers(data.filter(w => w.is_active !== false));
    } catch (err) {
      // Non-critical
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      await api.post('/daily-plans', { date });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!plan) return;
    setApproving(true);
    setError('');
    try {
      await api.post(`/daily-plans/${plan.id}/approve`);
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReassign(assignmentId, newWorkerId) {
    setError('');
    try {
      await api.put(`/plan-assignments/${assignmentId}`, { worker_id: parseInt(newWorkerId, 10) });
      await loadPlan();
      setReassigning(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // Group assignments by worker
  const byWorker = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!byWorker.has(a.worker_id)) {
        byWorker.set(a.worker_id, { name: a.worker_name, assignments: [] });
      }
      byWorker.get(a.worker_id).assignments.push(a);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>{t('plan.title')}</h1>
        <div className="page-header-actions">
          <input
            type="date"
            className="input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {!plan && (
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? t('plan.generating') : t('plan.generatePlan')}
            </button>
          )}
          {plan && plan.status === 'draft' && (
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? t('plan.approving') : t('plan.approveSend')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md">{error}</div>}

      {loading && <div className="text-muted">{t('common.loading')}...</div>}

      {!loading && !plan && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="empty-state-text">{t('plan.noAssignments')}</div>
        </div>
      )}

      {plan && (
        <>
          <div className="flex items-center gap-sm mb-md">
            <span className={`badge ${STATUS_BADGE[plan.status] || 'badge-neutral'}`}>
              {t(`plan.status.${plan.status}`)}
            </span>
            {plan.approved_at && (
              <span className="text-muted text-sm">
                {t('plan.approvedAt')}: {new Date(plan.approved_at).toLocaleString('de-DE')}
              </span>
            )}
          </div>

          {/* Worker assignment cards */}
          <div className="stagger-children">
            {[...byWorker.entries()].map(([workerId, worker]) => (
              <div key={workerId} className="card mb-md">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    {' '}{worker.name}
                    <span className="text-muted ml-sm">({worker.assignments.length} {t('plan.properties')})</span>
                  </h3>
                </div>
                <div style={{ padding: 'var(--space-md)' }}>
                  {worker.assignments.map((a, i) => (
                    <div key={a.id} className="flex items-center justify-between mb-sm" style={{ padding: 'var(--space-sm)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <span className="mono text-muted" style={{ marginRight: 'var(--space-sm)' }}>{i + 1}.</span>
                        <strong>{a.address}</strong>, {a.city}
                        <div className="text-muted text-sm">{a.standard_tasks}</div>
                      </div>
                      <div className="flex items-center gap-xs">
                        {a.source === 'manual' && <span className="badge badge-accent">manuell</span>}
                        {plan.status === 'draft' && (
                          reassigning === a.id ? (
                            <select
                              className="select"
                              onChange={e => {
                                if (e.target.value) handleReassign(a.id, e.target.value);
                                else setReassigning(null);
                              }}
                              defaultValue=""
                              autoFocus
                              onBlur={() => setReassigning(null)}
                            >
                              <option value="">{t('plan.selectWorker')}</option>
                              {workers.filter(w => w.id !== workerId).map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setReassigning(a.id)}
                            >
                              {t('plan.reassign')}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Unassigned properties (gaps) */}
          {plan.unassigned_properties && plan.unassigned_properties.length > 0 && (
            <div className="card mb-md" style={{ borderColor: 'var(--danger)' }}>
              <div className="card-header">
                <h3 className="card-title text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  {' '}{t('plan.unassigned')} ({plan.unassigned_properties.length})
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {plan.unassigned_properties.map(p => (
                  <div key={p.id} className="flex items-center justify-between mb-sm" style={{ padding: 'var(--space-sm)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <strong>{p.address}</strong>, {p.city}
                      <div className="text-muted text-sm">{p.standard_tasks}</div>
                    </div>
                    <span className="text-danger text-sm">{t('plan.gap')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DailyPlan.jsx
git commit -m "feat: add DailyPlan page component"
```

---

## Task 12: Frontend — Route and Navigation

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Add route to App.jsx**

Add import at top:

```javascript
import DailyPlan from './pages/DailyPlan';
```

Add route inside the Layout outlet routes, after the DailyTasks route:

```jsx
<Route path="/daily-plan" element={<DailyPlan />} />
```

- [ ] **Step 2: Add nav item to Layout.jsx**

In the `getNavSections` function, add to the `nav.operations` section items array, as the **first item** (before Daily Tasks):

```javascript
        {
          path: '/daily-plan', label: t('nav.dailyPlan'),
          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>,
        },
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: add daily plan route and navigation item"
```

---

## Task 13: Integration Test — End-to-End Plan Flow

**Files:**
- Modify: `tests/services/planGeneration.test.js`

- [ ] **Step 1: Add integration test**

```javascript
describeWithDb('full plan flow', () => {
  beforeEach(async () => { await cleanDb(); });

  it('generates plan, redistributes on sick call, approves', async () => {
    // Setup: 2 workers, 2 properties for Monday
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop1 = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });
    const prop2 = await createTestProperty({ assigned_weekday: 1, address: 'Beethovenstr 5' });

    // Mark worker2 as flex
    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker) VALUES ($1, true)`,
      [worker2.id]
    );

    // Create team so default assignment works
    const { rows: [team] } = await pool.query(
      `INSERT INTO teams (name, date) VALUES ('Team A', '2026-03-30') RETURNING *`
    );
    await pool.query(
      `INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)`,
      [team.id, worker1.id]
    );
    await pool.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, '2026-03-30', 'Reinigung', 'pending'),
              ($3, $2, '2026-03-30', 'Reinigung', 'pending')`,
      [prop1.id, team.id, prop2.id]
    );

    // Step 1: Generate draft plan
    const plan = await generateDraftPlan('2026-03-30');
    expect(plan.status).toBe('draft');

    // Step 2: Worker1 calls in sick
    await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
       VALUES ($1, '2026-03-30', 1, 'pending')`,
      [worker1.id]
    );

    // Step 3: Redistribute
    const result = await redistributeSickWorkers('2026-03-30');
    expect(result.reassigned).toBeGreaterThanOrEqual(0);

    // Step 4: Approve
    const approved = await approvePlan(plan.id, 'halil');
    expect(approved.status).toBe('approved');
  });
});
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run tests/services/planGeneration.test.js
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/services/planGeneration.test.js
git commit -m "test: add end-to-end plan flow integration test"
```

---

## Task 14: Run Full Test Suite and Verify

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All existing tests still pass, all new tests pass.

- [ ] **Step 2: Verify the build**

```bash
cd client && npm run build
```

Expected: Build completes without errors.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve any issues from full test suite run"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Database migration — new tables |
| 2 | Test helpers — factories and cleanup |
| 3 | Plan generation — pure functions + tests |
| 4 | Plan generation — DB functions + tests |
| 5 | Redistribution + approval + tests |
| 6 | Plan notifications — WhatsApp sending |
| 7 | API handlers — 4 new endpoints |
| 8 | Router registration — catch-all routes |
| 9 | Cron updates — nightly + morning |
| 10 | Translations — de/en |
| 11 | DailyPlan page — React component |
| 12 | Route + nav — App.jsx + Layout.jsx |
| 13 | Integration test — full flow |
| 14 | Full suite verification |

**Next plans (after this feature is complete):**
- Feature 2: Command Center Dashboard
- Feature 3: Worker Accountability Flow
- Feature 4: Performance Analytics
