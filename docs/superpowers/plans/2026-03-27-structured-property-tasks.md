# Structured Property Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `standard_tasks` field with a `property_tasks` table so each property has individually scheduled, role-assigned tasks.

**Architecture:** New `property_tasks` table linked to `properties`. The `generateDailyTasks` service reads from `property_tasks` (supporting `property_default`, `weekly`, `biweekly`, `monthly` schedule types) and writes one `task_assignment` per matching task. The PropertyForm gets an inline task list that submits tasks alongside the property. Existing `standard_tasks` data is migrated via a SQL migration.

**Tech Stack:** PostgreSQL (Supabase), Node.js/Express API, React 19, Vite, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `src/db/migrations/010-property-tasks.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 010-property-tasks.sql
-- Create property_tasks table and migrate existing standard_tasks data.

-- Step 1: Create property_tasks table
CREATE TABLE property_tasks (
  id                  SERIAL PRIMARY KEY,
  property_id         INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  task_name           VARCHAR(255) NOT NULL,
  worker_role         VARCHAR(20) NOT NULL CHECK (worker_role IN ('field', 'cleaning', 'office')),
  schedule_type       VARCHAR(20) NOT NULL DEFAULT 'property_default'
                      CHECK (schedule_type IN ('property_default', 'weekly', 'biweekly', 'monthly')),
  schedule_day        INTEGER,
  biweekly_start_date DATE,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_tasks_property ON property_tasks(property_id);

-- Step 2: Add worker_role column to task_assignments
ALTER TABLE task_assignments ADD COLUMN worker_role VARCHAR(20) DEFAULT 'field';

-- Step 3: Migrate existing standard_tasks data
-- Helper function to split standard_tasks into individual rows
DO $$
DECLARE
  prop RECORD;
  task_text TEXT;
  tasks TEXT[];
BEGIN
  FOR prop IN SELECT id, standard_tasks FROM properties WHERE standard_tasks IS NOT NULL AND standard_tasks != '' AND is_active = true
  LOOP
    task_text := prop.standard_tasks;

    -- Skip notes (not actual tasks)
    IF task_text ~* '^start ' THEN
      CONTINUE;
    END IF;

    -- Expand "alles" keyword
    IF task_text ~* '^alles' THEN
      -- Insert the 3 base tasks
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES
        (prop.id, 'Treppenhausreinigung', 'field', 'property_default'),
        (prop.id, 'Außenanlage', 'field', 'property_default'),
        (prop.id, 'Mülltonnen', 'field', 'property_default');

      -- Check for extra items after "alles, "
      IF task_text ~* '^alles\s*,' THEN
        -- Get everything after "alles, "
        task_text := regexp_replace(task_text, '^\s*alles\s*,\s*', '', 'i');
        -- Split remaining by comma and insert each
        tasks := string_to_array(task_text, ',');
        FOR i IN 1..array_length(tasks, 1) LOOP
          INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
          VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
        END LOOP;
      END IF;

    -- "Außenanlagen und Müll"
    ELSIF task_text ~* 'Außenanlagen und Müll' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES
        (prop.id, 'Außenanlage', 'field', 'property_default'),
        (prop.id, 'Mülltonnen', 'field', 'property_default');

    -- "nur Tonnendienst"
    ELSIF task_text ~* 'nur Tonnendienst' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES (prop.id, 'Mülltonnen', 'field', 'property_default');

    -- "TH reinigen" variants (may have comma-separated extras)
    ELSIF task_text ~* '^TH reinigen' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES (prop.id, 'Treppenhausreinigung', 'field', 'property_default');

      -- Check for extras after "TH reinigen, "
      IF task_text ~* '^TH reinigen\s*,' THEN
        task_text := regexp_replace(task_text, '^\s*TH reinigen\s*,\s*', '', 'i');
        tasks := string_to_array(task_text, ',');
        FOR i IN 1..array_length(tasks, 1) LOOP
          INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
          VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
        END LOOP;
      END IF;

    -- Fallback: comma-split any other value
    ELSE
      tasks := string_to_array(task_text, ',');
      FOR i IN 1..array_length(tasks, 1) LOOP
        INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
        VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
      END LOOP;
    END IF;
  END LOOP;
END $$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run the migration SQL against the Supabase project `uytcfocsegoixdaiwhmb` using the `mcp__plugin_supabase_supabase__apply_migration` tool with name `010-property-tasks`.

- [ ] **Step 3: Verify the migration**

Run verification queries via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
-- Check table exists and has rows
SELECT count(*) AS task_count FROM property_tasks;

-- Check a known property — "alles" should have 3 tasks
SELECT pt.task_name, pt.worker_role, pt.schedule_type
FROM property_tasks pt
JOIN properties p ON p.id = pt.property_id
WHERE p.standard_tasks = 'alles'
LIMIT 10;

-- Check task_assignments has the new column
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'task_assignments' AND column_name = 'worker_role';
```

Expected: task_count > 0, "alles" properties have exactly 3 tasks (Treppenhausreinigung, Außenanlage, Mülltonnen), worker_role column exists on task_assignments.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/010-property-tasks.sql
git commit -m "feat: add property_tasks table and migrate standard_tasks data"
```

---

### Task 2: Test Helper

**Files:**
- Modify: `tests/helpers.js`

- [ ] **Step 1: Add `createTestPropertyTask` helper**

Add after the `createTestProperty` function (after line 69):

```javascript
export async function createTestPropertyTask(propertyId, overrides = {}) {
  const defaults = {
    task_name: 'Treppenhausreinigung',
    worker_role: 'field',
    schedule_type: 'property_default',
    schedule_day: null,
    biweekly_start_date: null,
    is_active: true,
  };
  const t = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [propertyId, t.task_name, t.worker_role, t.schedule_type, t.schedule_day, t.biweekly_start_date, t.is_active]
  );
  return result.rows[0];
}
```

- [ ] **Step 2: Add `property_tasks` to `cleanDb`**

In the `cleanDb` function, add `DELETE FROM property_tasks;` before `DELETE FROM properties;` (line 25):

```javascript
export async function cleanDb() {
  await pool.query(`
    DELETE FROM analytics_property_monthly;
    DELETE FROM analytics_daily;
    DELETE FROM property_visit_photos;
    DELETE FROM property_visits;
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
    DELETE FROM property_tasks;
    DELETE FROM properties;
    DELETE FROM monthly_reports;
    DELETE FROM sick_leave;
    DELETE FROM time_entries;
    DELETE FROM vacation_balances;
    DELETE FROM workers;
  `);
}
```

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.js
git commit -m "test: add createTestPropertyTask helper and clean property_tasks in cleanDb"
```

---

### Task 3: Task Scheduling — New Schedule Functions (Pure + Tests)

**Files:**
- Modify: `src/services/taskScheduling.js`
- Modify: `tests/services/taskScheduling.test.js`

- [ ] **Step 1: Write failing tests for the new schedule-checking functions**

Add to `tests/services/taskScheduling.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  getWeekday,
  shouldCarryOver,
  formatTaskList,
  shouldTaskRunOnDate,
} from '../../src/services/taskScheduling.js';

// ... existing tests stay unchanged ...

describe('shouldTaskRunOnDate', () => {
  // property_default: matches when date's weekday === property's assigned_weekday
  it('returns true for property_default when weekday matches', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: 1 }; // Monday
    expect(shouldTaskRunOnDate(task, property, '2026-03-23')).toBe(true); // Monday
  });

  it('returns false for property_default when weekday does not match', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: 1 }; // Monday
    expect(shouldTaskRunOnDate(task, property, '2026-03-24')).toBe(false); // Tuesday
  });

  it('returns false for property_default when property has no assigned_weekday', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: null };
    expect(shouldTaskRunOnDate(task, property, '2026-03-23')).toBe(false);
  });

  // weekly: matches when date's weekday === task.schedule_day
  it('returns true for weekly when weekday matches schedule_day', () => {
    const task = { schedule_type: 'weekly', schedule_day: 3 }; // Wednesday
    expect(shouldTaskRunOnDate(task, {}, '2026-03-25')).toBe(true); // Wednesday
  });

  it('returns false for weekly when weekday does not match', () => {
    const task = { schedule_type: 'weekly', schedule_day: 3 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-23')).toBe(false); // Monday
  });

  // biweekly: matches weekday AND even week count since start date
  it('returns true for biweekly on the start week', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1, // Monday
      biweekly_start_date: '2026-03-23', // Monday
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-23')).toBe(true); // same Monday
  });

  it('returns false for biweekly on the off-week', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1,
      biweekly_start_date: '2026-03-23',
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-30')).toBe(false); // 1 week later
  });

  it('returns true for biweekly two weeks after start', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1,
      biweekly_start_date: '2026-03-23',
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-04-06')).toBe(true); // 2 weeks later
  });

  // monthly: matches when date's day-of-month === task.schedule_day
  it('returns true for monthly when day-of-month matches', () => {
    const task = { schedule_type: 'monthly', schedule_day: 15 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-15')).toBe(true);
  });

  it('returns false for monthly when day-of-month does not match', () => {
    const task = { schedule_type: 'monthly', schedule_day: 15 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-16')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice" && npx vitest run tests/services/taskScheduling.test.js`

Expected: FAIL — `shouldTaskRunOnDate` is not exported.

- [ ] **Step 3: Implement `shouldTaskRunOnDate`**

Add to `src/services/taskScheduling.js` after the `formatTaskList` function (after line 30), before the `// --- DB functions ---` comment:

```javascript
export function shouldTaskRunOnDate(task, property, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const weekday = d.getDay();

  switch (task.schedule_type) {
    case 'property_default':
      return property.assigned_weekday !== null &&
             property.assigned_weekday !== undefined &&
             weekday === property.assigned_weekday;

    case 'weekly':
      return weekday === task.schedule_day;

    case 'biweekly': {
      if (weekday !== task.schedule_day) return false;
      const start = new Date(task.biweekly_start_date);
      const diffMs = d.getTime() - start.getTime();
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks % 2 === 0;
    }

    case 'monthly':
      return day === task.schedule_day;

    default:
      return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice" && npx vitest run tests/services/taskScheduling.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/taskScheduling.js tests/services/taskScheduling.test.js
git commit -m "feat: add shouldTaskRunOnDate for schedule-aware task generation"
```

---

### Task 4: Task Scheduling — Rewrite `generateDailyTasks`

**Files:**
- Modify: `src/services/taskScheduling.js`

- [ ] **Step 1: Rewrite `generateDailyTasks` to use `property_tasks`**

Replace the existing `generateDailyTasks` function (lines 34-62) with:

```javascript
export async function generateDailyTasks(dateStr) {
  // Fetch all active properties with their active tasks
  const { rows: properties } = await pool.query(
    `SELECT p.id, p.assigned_weekday,
            pt.id AS task_id, pt.task_name, pt.worker_role,
            pt.schedule_type, pt.schedule_day, pt.biweekly_start_date
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`
  );

  const created = [];
  for (const row of properties) {
    const property = { assigned_weekday: row.assigned_weekday };
    const task = {
      schedule_type: row.schedule_type,
      schedule_day: row.schedule_day,
      biweekly_start_date: row.biweekly_start_date,
    };

    if (!shouldTaskRunOnDate(task, property, dateStr)) continue;

    // Duplicate check: same property + date + task_description
    const { rowCount } = await pool.query(
      `SELECT 1 FROM task_assignments
       WHERE property_id = $1 AND date = $2 AND task_description = $3`,
      [row.id, dateStr, row.task_name]
    );
    if (rowCount > 0) continue;

    const { rows } = await pool.query(
      `INSERT INTO task_assignments (property_id, date, task_description, worker_role, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [row.id, dateStr, row.task_name, row.worker_role]
    );
    created.push(rows[0]);
  }

  // Generate garbage tasks for the day
  const garbageTasks = await generateGarbageTasks(dateStr);
  return [...created, ...garbageTasks.map(gt => ({ ...gt, is_garbage: true }))];
}
```

- [ ] **Step 2: Verify build**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice" && npx vitest run tests/services/taskScheduling.test.js`

Expected: All existing tests still pass (pure function tests don't hit the DB).

- [ ] **Step 3: Commit**

```bash
git add src/services/taskScheduling.js
git commit -m "feat: rewrite generateDailyTasks to read from property_tasks table"
```

---

### Task 5: Properties API — GET with Tasks

**Files:**
- Modify: `api/_handlers/properties/index.js`
- Modify: `api/_handlers/properties/[id].js`

- [ ] **Step 1: Update GET /properties to include tasks**

Replace the GET handler in `api/_handlers/properties/index.js` (lines 8-13):

```javascript
  if (req.method === 'GET') {
    const { rows: properties } = await pool.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
    );
    const { rows: tasks } = await pool.query(
      `SELECT * FROM property_tasks WHERE property_id = ANY($1) AND is_active = true ORDER BY id`,
      [properties.map(p => p.id)]
    );
    const tasksByProperty = {};
    for (const t of tasks) {
      if (!tasksByProperty[t.property_id]) tasksByProperty[t.property_id] = [];
      tasksByProperty[t.property_id].push(t);
    }
    const result = properties.map(p => ({
      ...p,
      tasks: tasksByProperty[p.id] || [],
    }));
    return res.json(result);
  }
```

- [ ] **Step 2: Update GET /properties/:id to include tasks**

Replace the GET handler in `api/_handlers/properties/[id].js` (lines 9-13):

```javascript
  if (req.method === 'GET') {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    const { rows: tasks } = await pool.query(
      'SELECT * FROM property_tasks WHERE property_id = $1 AND is_active = true ORDER BY id',
      [id]
    );
    return res.json({ ...result.rows[0], tasks });
  }
```

- [ ] **Step 3: Commit**

```bash
git add api/_handlers/properties/index.js api/_handlers/properties/[id].js
git commit -m "feat: return property_tasks in GET /properties and GET /properties/:id"
```

---

### Task 6: Properties API — POST with Tasks

**Files:**
- Modify: `api/_handlers/properties/index.js`

- [ ] **Step 1: Update POST /properties to accept and insert tasks**

Replace the POST handler in `api/_handlers/properties/index.js` (lines 15-35):

```javascript
  if (req.method === 'POST') {
    const { address, city, standard_tasks, assigned_weekday, tasks } = req.body;

    if (!address || !city) {
      return res.status(400).json({ error: 'address and city are required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [address, city, standard_tasks || '', assigned_weekday ?? null]
      );
      const property = result.rows[0];

      // Insert tasks if provided
      const insertedTasks = [];
      if (tasks && Array.isArray(tasks)) {
        for (const t of tasks) {
          if (!t.task_name || !t.task_name.trim()) continue;
          const { rows } = await pool.query(
            `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
              property.id,
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
            ]
          );
          insertedTasks.push(rows[0]);
        }
      }

      return res.status(201).json({ ...property, tasks: insertedTasks });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Property with this address already exists' });
      }
      throw err;
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add api/_handlers/properties/index.js
git commit -m "feat: accept tasks array in POST /properties"
```

---

### Task 7: Properties API — PUT with Task Sync

**Files:**
- Modify: `api/_handlers/properties/[id].js`

- [ ] **Step 1: Update PUT /properties/:id to sync tasks**

Replace the PUT handler in `api/_handlers/properties/[id].js` (lines 15-41):

```javascript
  if (req.method === 'PUT') {
    const fields = ['address', 'city', 'standard_tasks', 'assigned_weekday', 'photo_required'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0 && !req.body.tasks) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let property;
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(id);
      const result = await pool.query(
        `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
      property = result.rows[0];
    } else {
      const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
      property = result.rows[0];
    }

    // Sync tasks if provided
    if (req.body.tasks && Array.isArray(req.body.tasks)) {
      const incomingTasks = req.body.tasks;
      const incomingIds = incomingTasks.filter(t => t.id).map(t => t.id);

      // Deactivate tasks not in the incoming list
      if (incomingIds.length > 0) {
        await pool.query(
          `UPDATE property_tasks SET is_active = false
           WHERE property_id = $1 AND is_active = true AND id != ALL($2)`,
          [id, incomingIds]
        );
      } else {
        await pool.query(
          `UPDATE property_tasks SET is_active = false
           WHERE property_id = $1 AND is_active = true`,
          [id]
        );
      }

      // Update existing and insert new
      for (const t of incomingTasks) {
        if (!t.task_name || !t.task_name.trim()) continue;

        if (t.id) {
          // Update existing task
          await pool.query(
            `UPDATE property_tasks
             SET task_name = $1, worker_role = $2, schedule_type = $3,
                 schedule_day = $4, biweekly_start_date = $5, is_active = true
             WHERE id = $6 AND property_id = $7`,
            [
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
              t.id,
              id,
            ]
          );
        } else {
          // Insert new task
          await pool.query(
            `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
            ]
          );
        }
      }
    }

    // Return property with current tasks
    const { rows: tasks } = await pool.query(
      'SELECT * FROM property_tasks WHERE property_id = $1 AND is_active = true ORDER BY id',
      [id]
    );
    return res.json({ ...property, tasks });
  }
```

- [ ] **Step 2: Commit**

```bash
git add api/_handlers/properties/[id].js
git commit -m "feat: sync property_tasks on PUT /properties/:id"
```

---

### Task 8: Translations

**Files:**
- Modify: `client/src/i18n/translations.js`

- [ ] **Step 1: Add German translations for property tasks**

Add after the existing `'properties.sunday': 'Sonntag',` line (line 187) in the `de` section:

```javascript
    'properties.addTask': 'Aufgabe hinzufuegen',
    'properties.taskName': 'Aufgabe',
    'properties.schedule': 'Zeitplan',
    'properties.scheduleDefault': 'Objekt-Tag',
    'properties.scheduleWeekly': 'Woechentlich',
    'properties.scheduleBiweekly': 'Alle 2 Wochen',
    'properties.scheduleMonthly': 'Monatlich',
    'properties.scheduleDay': 'Tag',
    'properties.biweeklyStart': 'Startdatum',
    'properties.dayOfMonth': 'Tag des Monats',
    'properties.taskCount': 'Aufgaben',
    'properties.role': 'Rolle',
```

- [ ] **Step 2: Add English translations for property tasks**

Add after the existing `'properties.sunday': 'Sunday',` line in the `en` section:

```javascript
    'properties.addTask': 'Add Task',
    'properties.taskName': 'Task',
    'properties.schedule': 'Schedule',
    'properties.scheduleDefault': 'Property Default',
    'properties.scheduleWeekly': 'Weekly',
    'properties.scheduleBiweekly': 'Every 2 Weeks',
    'properties.scheduleMonthly': 'Monthly',
    'properties.scheduleDay': 'Day',
    'properties.biweeklyStart': 'Start Date',
    'properties.dayOfMonth': 'Day of Month',
    'properties.taskCount': 'Tasks',
    'properties.role': 'Role',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add translation keys for property tasks UI"
```

---

### Task 9: PropertyForm — Inline Task List

**Files:**
- Modify: `client/src/components/PropertyForm.jsx`

- [ ] **Step 1: Rewrite PropertyForm with inline task list**

Replace the entire contents of `client/src/components/PropertyForm.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';

const EMPTY_TASK = { task_name: '', worker_role: 'field', schedule_type: 'property_default', schedule_day: '', biweekly_start_date: '' };

const WEEKDAY_OPTIONS = [
  { value: '0', labelKey: 'properties.sunday' },
  { value: '1', labelKey: 'properties.monday' },
  { value: '2', labelKey: 'properties.tuesday' },
  { value: '3', labelKey: 'properties.wednesday' },
  { value: '4', labelKey: 'properties.thursday' },
  { value: '5', labelKey: 'properties.friday' },
  { value: '6', labelKey: 'properties.saturday' },
];

export default function PropertyForm({ property, onSubmit, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (property) {
      setForm({
        address: property.address || '',
        city: property.city || '',
        standard_tasks: property.standard_tasks || '',
        assigned_weekday: property.assigned_weekday !== null && property.assigned_weekday !== undefined ? String(property.assigned_weekday) : '',
      });
      setTasks(
        (property.tasks || []).map(t => ({
          id: t.id,
          task_name: t.task_name || '',
          worker_role: t.worker_role || 'field',
          schedule_type: t.schedule_type || 'property_default',
          schedule_day: t.schedule_day !== null && t.schedule_day !== undefined ? String(t.schedule_day) : '',
          biweekly_start_date: t.biweekly_start_date || '',
        }))
      );
    } else {
      setForm({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });
      setTasks([]);
    }
  }, [property]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const submittedTasks = tasks
      .filter(t => t.task_name.trim())
      .map(t => ({
        ...(t.id ? { id: t.id } : {}),
        task_name: t.task_name.trim(),
        worker_role: t.worker_role,
        schedule_type: t.schedule_type,
        schedule_day: t.schedule_day !== '' ? Number(t.schedule_day) : null,
        biweekly_start_date: t.biweekly_start_date || null,
      }));
    onSubmit({
      ...form,
      assigned_weekday: form.assigned_weekday !== '' ? Number(form.assigned_weekday) : null,
      tasks: submittedTasks,
    });
  };

  const addTask = () => setTasks([...tasks, { ...EMPTY_TASK }]);
  const removeTask = (index) => setTasks(tasks.filter((_, i) => i !== index));
  const updateTask = (index, field, value) => {
    const updated = [...tasks];
    updated[index] = { ...updated[index], [field]: value };
    // Reset schedule_day when schedule_type changes
    if (field === 'schedule_type') {
      updated[index].schedule_day = '';
      updated[index].biweekly_start_date = '';
    }
    setTasks(updated);
  };

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-card-title">{property ? t('properties.editTitle') : t('properties.newTitle')}</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t('common.address')} *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.city')} *</label>
          <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('properties.weekdayLabel')}</label>
          <select value={form.assigned_weekday} onChange={e => setForm({ ...form, assigned_weekday: e.target.value })} className="select">
            <option value="">{t('properties.noFixedDay')}</option>
            <option value="1">{t('properties.monday')}</option>
            <option value="2">{t('properties.tuesday')}</option>
            <option value="3">{t('properties.wednesday')}</option>
            <option value="4">{t('properties.thursday')}</option>
            <option value="5">{t('properties.friday')}</option>
            <option value="6">{t('properties.saturday')}</option>
            <option value="0">{t('properties.sunday')}</option>
          </select>
        </div>
      </div>

      {/* Tasks Section */}
      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
        <div className="flex items-center" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>{t('properties.tasks')}</label>
          <button type="button" onClick={addTask} className="btn btn-secondary btn-sm">
            + {t('properties.addTask')}
          </button>
        </div>

        {tasks.length === 0 && (
          <div className="text-muted" style={{ padding: '12px 0', textAlign: 'center', fontSize: '0.875rem' }}>
            {t('properties.addTask')}
          </div>
        )}

        {tasks.map((task, i) => (
          <div key={i} className="form-row" style={{ alignItems: 'flex-end', marginBottom: '8px', gap: '8px' }}>
            {/* Task Name */}
            <div className="form-group" style={{ flex: 2 }}>
              {i === 0 && <label className="form-label">{t('properties.taskName')}</label>}
              <input
                value={task.task_name}
                onChange={e => updateTask(i, 'task_name', e.target.value)}
                placeholder={t('properties.taskName')}
                className="input"
              />
            </div>

            {/* Worker Role */}
            <div className="form-group" style={{ flex: 1 }}>
              {i === 0 && <label className="form-label">{t('properties.role')}</label>}
              <select value={task.worker_role} onChange={e => updateTask(i, 'worker_role', e.target.value)} className="select">
                <option value="field">{t('workers.role.field')}</option>
                <option value="cleaning">{t('workers.role.cleaning')}</option>
                <option value="office">{t('workers.role.office')}</option>
              </select>
            </div>

            {/* Schedule Type */}
            <div className="form-group" style={{ flex: 1 }}>
              {i === 0 && <label className="form-label">{t('properties.schedule')}</label>}
              <select value={task.schedule_type} onChange={e => updateTask(i, 'schedule_type', e.target.value)} className="select">
                <option value="property_default">{t('properties.scheduleDefault')}</option>
                <option value="weekly">{t('properties.scheduleWeekly')}</option>
                <option value="biweekly">{t('properties.scheduleBiweekly')}</option>
                <option value="monthly">{t('properties.scheduleMonthly')}</option>
              </select>
            </div>

            {/* Schedule Day (conditional) */}
            {(task.schedule_type === 'weekly' || task.schedule_type === 'biweekly') && (
              <div className="form-group" style={{ flex: 1 }}>
                {i === 0 && <label className="form-label">{t('properties.scheduleDay')}</label>}
                <select value={task.schedule_day} onChange={e => updateTask(i, 'schedule_day', e.target.value)} className="select">
                  <option value="">{t('properties.scheduleDay')}</option>
                  {WEEKDAY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              </div>
            )}

            {task.schedule_type === 'monthly' && (
              <div className="form-group" style={{ flex: 1 }}>
                {i === 0 && <label className="form-label">{t('properties.dayOfMonth')}</label>}
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={task.schedule_day}
                  onChange={e => updateTask(i, 'schedule_day', e.target.value)}
                  placeholder="1-31"
                  className="input"
                />
              </div>
            )}

            {/* Biweekly Start Date */}
            {task.schedule_type === 'biweekly' && (
              <div className="form-group" style={{ flex: 1 }}>
                {i === 0 && <label className="form-label">{t('properties.biweeklyStart')}</label>}
                <input
                  type="date"
                  value={task.biweekly_start_date}
                  onChange={e => updateTask(i, 'biweekly_start_date', e.target.value)}
                  className="input"
                />
              </div>
            )}

            {/* Delete Button */}
            <div style={{ paddingBottom: '4px' }}>
              <button type="button" onClick={() => removeTask(i)} className="btn btn-danger btn-sm" title="Remove">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice/client" && npx vite build`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PropertyForm.jsx
git commit -m "feat: replace standard_tasks input with inline task list in PropertyForm"
```

---

### Task 10: Properties Page — Show Task Names

**Files:**
- Modify: `client/src/pages/Properties.jsx`

- [ ] **Step 1: Update the tasks column in the properties table**

In `client/src/pages/Properties.jsx`, replace line 131:

```jsx
                <td className="text-secondary">{p.standard_tasks || '—'}</td>
```

with:

```jsx
                <td className="text-secondary">
                  {p.tasks && p.tasks.length > 0
                    ? p.tasks.map(t => t.task_name).join(', ')
                    : '—'}
                </td>
```

- [ ] **Step 2: Update sorting for tasks column**

In the `sorted` useMemo (line 40-46), add a case for the tasks sort key. Replace:

```javascript
      if (sortKey === 'weekday') {
        va = a.assigned_weekday ?? 99;
        vb = b.assigned_weekday ?? 99;
      } else {
        va = (a[sortKey] || '').toLowerCase();
        vb = (b[sortKey] || '').toLowerCase();
      }
```

with:

```javascript
      if (sortKey === 'weekday') {
        va = a.assigned_weekday ?? 99;
        vb = b.assigned_weekday ?? 99;
      } else if (sortKey === 'tasks') {
        va = (a.tasks || []).length;
        vb = (b.tasks || []).length;
      } else {
        va = (a[sortKey] || '').toLowerCase();
        vb = (b[sortKey] || '').toLowerCase();
      }
```

- [ ] **Step 3: Update the column header sort key**

Replace line 120:

```jsx
              <SortHeader col="standard_tasks">{t('properties.tasks')}</SortHeader>
```

with:

```jsx
              <SortHeader col="tasks">{t('properties.tasks')}</SortHeader>
```

- [ ] **Step 4: Verify frontend build**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice/client" && npx vite build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Properties.jsx
git commit -m "feat: show task names instead of standard_tasks in properties table"
```

---

### Task 11: Verification

- [ ] **Step 1: Run all tests**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice" && npx vitest run`

Expected: All tests pass.

- [ ] **Step 2: Full frontend build**

Run: `cd "e:/OneDrive - DESCO/Documente/HsN/Halil/Bal Hausmeisterservice/client" && npx vite build`

Expected: Build succeeds.

- [ ] **Step 3: Verify migration data via Supabase MCP**

Run these SQL queries via `mcp__plugin_supabase_supabase__execute_sql`:

```sql
-- Count tasks per property
SELECT p.address, p.city, count(pt.id) AS task_count
FROM properties p
LEFT JOIN property_tasks pt ON pt.property_id = p.id AND pt.is_active = true
WHERE p.is_active = true
GROUP BY p.id, p.address, p.city
ORDER BY p.city, p.address;

-- Verify task_assignments has worker_role column
SELECT column_name FROM information_schema.columns
WHERE table_name = 'task_assignments' AND column_name = 'worker_role';
```

- [ ] **Step 4: Verify no remaining standard_tasks references in frontend/API code**

Search for `standard_tasks` in source code — it should only appear in:
- The migration file (for reading existing data)
- The properties API handlers (for backwards compat in the INSERT/UPDATE — can be cleaned up later)
- The PropertyForm should NOT reference it anymore

```bash
grep -r "standard_tasks" --include="*.jsx" --include="*.js" client/src/ api/_handlers/
```

Expected: No references in `client/src/` files. Only in `api/_handlers/properties/` (the column still exists in the DB schema).
