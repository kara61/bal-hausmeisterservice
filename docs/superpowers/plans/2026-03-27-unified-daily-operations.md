# Unified Daily Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate Daily Plan and Daily Tasks pages with a single unified daily operations workflow that auto-assigns workers to property tasks.

**Architecture:** Extend existing `plan_assignments` table with task-level columns (task_name, status, postpone fields, carryover tracking). Rewrite `generateDraftPlan` to use `property_tasks` schedules (Spec 2) and assign 2 workers per property. Add `joker` worker role. Add evening cron for plan generation. Replace two frontend pages with one.

**Tech Stack:** PostgreSQL (Supabase), Node.js/Express API via Vercel Functions, React 19 frontend, Vitest for testing.

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/012-unified-daily-operations.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 012-unified-daily-operations.sql
-- Extend plan_assignments for task-level tracking and add joker worker role.

-- 1. Add 'joker' to worker_role enum
ALTER TYPE worker_role ADD VALUE IF NOT EXISTS 'joker';

-- 2. Extend daily_plans with auto-approve support
ALTER TABLE daily_plans
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ;

-- 3. Extend plan_assignments with task-level fields
ALTER TABLE plan_assignments
  ADD COLUMN IF NOT EXISTS task_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS worker_role worker_role,
  ADD COLUMN IF NOT EXISTS postpone_reason VARCHAR(255),
  ADD COLUMN IF NOT EXISTS postponed_to DATE,
  ADD COLUMN IF NOT EXISTS carried_from_id INTEGER REFERENCES plan_assignments(id),
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 4. Replace status enum: old was ('assigned','completed'), new adds more states
-- We need to migrate the status column to support new values.
-- Since plan_assignments.status is a varchar enum, alter check constraint.
-- First check current type — if it's a CHECK constraint, drop and re-add.
ALTER TABLE plan_assignments DROP CONSTRAINT IF EXISTS plan_assignments_status_check;
ALTER TABLE plan_assignments
  ADD CONSTRAINT plan_assignments_status_check
  CHECK (status IN ('assigned', 'pending', 'in_progress', 'done', 'postponed', 'carried_over', 'completed'));

-- Map existing 'assigned' rows to 'pending' for consistency
UPDATE plan_assignments SET status = 'pending' WHERE status = 'assigned';

-- Drop 'assigned' from allowed values now that data is migrated
ALTER TABLE plan_assignments DROP CONSTRAINT plan_assignments_status_check;
ALTER TABLE plan_assignments
  ADD CONSTRAINT plan_assignments_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'postponed', 'carried_over', 'completed'));
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool:
- project_id: `uytcfocsegoixdaiwhmb`
- name: `012-unified-daily-operations`
- SQL: contents of the migration file

- [ ] **Step 3: Verify migration**

Use `mcp__plugin_supabase_supabase__execute_sql` to verify:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'plan_assignments'
ORDER BY ordinal_position;
```

Expected: `task_name`, `worker_role`, `postpone_reason`, `postponed_to`, `carried_from_id`, `photo_url`, `completed_at` all present.

Also verify joker role:
```sql
SELECT unnest(enum_range(NULL::worker_role));
```

Expected: `field`, `cleaning`, `office`, `joker`.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/012-unified-daily-operations.sql
git commit -m "feat: add migration 012 — extend plan_assignments for unified daily operations"
```

---

### Task 2: Update Test Helpers

**Files:**
- Modify: `tests/helpers.js` — update `createTestAssignment` to accept new columns

- [ ] **Step 1: Update createTestAssignment helper**

In `tests/helpers.js`, replace the existing `createTestAssignment` function (lines 104-117) with:

```javascript
export async function createTestAssignment(planId, workerId, propertyId, overrides = {}) {
  const defaults = {
    assignment_order: 1,
    source: 'auto',
    status: 'pending',
    task_name: null,
    worker_role: null,
  };
  const a = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [planId, workerId, propertyId, a.assignment_order, a.source, a.status, a.task_name, a.worker_role]
  );
  return result.rows[0];
}
```

Note: default status changed from `'assigned'` to `'pending'` to match the new enum.

- [ ] **Step 2: Run existing tests to verify nothing broke**

Run: `npx vitest run 2>&1 | tail -20`

Expected: All existing tests still pass. Some planGeneration tests may need `'assigned'` → `'pending'` status updates (see Task 3).

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.js
git commit -m "feat: update createTestAssignment helper for unified operations"
```

---

### Task 3: Rewrite Plan Generation Service (TDD)

**Files:**
- Modify: `src/services/planGeneration.js` — rewrite `generateDraftPlan`, update `findBestWorkerForProperty`
- Modify: `tests/services/planGeneration.test.js` — add new tests, update existing ones

This is the core task. The new `generateDraftPlan` must:
1. Use `property_tasks` + `shouldTaskRunOnDate` instead of just `assigned_weekday`
2. Assign 2 workers per property (not 1)
3. Create one `plan_assignment` per worker × task (not per worker × property)
4. Prefer workers with property history, then least-loaded

- [ ] **Step 1: Write failing test for task-level plan generation**

Add to `tests/services/planGeneration.test.js`, inside a new `describeWithDb` block after the existing ones:

```javascript
describeWithDb('generateDraftPlan (unified)', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates plan_assignments per worker × task from property_tasks', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });

    // Create 2 tasks for the property
    await createTestPropertyTask(prop.id, { task_name: 'Treppenhausreinigung', worker_role: 'field' });
    await createTestPropertyTask(prop.id, { task_name: 'Mülltonnen', worker_role: 'field' });

    // Monday 2026-03-30 = weekday 1
    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    // 2 tasks × 2 workers = 4 assignments
    expect(full.assignments.length).toBe(4);

    // Each assignment should have task_name and worker_role
    for (const a of full.assignments) {
      expect(a.task_name).toBeTruthy();
      expect(a.worker_role).toBe('field');
      expect(a.status).toBe('pending');
    }

    // Both workers should be assigned
    const workerIds = [...new Set(full.assignments.map(a => a.worker_id))];
    expect(workerIds).toHaveLength(2);
    expect(workerIds).toContain(worker1.id);
    expect(workerIds).toContain(worker2.id);
  });

  it('prefers workers with property history', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const worker3 = await createTestWorker({ name: 'Hasan', phone_number: '+4917600000003' });
    const prop = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });
    await createTestPropertyTask(prop.id, { task_name: 'Reinigung', worker_role: 'field' });

    // Give worker1 and worker3 history at this property
    const oldPlan = await createTestPlan({ plan_date: '2026-03-23', status: 'approved' });
    await createTestAssignment(oldPlan.id, worker1.id, prop.id, { status: 'completed', task_name: 'Reinigung' });
    await createTestAssignment(oldPlan.id, worker3.id, prop.id, { status: 'completed', task_name: 'Reinigung' });

    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    const assignedIds = full.assignments.map(a => a.worker_id);
    // worker1 and worker3 should be preferred (they have history)
    expect(assignedIds).toContain(worker1.id);
    expect(assignedIds).toContain(worker3.id);
    expect(assignedIds).not.toContain(worker2.id);
  });

  it('assigns only 1 worker when only 1 is available', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    await createTestPropertyTask(prop.id, { task_name: 'Reinigung', worker_role: 'field' });

    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    expect(full.assignments.length).toBe(1);
    expect(full.assignments[0].worker_id).toBe(worker1.id);
  });

  it('uses shouldTaskRunOnDate for schedule filtering', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });

    // This task runs on weekday 1 (Monday) — should be included
    await createTestPropertyTask(prop.id, { task_name: 'Weekly Monday', schedule_type: 'weekly', schedule_day: 1 });
    // This task runs on weekday 3 (Wednesday) — should NOT be included on Monday
    await createTestPropertyTask(prop.id, { task_name: 'Weekly Wednesday', schedule_type: 'weekly', schedule_day: 3 });

    const plan = await generateDraftPlan('2026-03-30'); // Monday
    const full = await getPlanWithAssignments(plan.id);

    const taskNames = full.assignments.map(a => a.task_name);
    expect(taskNames).toContain('Weekly Monday');
    expect(taskNames).not.toContain('Weekly Wednesday');
  });

  it('includes cleaning workers for cleaning tasks', async () => {
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
    const cleaningWorker = await createTestWorker({ name: 'Fatma', phone_number: '+4917600000002', worker_role: 'cleaning' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    await createTestPropertyTask(prop.id, { task_name: 'Reinigung', worker_role: 'cleaning' });

    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    // Cleaning worker should be assigned to the cleaning task
    const assignedIds = full.assignments.map(a => a.worker_id);
    expect(assignedIds).toContain(cleaningWorker.id);
    expect(assignedIds).not.toContain(fieldWorker.id);
  });
});
```

Also add the missing import at the top of the test file:
```javascript
import { cleanDb, createTestWorker, createTestProperty, createTestPropertyTask, createTestPlan, createTestAssignment, describeWithDb } from '../helpers.js';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/planGeneration.test.js 2>&1 | tail -30`

Expected: New tests fail because `generateDraftPlan` doesn't use `property_tasks` yet.

- [ ] **Step 3: Rewrite generateDraftPlan**

In `src/services/planGeneration.js`, add the import at the top:

```javascript
import { shouldTaskRunOnDate } from './taskScheduling.js';
```

Replace the `generateDraftPlan` function (lines 42-169) with:

```javascript
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

  // Step 1: Find tasks that need to run today
  const { rows: propertyTaskRows } = await pool.query(
    `SELECT p.id AS property_id, p.assigned_weekday,
            pt.id AS task_id, pt.task_name, pt.worker_role,
            pt.schedule_type, pt.schedule_day, pt.biweekly_start_date
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`
  );

  // Filter by schedule
  const todaysTasks = [];
  for (const row of propertyTaskRows) {
    const property = { assigned_weekday: row.assigned_weekday };
    const task = {
      schedule_type: row.schedule_type,
      schedule_day: row.schedule_day,
      biweekly_start_date: row.biweekly_start_date,
    };
    if (shouldTaskRunOnDate(task, property, dateStr)) {
      todaysTasks.push(row);
    }
  }

  if (todaysTasks.length === 0) return plan;

  // Group tasks by property
  const tasksByProperty = new Map();
  for (const t of todaysTasks) {
    if (!tasksByProperty.has(t.property_id)) {
      tasksByProperty.set(t.property_id, []);
    }
    tasksByProperty.get(t.property_id).push(t);
  }

  // Step 2: Find available workers, grouped by role
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND (declared_days = 0 OR start_date + (declared_days || ' days')::INTERVAL > $1::DATE)
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = sickWorkers.map(s => s.worker_id);

  const { rows: vacationWorkers } = await pool.query(
    `SELECT worker_id FROM vacation_balances
     WHERE start_date <= $1 AND end_date >= $1`,
    [dateStr]
  );
  const vacationIds = vacationWorkers.map(v => v.worker_id);

  const { rows: allWorkers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number, w.worker_role,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.worker_role IN ('field', 'cleaning')`
  );

  const available = getAvailableWorkers(allWorkers, sickIds, vacationIds);

  // Track property count per worker (for max_properties_per_day)
  const propertyCountPerWorker = new Map();

  let order = 1;
  for (const [propertyId, tasks] of tasksByProperty) {
    // Determine which roles are needed at this property
    const neededRoles = [...new Set(tasks.map(t => t.worker_role))];

    // For each role, find 2 best workers
    const assignedWorkersByRole = new Map();
    for (const role of neededRoles) {
      const roleWorkers = available.filter(w => w.worker_role === role);

      // Get property history for this role
      const { rows: history } = await pool.query(
        `SELECT DISTINCT worker_id FROM plan_assignments
         WHERE property_id = $1 AND status IN ('completed', 'done')`,
        [propertyId]
      );
      const propertyHistory = history.map(h => h.worker_id);

      // Pick up to 2 workers
      const picked = [];
      for (let i = 0; i < 2; i++) {
        const withCounts = roleWorkers
          .filter(w => !picked.includes(w.id))
          .map(w => ({
            ...w,
            assignment_count: propertyCountPerWorker.get(w.id) || 0,
          }));

        const best = findBestWorkerForProperty(withCounts, propertyId, propertyHistory);
        if (best) {
          picked.push(best.id);
          propertyCountPerWorker.set(best.id, (propertyCountPerWorker.get(best.id) || 0) + 1);
        }
      }

      assignedWorkersByRole.set(role, picked);
    }

    // Create plan_assignment rows: one per worker × task
    for (const task of tasks) {
      const workerIds = assignedWorkersByRole.get(task.worker_role) || [];
      for (const workerId of workerIds) {
        await pool.query(
          `INSERT INTO plan_assignments
           (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role)
           VALUES ($1, $2, $3, $4, 'auto', 'pending', $5, $6)`,
          [plan.id, workerId, propertyId, order, task.task_name, task.worker_role]
        );
        order++;
      }
    }
  }

  return plan;
}
```

- [ ] **Step 4: Update getPlanWithAssignments to return task-level data**

In `src/services/planGeneration.js`, replace `getPlanWithAssignments` (lines 171-205) with:

```javascript
export async function getPlanWithAssignments(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return null;

  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  // Get unassigned properties: properties with tasks today but no assignments
  const planDate = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;

  const assignedPropertyIds = [...new Set(assignments.map(a => a.property_id))];

  const { rows: allActiveProperties } = await pool.query(
    `SELECT DISTINCT p.id, p.address, p.city
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`,
  );

  // Filter to properties that have tasks running today but aren't assigned
  // We import shouldTaskRunOnDate at the top of the file
  const { rows: allPropertyTasks } = await pool.query(
    `SELECT p.id AS property_id, p.assigned_weekday,
            pt.schedule_type, pt.schedule_day, pt.biweekly_start_date
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`
  );

  const propertiesWithTasksToday = new Set();
  for (const row of allPropertyTasks) {
    const property = { assigned_weekday: row.assigned_weekday };
    const task = { schedule_type: row.schedule_type, schedule_day: row.schedule_day, biweekly_start_date: row.biweekly_start_date };
    if (shouldTaskRunOnDate(task, property, planDate)) {
      propertiesWithTasksToday.add(row.property_id);
    }
  }

  const unassigned = allActiveProperties.filter(
    p => propertiesWithTasksToday.has(p.id) && !assignedPropertyIds.includes(p.id)
  );

  return { ...plan, assignments, unassigned_properties: unassigned };
}
```

- [ ] **Step 5: Update existing tests for status change (assigned → pending)**

In `tests/services/planGeneration.test.js`, update the `createTestAssignment` calls in existing tests that use `status: 'assigned'` — they should now use `status: 'pending'`. Specifically in the `redistributeSickWorkers` and `full plan flow` tests, the existing assertions should still work since the status column just has more allowed values.

Also update the `'excludes non-field workers from plan generation'` test — it now needs `property_tasks` to generate assignments:

```javascript
it('excludes non-field workers from plan generation', async () => {
  const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
  const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
  const prop = await createTestProperty({ assigned_weekday: 1, address: 'Teststr 1' });
  await createTestPropertyTask(prop.id, { task_name: 'Reinigung', worker_role: 'field' });

  const plan = await generateDraftPlan('2026-03-30');
  const full = await getPlanWithAssignments(plan.id);

  const assignedWorkerIds = full.assignments.map(a => a.worker_id);
  expect(assignedWorkerIds).not.toContain(officeWorker.id);
  if (full.assignments.length > 0) {
    expect(assignedWorkerIds).toContain(fieldWorker.id);
  }
});
```

Update the `'creates a draft plan with assignments based on property schedule'` test to use `property_tasks` instead of teams:

```javascript
it('creates a draft plan with assignments based on property schedule', async () => {
  const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
  const prop1 = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });
  await createTestPropertyTask(prop1.id, { task_name: 'Reinigung', worker_role: 'field' });

  const plan = await generateDraftPlan('2026-03-30');
  expect(plan.status).toBe('draft');

  const full = await getPlanWithAssignments(plan.id);
  expect(full.assignments.length).toBeGreaterThanOrEqual(1);
  expect(full.assignments[0].task_name).toBe('Reinigung');
});
```

Update the `'full plan flow'` test similarly — remove team/task_assignment setup, use property_tasks instead.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/services/planGeneration.test.js 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/planGeneration.js tests/services/planGeneration.test.js
git commit -m "feat: rewrite generateDraftPlan for unified daily operations with task-level assignments"
```

---

### Task 4: Add Carryover and Postpone to Plan Assignments

**Files:**
- Modify: `src/services/planGeneration.js` — add `carryOverPlanTasks`, `postponePlanTask`
- Create: `tests/services/planCarryover.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/planCarryover.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { carryOverPlanTasks, postponePlanTask } from '../../src/services/planGeneration.js';
import { cleanDb, createTestWorker, createTestProperty, createTestPropertyTask, createTestPlan, createTestAssignment, describeWithDb } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
}));

describeWithDb('carryOverPlanTasks', () => {
  beforeEach(async () => { await cleanDb(); });

  it('carries over pending tasks to next day', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'pending',
      task_name: 'Reinigung',
      worker_role: 'field',
    });

    const carried = await carryOverPlanTasks('2026-03-30', '2026-03-31');

    expect(carried.length).toBe(1);
    expect(carried[0].task_name).toBe('Reinigung');
    expect(carried[0].status).toBe('pending');
    expect(carried[0].carried_from_id).toBeDefined();

    // Original should be marked as carried_over
    const { rows: originals } = await pool.query(
      `SELECT status FROM plan_assignments WHERE daily_plan_id = $1`,
      [plan.id]
    );
    expect(originals[0].status).toBe('carried_over');
  });

  it('does not carry over completed tasks', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'done',
      task_name: 'Reinigung',
    });

    const carried = await carryOverPlanTasks('2026-03-30', '2026-03-31');
    expect(carried.length).toBe(0);
  });
});

describeWithDb('postponePlanTask', () => {
  beforeEach(async () => { await cleanDb(); });

  it('postpones a task to a new date', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'pending',
      task_name: 'Reinigung',
      worker_role: 'field',
    });

    const result = await postponePlanTask(assignment.id, 'Regen', '2026-04-01');

    expect(result.status).toBe('postponed');
    expect(result.postpone_reason).toBe('Regen');
    expect(new Date(result.postponed_to).toISOString().split('T')[0]).toBe('2026-04-01');

    // New assignment should exist on postponed_to date
    const { rows: newAssignments } = await pool.query(
      `SELECT * FROM plan_assignments WHERE carried_from_id = $1`,
      [assignment.id]
    );
    expect(newAssignments.length).toBe(1);
    expect(newAssignments[0].task_name).toBe('Reinigung');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/planCarryover.test.js 2>&1 | tail -20`

Expected: FAIL — functions don't exist yet.

- [ ] **Step 3: Implement carryOverPlanTasks and postponePlanTask**

Add to `src/services/planGeneration.js`:

```javascript
export async function carryOverPlanTasks(fromDate, toDate) {
  // Find incomplete assignments from the source date
  const { rows: incomplete } = await pool.query(
    `SELECT pa.* FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     WHERE dp.plan_date = $1 AND pa.status IN ('pending', 'in_progress')`,
    [fromDate]
  );

  if (incomplete.length === 0) return [];

  // Ensure a plan exists for the target date
  let { rows: [targetPlan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [toDate]
  );
  if (!targetPlan) {
    const { rows: [newPlan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
      [toDate]
    );
    targetPlan = newPlan;
  }

  const carried = [];
  for (const assignment of incomplete) {
    // Mark original as carried_over
    await pool.query(
      `UPDATE plan_assignments SET status = 'carried_over' WHERE id = $1`,
      [assignment.id]
    );

    // Create new assignment on target date
    const { rows: [newAssignment] } = await pool.query(
      `INSERT INTO plan_assignments
       (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role, carried_from_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8) RETURNING *`,
      [targetPlan.id, assignment.worker_id, assignment.property_id,
       assignment.assignment_order, assignment.source,
       assignment.task_name, assignment.worker_role, assignment.id]
    );
    carried.push(newAssignment);
  }

  return carried;
}

export async function postponePlanTask(assignmentId, reason, newDate) {
  // Update original
  const { rows: [updated] } = await pool.query(
    `UPDATE plan_assignments
     SET status = 'postponed', postpone_reason = $2, postponed_to = $3
     WHERE id = $1 RETURNING *`,
    [assignmentId, reason, newDate]
  );
  if (!updated) throw new Error('Assignment not found');

  // Ensure a plan exists for the new date
  let { rows: [targetPlan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [newDate]
  );
  if (!targetPlan) {
    const { rows: [newPlan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
      [newDate]
    );
    targetPlan = newPlan;
  }

  // Create postponed copy on new date
  await pool.query(
    `INSERT INTO plan_assignments
     (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role, carried_from_id)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
    [targetPlan.id, updated.worker_id, updated.property_id,
     updated.assignment_order, updated.source,
     updated.task_name, updated.worker_role, updated.id]
  );

  return updated;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/services/planCarryover.test.js 2>&1 | tail -20`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/planGeneration.js tests/services/planCarryover.test.js
git commit -m "feat: add carryOverPlanTasks and postponePlanTask for unified operations"
```

---

### Task 5: Update Cron Jobs

**Files:**
- Modify: `api/_handlers/cron/morning.js` — simplify to carryover + redistribute only
- Create: `api/_handlers/cron/evening.js` — new evening cron for plan generation
- Modify: `vercel.json` — add evening cron schedule

- [ ] **Step 1: Rewrite morning cron**

Replace `api/_handlers/cron/morning.js` with:

```javascript
import { carryOverPlanTasks, redistributeSickWorkers } from '../../../src/services/planGeneration.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Carry over unfinished plan tasks from yesterday
    const carried = await carryOverPlanTasks(yesterday, today);

    // Redistribute if sick workers detected
    const redistribution = await redistributeSickWorkers(today);

    res.json({
      ok: true,
      date: today,
      carried_over: carried.length,
      redistributed: redistribution.reassigned,
    });
  } catch (err) {
    console.error('Morning cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
```

- [ ] **Step 2: Create evening cron handler**

Create `api/_handlers/cron/evening.js`:

```javascript
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { notifyHalilPlanReady } from '../../../src/services/planNotifications.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Generate plan for tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const plan = await generateDraftPlan(tomorrow);

    // TODO: Check auto_approve setting — for now, always notify Halil
    await notifyHalilPlanReady(plan.id);

    res.json({ ok: true, date: tomorrow, plan_id: plan.id });
  } catch (err) {
    console.error('Evening cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
```

- [ ] **Step 3: Register evening cron in router**

In `api/index.js`, add the import at the top (after the existing cron imports):

```javascript
import cronEveningHandler from './_handlers/cron/evening.js';
```

Add to the `routes` array, after the `cron/morning` entry:

```javascript
['cron/evening', cronEveningHandler],
```

- [ ] **Step 4: Add evening cron schedule to vercel.json**

In `vercel.json`, add to the `crons` array:

```json
{ "path": "/api/cron/evening", "schedule": "0 17 * * *" }
```

(17:00 UTC = 19:00 CET)

- [ ] **Step 5: Commit**

```bash
git add api/_handlers/cron/morning.js api/_handlers/cron/evening.js api/index.js vercel.json
git commit -m "feat: add evening cron for plan generation, simplify morning cron"
```

---

### Task 6: Update Plan Notifications

**Files:**
- Modify: `src/services/planNotifications.js` — use `task_name` instead of `standard_tasks`

- [ ] **Step 1: Update formatAssignmentLine**

In `src/services/planNotifications.js`, replace `formatAssignmentLine` (line 14) with:

```javascript
function formatAssignmentLine(index, address, city, taskNames) {
  return `${index}. ${address}, ${city} — ${taskNames.join(', ')}`;
}
```

- [ ] **Step 2: Update sendPlanAssignments**

Replace `sendPlanAssignments` (lines 18-70) with:

```javascript
export async function sendPlanAssignments(planId) {
  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.property_id, pa.assignment_order`,
    [planId]
  );

  if (assignments.length === 0) return { sent: 0 };

  const { rows: [plan] } = await pool.query(
    'SELECT plan_date FROM daily_plans WHERE id = $1',
    [planId]
  );
  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;
  const dayLabel = formatDateLabel(dateStr);

  // Create property visits for the accountability flow
  await createVisitsFromPlan(planId);

  // Group by worker, then by property
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_id)) {
      byWorker.set(a.worker_id, { phone: a.worker_phone, name: a.worker_name, properties: new Map() });
    }
    const worker = byWorker.get(a.worker_id);
    if (!worker.properties.has(a.property_id)) {
      worker.properties.set(a.property_id, { address: a.address, city: a.city, tasks: [] });
    }
    worker.properties.get(a.property_id).tasks.push(a.task_name);
  }

  let sent = 0;
  for (const [, worker] of byWorker) {
    const lines = [];
    let i = 1;
    for (const [, prop] of worker.properties) {
      lines.push(formatAssignmentLine(i, prop.address, prop.city, prop.tasks));
      i++;
    }
    const message = `Deine Aufgaben fuer heute (${dayLabel}):\n\n${lines.join('\n')}\n\nDruecke "Einchecken" wenn du loslegst.`;
    await sendWhatsAppButtons(worker.phone, message, [{ id: 'einchecken', title: 'Einchecken' }]);
    sent++;
  }

  return { sent };
}
```

- [ ] **Step 3: Update notifyHalilPlanReady to use task_name**

Replace `notifyHalilPlanReady` (lines 72-135) with:

```javascript
export async function notifyHalilPlanReady(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return;

  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;

  const { rows: assignments } = await pool.query(
    `SELECT pa.worker_id, w.name AS worker_name, p.address, p.city, pa.task_name
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY w.name, pa.assignment_order`,
    [planId]
  );

  // Group by worker, count tasks
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_name)) {
      byWorker.set(a.worker_name, { properties: new Set(), taskCount: 0 });
    }
    const w = byWorker.get(a.worker_name);
    w.properties.add(`${a.address}, ${a.city}`);
    w.taskCount++;
  }

  // Get unassigned from plan
  const full = await getPlanWithAssignments(planId);
  const unassigned = full.unassigned_properties || [];

  const dayLabel = formatDateLabel(dateStr);
  let msg = `Tagesplan fuer ${dayLabel}:\n\n`;
  for (const [name, data] of byWorker) {
    const propList = [...data.properties].join(', ');
    msg += `${name}: ${propList} (${data.taskCount} Aufgaben)\n`;
  }

  if (unassigned.length > 0) {
    msg += `\n⚠ ${unassigned.length} Objekte ohne Zuordnung:\n`;
    msg += unassigned.map(p => `  - ${p.address}, ${p.city}`).join('\n');
    msg += '\n';
  }

  msg += `\n${assignments.length} Aufgaben, ${byWorker.size} Mitarbeiter`;

  await sendWhatsAppButtons(
    config.halilWhatsappNumber,
    msg,
    [
      { id: `plan_approve_${planId}`, title: 'Genehmigen' },
      { id: `plan_edit_${planId}`, title: 'Bearbeiten' },
    ]
  );
}
```

- [ ] **Step 4: Update notifyWorkersOfRedistribution to use task_name**

Replace `notifyWorkersOfRedistribution` (lines 141-169) with:

```javascript
export async function notifyWorkersOfRedistribution(details) {
  const byWorker = new Map();
  for (const d of details) {
    if (!byWorker.has(d.newWorkerId)) {
      byWorker.set(d.newWorkerId, { phone: d.newWorkerPhone, name: d.newWorkerName, properties: new Map() });
    }
  }

  for (const d of details) {
    const { rows: [prop] } = await pool.query(
      'SELECT address, city FROM properties WHERE id = $1',
      [d.propertyId]
    );
    if (!prop) continue;

    const worker = byWorker.get(d.newWorkerId);
    if (!worker.properties.has(d.propertyId)) {
      worker.properties.set(d.propertyId, { address: prop.address, city: prop.city, tasks: [] });
    }
    // Get task names for this property from the current assignment
    const { rows: tasks } = await pool.query(
      `SELECT task_name FROM plan_assignments
       WHERE property_id = $1 AND worker_id = $2
       AND daily_plan_id = (SELECT id FROM daily_plans WHERE plan_date = CURRENT_DATE LIMIT 1)`,
      [d.propertyId, d.newWorkerId]
    );
    for (const t of tasks) {
      worker.properties.get(d.propertyId).tasks.push(t.task_name);
    }
  }

  for (const [, worker] of byWorker) {
    const lines = [];
    let i = 1;
    for (const [, prop] of worker.properties) {
      const taskList = prop.tasks.length > 0 ? prop.tasks.join(', ') : 'Alle Aufgaben';
      lines.push(`${i}. ${prop.address}, ${prop.city} — ${taskList}`);
      i++;
    }
    const msg = `Zusaetzliche Aufgaben fuer heute:\n\n${lines.join('\n')}\n\nDruecke "Angekommen" wenn du vor Ort bist.`;
    await sendWhatsAppButtons(worker.phone, msg, [{ id: 'angekommen', title: 'Angekommen' }]);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/services/planNotifications.js
git commit -m "feat: update plan notifications to use task_name instead of standard_tasks"
```

---

### Task 7: Update Command Center

**Files:**
- Modify: `src/services/commandCenter.js` — count tasks instead of properties, include joker workers

- [ ] **Step 1: Update computeStatsSummary**

In `src/services/commandCenter.js`, replace `computeStatsSummary` (lines 39-62) with:

```javascript
export function computeStatsSummary(workers, alerts, garbageCount) {
  let tasksCompleted = 0;
  let tasksInProgress = 0;
  let tasksRemaining = 0;

  for (const w of workers) {
    for (const a of w.assignments) {
      if (a.status === 'done' || a.status === 'completed') tasksCompleted++;
      else if (a.status === 'in_progress') tasksInProgress++;
      else if (a.status === 'pending') tasksRemaining++;
    }
  }

  return {
    workersActive: workers.filter(w => w.status !== 'not_started').length,
    workersTotal: workers.length,
    tasksCompleted,
    tasksInProgress,
    tasksRemaining,
    tasksTotal: tasksCompleted + tasksInProgress + tasksRemaining,
    alertCount: alerts.length,
    garbageCount,
  };
}
```

- [ ] **Step 2: Update getAssignmentsWithDetails**

Replace `getAssignmentsWithDetails` (lines 140-155) to include `task_name` and `worker_role`:

```javascript
async function getAssignmentsWithDetails(planId) {
  const { rows } = await pool.query(
    `SELECT
       pa.id AS assignment_id, pa.worker_id, pa.property_id,
       pa.assignment_order, pa.source, pa.status AS assignment_status,
       pa.task_name, pa.worker_role AS task_role,
       w.name AS worker_name, w.phone_number,
       p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );
  return rows;
}
```

- [ ] **Step 3: Update getTimeEntries to include joker workers**

Replace `getTimeEntries` (lines 157-166) with:

```javascript
async function getTimeEntries(dateStr) {
  const { rows } = await pool.query(
    `SELECT te.worker_id, te.check_in, te.check_out, te.is_flagged, te.flag_reason
     FROM time_entries te
     JOIN workers w ON w.id = te.worker_id
     WHERE te.date = $1 AND w.worker_role IN ('field', 'cleaning', 'joker')`,
    [dateStr]
  );
  return rows;
}
```

- [ ] **Step 4: Update deriveWorkerStatus for new statuses**

Replace `deriveWorkerStatus` (lines 14-20) with:

```javascript
export function deriveWorkerStatus(timeEntry, assignments) {
  if (!timeEntry || !timeEntry.check_in) return 'not_started';
  if (timeEntry.check_out) return 'done';
  if (assignments.length > 0 && assignments.every(a => a.status === 'done' || a.status === 'completed')) return 'done';
  if (assignments.some(a => a.status === 'in_progress')) return 'working';
  return 'checked_in';
}
```

- [ ] **Step 5: Update worker assignment mapping in getCommandCenterData**

In `getCommandCenterData`, update the assignment object shape (around line 107-117) to include task data:

```javascript
    workerMap.get(row.worker_id).assignments.push({
      id: row.assignment_id,
      propertyId: row.property_id,
      address: row.address,
      city: row.city,
      taskName: row.task_name,
      taskRole: row.task_role,
      assignmentOrder: row.assignment_order,
      source: row.source,
      status: row.assignment_status,
    });
```

- [ ] **Step 6: Run existing command center tests if any**

Run: `npx vitest run 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/services/commandCenter.js
git commit -m "feat: update Command Center to track tasks instead of properties"
```

---

### Task 8: API Endpoint for Postpone

**Files:**
- Create: `api/_handlers/plan-assignments/[id]/postpone.js`
- Modify: `api/index.js` — add route

- [ ] **Step 1: Create postpone handler**

Create `api/_handlers/plan-assignments/[id]/postpone.js`:

```javascript
import { checkAuth } from '../../../_utils/auth.js';
import { withErrorHandler } from '../../../_utils/handler.js';
import { postponePlanTask } from '../../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { reason, new_date } = req.body;
  if (!reason || !new_date) {
    return res.status(400).json({ error: 'reason and new_date are required' });
  }

  const result = await postponePlanTask(parseInt(id, 10), reason, new_date);
  return res.json(result);
});
```

- [ ] **Step 2: Register route in api/index.js**

Add import at top:
```javascript
import planAssignmentsPostponeHandler from './_handlers/plan-assignments/[id]/postpone.js';
```

Add to `dynamicRoutes` array (before the existing `plan-assignments/:id` entry):
```javascript
[/^plan-assignments\/([^/]+)\/postpone$/, planAssignmentsPostponeHandler, { id: 1 }],
```

- [ ] **Step 3: Add status update endpoint for plan assignments**

In `api/_handlers/plan-assignments/[id].js`, add PUT support for status updates:

```javascript
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { reassignPlanAssignment } from '../../../src/services/planGeneration.js';
import { pool } from '../../../src/db/pool.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'PUT') {
    const { worker_id, status } = req.body;

    // Status update
    if (status) {
      const { rows: [updated] } = await pool.query(
        `UPDATE plan_assignments SET status = $1, completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE completed_at END
         WHERE id = $2 RETURNING *`,
        [status, parseInt(id, 10)]
      );
      if (!updated) return res.status(404).json({ error: 'Assignment not found' });
      return res.json(updated);
    }

    // Worker reassignment
    if (worker_id) {
      const assignment = await reassignPlanAssignment(parseInt(id, 10), worker_id);
      return res.json(assignment);
    }

    return res.status(400).json({ error: 'worker_id or status is required' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
```

- [ ] **Step 4: Commit**

```bash
git add api/_handlers/plan-assignments/ api/index.js
git commit -m "feat: add postpone and status update endpoints for plan assignments"
```

---

### Task 9: Translations

**Files:**
- Modify: `client/src/i18n/translations.js`

- [ ] **Step 1: Add German translation keys**

Add to the `de` section (under the `plan` namespace, replacing/extending existing keys):

```javascript
'ops.title': 'Tagesbetrieb',
'ops.generate': 'Plan erstellen',
'ops.generating': 'Erstelle...',
'ops.approve': 'Genehmigen',
'ops.approving': 'Genehmige...',
'ops.status.draft': 'Entwurf',
'ops.status.approved': 'Genehmigt',
'ops.status.autoApproved': 'Auto-genehmigt',
'ops.approvedAt': 'Genehmigt um',
'ops.unassigned': 'Nicht zugewiesen',
'ops.carriedOver': 'Uebertragen',
'ops.carriedFrom': 'von',
'ops.withPartner': 'mit',
'ops.reassign': 'Umverteilen',
'ops.selectWorker': 'Mitarbeiter waehlen',
'ops.postpone': 'Verschieben',
'ops.postponeReason': 'Grund fuer Verschiebung:',
'ops.postponeDate': 'Neues Datum:',
'ops.tasks': 'Aufgaben',
'ops.noplan': 'Kein Plan fuer diesen Tag',
'ops.autoMode': 'Auto-Modus',
'ops.settings': 'Einstellungen',
'nav.dailyOperations': 'Tagesbetrieb',
```

- [ ] **Step 2: Add English translation keys**

Add to the `en` section:

```javascript
'ops.title': 'Daily Operations',
'ops.generate': 'Generate Plan',
'ops.generating': 'Generating...',
'ops.approve': 'Approve',
'ops.approving': 'Approving...',
'ops.status.draft': 'Draft',
'ops.status.approved': 'Approved',
'ops.status.autoApproved': 'Auto-approved',
'ops.approvedAt': 'Approved at',
'ops.unassigned': 'Unassigned',
'ops.carriedOver': 'Carried Over',
'ops.carriedFrom': 'from',
'ops.withPartner': 'with',
'ops.reassign': 'Reassign',
'ops.selectWorker': 'Select worker',
'ops.postpone': 'Postpone',
'ops.postponeReason': 'Reason for postponement:',
'ops.postponeDate': 'New date:',
'ops.tasks': 'Tasks',
'ops.noplan': 'No plan for this day',
'ops.autoMode': 'Auto Mode',
'ops.settings': 'Settings',
'nav.dailyOperations': 'Daily Operations',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add translation keys for unified daily operations"
```

---

### Task 10: DailyOperations Page

**Files:**
- Create: `client/src/pages/DailyOperations.jsx`

- [ ] **Step 1: Create the page component**

Create `client/src/pages/DailyOperations.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const STATUS_ICON = {
  pending: '☐',
  in_progress: '◷',
  done: '✓',
  postponed: '⏸',
  carried_over: '↩',
};

const STATUS_COLOR = {
  pending: 'var(--text-muted)',
  in_progress: 'var(--info)',
  done: 'var(--success)',
  postponed: 'var(--warning)',
  carried_over: 'var(--warning)',
};

export default function DailyOperations() {
  const { t } = useLang();
  const [date, setDate] = useState(todayStr());
  const [plan, setPlan] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(null);

  useEffect(() => { loadPlan(); loadWorkers(); }, [date]);

  async function loadPlan() {
    setLoading(true);
    setError('');
    try {
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
      setWorkers(data.filter(w => w.is_active !== false && ['field', 'cleaning', 'joker'].includes(w.worker_role)));
    } catch {}
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

  async function handlePostpone(assignmentId) {
    const reason = prompt(t('ops.postponeReason'));
    if (reason === null) return;
    const newDate = prompt(t('ops.postponeDate'), shiftDate(date, 1));
    if (!newDate) return;
    try {
      setError('');
      await api.put(`/plan-assignments/${assignmentId}/postpone`, { reason, new_date: newDate });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(assignmentId, newStatus) {
    try {
      setError('');
      await api.put(`/plan-assignments/${assignmentId}`, { status: newStatus });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  // Group assignments by worker, then by property
  const byWorker = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!byWorker.has(a.worker_id)) {
        byWorker.set(a.worker_id, { name: a.worker_name, properties: new Map() });
      }
      const worker = byWorker.get(a.worker_id);
      if (!worker.properties.has(a.property_id)) {
        worker.properties.set(a.property_id, { address: a.address, city: a.city, assignments: [] });
      }
      worker.properties.get(a.property_id).assignments.push(a);
    }
  }

  // Find partner names per property
  const partnersByProperty = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!partnersByProperty.has(a.property_id)) {
        partnersByProperty.set(a.property_id, new Map());
      }
      partnersByProperty.get(a.property_id).set(a.worker_id, a.worker_name);
    }
  }

  // Carried-over assignments
  const carriedOver = plan?.assignments?.filter(a => a.carried_from_id) || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>{t('ops.title')}</h1>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>←</button>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>→</button>

          {!plan && !loading && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? t('ops.generating') : t('ops.generate')}
            </button>
          )}
          {plan && plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
              {approving ? t('ops.approving') : t('ops.approve')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md">{error}</div>}

      {plan && (
        <div className="flex items-center gap-sm mb-md">
          <span className={`badge ${plan.status === 'draft' ? 'badge-warning' : 'badge-success'}`}>
            {plan.auto_approved ? t('ops.status.autoApproved') : t(`ops.status.${plan.status}`)}
          </span>
          {plan.approved_at && (
            <span className="text-muted text-sm">
              {t('ops.approvedAt')}: {new Date(plan.approved_at).toLocaleString('de-DE')}
            </span>
          )}
        </div>
      )}

      {loading && <div className="text-muted">...</div>}

      {!loading && !plan && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="empty-state-text">{t('ops.noplan')}</div>
        </div>
      )}

      {plan && (
        <div className="stagger-children">
          {[...byWorker.entries()].map(([workerId, worker]) => (
            <div key={workerId} className="card mb-md">
              <div className="card-header">
                <h3 className="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  {' '}{worker.name}
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {[...worker.properties.entries()].map(([propId, prop]) => {
                  const partners = partnersByProperty.get(propId);
                  const partnerNames = partners
                    ? [...partners.entries()].filter(([id]) => id !== workerId).map(([, name]) => name)
                    : [];

                  return (
                    <div key={propId} className="mb-md">
                      <div className="flex items-center gap-sm mb-xs">
                        <strong>{prop.address}, {prop.city}</strong>
                        {partnerNames.length > 0 && (
                          <span className="text-muted text-sm">{t('ops.withPartner')} {partnerNames.join(', ')}</span>
                        )}
                      </div>
                      {prop.assignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between mb-xs"
                          style={{ padding: 'var(--space-xs) var(--space-sm)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                          <div className="flex items-center gap-sm">
                            <span style={{ color: STATUS_COLOR[a.status] }}>{STATUS_ICON[a.status]}</span>
                            <span>{a.task_name}</span>
                            {a.carried_from_id && <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>↩</span>}
                          </div>
                          <div className="flex items-center gap-xs">
                            {a.status === 'pending' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'in_progress')}>▶</button>
                            )}
                            {a.status === 'in_progress' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'done')}>✓</button>
                            )}
                            {(a.status === 'pending' || a.status === 'in_progress') && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handlePostpone(a.id)}>{t('ops.postpone')}</button>
                            )}
                            {plan.status === 'draft' && (
                              reassigning === a.id ? (
                                <select className="select" style={{ width: 'auto', fontSize: '0.8rem' }}
                                  onChange={e => { if (e.target.value) handleReassign(a.id, e.target.value); else setReassigning(null); }}
                                  defaultValue="" autoFocus onBlur={() => setReassigning(null)}>
                                  <option value="">{t('ops.selectWorker')}</option>
                                  {workers.filter(w => w.id !== workerId).map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button className="btn btn-sm btn-ghost" onClick={() => setReassigning(a.id)}>
                                  {t('ops.reassign')}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {plan.unassigned_properties && plan.unassigned_properties.length > 0 && (
            <div className="card mb-md" style={{ borderColor: 'var(--danger)' }}>
              <div className="card-header">
                <h3 className="card-title text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  {' '}{t('ops.unassigned')} ({plan.unassigned_properties.length})
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {plan.unassigned_properties.map(p => (
                  <div key={p.id} className="flex items-center justify-between mb-sm"
                    style={{ padding: 'var(--space-sm)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>{p.address}, {p.city}</strong>
                    <span className="text-danger text-sm">{t('ops.unassigned')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/DailyOperations.jsx
git commit -m "feat: add DailyOperations page replacing DailyPlan and DailyTasks"
```

---

### Task 11: Navigation and Routing

**Files:**
- Modify: `client/src/App.jsx` — replace routes
- Modify: `client/src/components/Layout.jsx` — replace nav items

- [ ] **Step 1: Update App.jsx**

Replace the DailyTasks and DailyPlan imports and routes:

Remove these imports:
```javascript
import DailyTasks from './pages/DailyTasks';
import DailyPlan from './pages/DailyPlan';
```

Add this import:
```javascript
import DailyOperations from './pages/DailyOperations';
```

Replace these routes:
```jsx
<Route path="daily-tasks" element={<DailyTasks />} />
<Route path="daily-plan" element={<DailyPlan />} />
```

With:
```jsx
<Route path="daily-operations" element={<DailyOperations />} />
```

- [ ] **Step 2: Update Layout.jsx navigation**

In `client/src/components/Layout.jsx`, in the `operations` section, replace the `daily-plan` and `daily-tasks` items (lines 54-61) with a single entry:

```javascript
{
  path: '/daily-operations', label: t('nav.dailyOperations'),
  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>,
},
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: replace daily-plan and daily-tasks routes with unified daily-operations"
```

---

### Task 12: Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 2: Build frontend**

Run: `cd client && npx vite build 2>&1 | tail -10`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify migration was applied**

Use `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'plan_assignments' AND column_name IN ('task_name', 'worker_role', 'postpone_reason', 'carried_from_id');
```

Expected: All 4 columns present.

- [ ] **Step 4: Verify joker role exists**

Use `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT unnest(enum_range(NULL::worker_role));
```

Expected: `field`, `cleaning`, `office`, `joker`.

- [ ] **Step 5: Verify evening cron registered**

Check `vercel.json` contains `cron/evening` entry.

- [ ] **Step 6: Final commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: address verification issues"
```
