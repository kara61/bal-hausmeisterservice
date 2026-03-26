# Module 2: Task Scheduling (Hausmeisterliste) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the task scheduling system that manages ~36 contracted properties, flexible daily teams, task assignments, photo documentation, extra jobs, and a live daily overview dashboard for Halil.

**Architecture:** Extends the existing Module 1 backend (Express + PostgreSQL) with new tables, routes, services, and admin dashboard pages. Workers receive daily task lists via WhatsApp and report completion with photos. Halil manages everything through the dashboard with real-time status updates.

**Tech Stack:** Same as Module 1 — Node.js + Express 5, PostgreSQL, Twilio WhatsApp, React PWA

---

## File Structure

### Backend (new files)
- `src/db/migrations/002-module2-schema.sql` — Properties, teams, task_assignments, extra_jobs tables
- `src/routes/properties.js` — Property CRUD
- `src/routes/teams.js` — Team management (create, list, update members)
- `src/routes/tasks.js` — Task assignments (daily view, assign, update status, reassign)
- `src/routes/extraJobs.js` — Extra job CRUD and status updates
- `src/services/taskScheduling.js` — Generate daily tasks, carryover logic, postponement
- `src/services/taskNotifications.js` — Send daily task lists and updates via WhatsApp
- `src/services/photoStorage.js` — Download and store Twilio media attachments

### Backend (modified files)
- `src/app.js` — Register new routes
- `src/services/bot.js` — Extend for task completion flow (Erledigt, Nicht moeglich)
- `src/services/scheduler.js` — Add daily task list send job
- `src/services/notifications.js` — Add task-related notifications

### Frontend (new files)
- `client/src/pages/Properties.jsx` — Property management page
- `client/src/pages/DailyTasks.jsx` — Live daily task overview
- `client/src/pages/ExtraJobs.jsx` — Extra job management page
- `client/src/components/PropertyForm.jsx` — Property create/edit form
- `client/src/components/TaskCard.jsx` — Task status card for daily view
- `client/src/components/ExtraJobForm.jsx` — Extra job create form

### Frontend (modified files)
- `client/src/App.jsx` — Add new routes
- `client/src/components/Layout.jsx` — Add nav items

### Tests (new files)
- `tests/services/taskScheduling.test.js` — Task generation, carryover logic
- `tests/routes/properties.test.js` — Property CRUD
- `tests/routes/tasks.test.js` — Task assignment operations

---

### Task 1: Database Migration — Module 2 Schema

**Files:**
- Create: `src/db/migrations/002-module2-schema.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  standard_tasks TEXT NOT NULL DEFAULT '',
  assigned_weekday INTEGER CHECK (assigned_weekday BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  UNIQUE(team_id, worker_id)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  team_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL,
  task_description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'postponed', 'carried_over')),
  photo_url VARCHAR(500),
  completed_at TIMESTAMPTZ,
  postpone_reason VARCHAR(255),
  postponed_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extra_jobs (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  address VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  photo_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Verify migration runner picks it up**

Run: `ls src/db/migrations/`
Expected: Both `001-initial-schema.sql` and `002-module2-schema.sql` are listed.

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/002-module2-schema.sql
git commit -m "feat: add Module 2 database schema (properties, teams, tasks, extra jobs)"
```

---

### Task 2: Property CRUD API

**Files:**
- Create: `src/routes/properties.js`
- Create: `tests/routes/properties.test.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the property route tests**

```js
// tests/routes/properties.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/db/pool.js';

beforeEach(async () => {
  await pool.query('DELETE FROM task_assignments');
  await pool.query('DELETE FROM properties');
});

describe('GET /api/properties', () => {
  it('returns empty array when no properties exist', async () => {
    const res = await request(app).get('/api/properties')
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/properties', () => {
  it('creates a new property', async () => {
    const res = await request(app).post('/api/properties')
      .set('Authorization', 'Bearer test-token')
      .send({
        address: 'Scherrerweg 5',
        city: 'Scheyern',
        standard_tasks: 'alles',
        assigned_weekday: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.address).toBe('Scherrerweg 5');
    expect(res.body.city).toBe('Scheyern');
    expect(res.body.assigned_weekday).toBe(1);
  });
});

describe('PUT /api/properties/:id', () => {
  it('updates a property', async () => {
    const created = await pool.query(
      `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
       VALUES ('Test 1', 'TestCity', 'alles', 1) RETURNING *`
    );
    const res = await request(app).put(`/api/properties/${created.rows[0].id}`)
      .set('Authorization', 'Bearer test-token')
      .send({ standard_tasks: 'TH reinigen' });
    expect(res.status).toBe(200);
    expect(res.body.standard_tasks).toBe('TH reinigen');
  });
});

describe('DELETE /api/properties/:id', () => {
  it('soft-deletes a property', async () => {
    const created = await pool.query(
      `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
       VALUES ('Test 1', 'TestCity', 'alles', 1) RETURNING *`
    );
    const res = await request(app).delete(`/api/properties/${created.rows[0].id}`)
      .set('Authorization', 'Bearer test-token');
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });
});
```

- [ ] **Step 2: Write the property routes**

```js
// src/routes/properties.js
import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const { address, city, standard_tasks, assigned_weekday } = req.body;
  if (!address || !city) return res.status(400).json({ error: 'address and city required' });

  const result = await pool.query(
    `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [address, city, standard_tasks || '', assigned_weekday ?? null]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const fields = ['address', 'city', 'standard_tasks', 'assigned_weekday'];
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

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    'UPDATE properties SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

export default router;
```

- [ ] **Step 3: Register the route in app.js**

Add to `src/app.js` after the existing route imports:
```js
import propertiesRouter from './routes/properties.js';
```

Add after existing protected routes:
```js
app.use('/api/properties', requireAuth, propertiesRouter);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/routes/properties.test.js`
Expected: All tests pass (DB required)

- [ ] **Step 5: Commit**

```bash
git add src/routes/properties.js tests/routes/properties.test.js src/app.js
git commit -m "feat: property CRUD API with soft-delete"
```

---

### Task 3: Team Management API

**Files:**
- Create: `src/routes/teams.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the team routes**

```js
// src/routes/teams.js
import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// Get teams for a date
router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });

  const result = await pool.query(
    `SELECT t.*, json_agg(json_build_object('id', w.id, 'name', w.name) ORDER BY w.name)
       FILTER (WHERE w.id IS NOT NULL) AS members
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     LEFT JOIN workers w ON w.id = tm.worker_id AND w.is_active = true
     WHERE t.date = $1
     GROUP BY t.id
     ORDER BY t.created_at`,
    [date]
  );
  res.json(result.rows);
});

// Create a team for a date
router.post('/', async (req, res) => {
  const { date, name, member_ids } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
    return res.status(400).json({ error: 'member_ids array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamResult = await client.query(
      'INSERT INTO teams (date, name) VALUES ($1, $2) RETURNING *',
      [date, name || null]
    );
    const team = teamResult.rows[0];

    for (const workerId of member_ids) {
      await client.query(
        'INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)',
        [team.id, workerId]
      );
    }

    await client.query('COMMIT');

    // Return team with members
    const full = await pool.query(
      `SELECT t.*, json_agg(json_build_object('id', w.id, 'name', w.name)) AS members
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       JOIN workers w ON w.id = tm.worker_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [team.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Update team members
router.put('/:id/members', async (req, res) => {
  const { member_ids } = req.body;
  if (!member_ids || !Array.isArray(member_ids)) {
    return res.status(400).json({ error: 'member_ids array required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM team_members WHERE team_id = $1', [req.params.id]);
    for (const workerId of member_ids) {
      await client.query(
        'INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)',
        [req.params.id, workerId]
      );
    }
    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT t.*, json_agg(json_build_object('id', w.id, 'name', w.name)) AS members
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       JOIN workers w ON w.id = tm.worker_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [req.params.id]
    );
    if (full.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
    res.json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Delete a team
router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
  res.json({ message: 'Team deleted' });
});

export default router;
```

- [ ] **Step 2: Register the route in app.js**

Add import:
```js
import teamsRouter from './routes/teams.js';
```

Add route:
```js
app.use('/api/teams', requireAuth, teamsRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/teams.js src/app.js
git commit -m "feat: team management API with member assignment"
```

---

### Task 4: Task Scheduling Service

**Files:**
- Create: `src/services/taskScheduling.js`
- Create: `tests/services/taskScheduling.test.js`

- [ ] **Step 1: Write tests for pure scheduling logic**

```js
// tests/services/taskScheduling.test.js
import { describe, it, expect } from 'vitest';
import { getWeekday, shouldCarryOver, formatTaskList } from '../../src/services/taskScheduling.js';

describe('getWeekday', () => {
  it('returns 1 for Monday', () => {
    // 2026-03-23 is a Monday
    expect(getWeekday('2026-03-23')).toBe(1);
  });

  it('returns 0 for Sunday', () => {
    // 2026-03-29 is a Sunday
    expect(getWeekday('2026-03-29')).toBe(0);
  });
});

describe('shouldCarryOver', () => {
  it('returns true for pending tasks', () => {
    expect(shouldCarryOver({ status: 'pending' })).toBe(true);
  });

  it('returns true for in_progress tasks', () => {
    expect(shouldCarryOver({ status: 'in_progress' })).toBe(true);
  });

  it('returns false for done tasks', () => {
    expect(shouldCarryOver({ status: 'done' })).toBe(false);
  });

  it('returns false for postponed tasks', () => {
    expect(shouldCarryOver({ status: 'postponed' })).toBe(false);
  });
});

describe('formatTaskList', () => {
  it('formats a task list for WhatsApp', () => {
    const tasks = [
      { address: 'Scherrerweg 5', city: 'Scheyern', task_description: 'alles' },
      { address: 'Marienstr. 13', city: 'Scheyern', task_description: 'TH reinigen' },
    ];
    const result = formatTaskList(tasks, '2026-03-23');
    expect(result).toContain('Montag 23.03');
    expect(result).toContain('1. Scherrerweg 5, Scheyern — alles');
    expect(result).toContain('2. Marienstr. 13, Scheyern — TH reinigen');
  });

  it('returns empty message when no tasks', () => {
    const result = formatTaskList([], '2026-03-23');
    expect(result).toContain('keine Aufgaben');
  });
});
```

- [ ] **Step 2: Write the task scheduling service**

```js
// src/services/taskScheduling.js
import { pool } from '../db/pool.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function getWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function shouldCarryOver(task) {
  return task.status === 'pending' || task.status === 'in_progress';
}

export function formatTaskList(tasks, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayName = DAY_NAMES[new Date(y, m - 1, d).getDay()];
  const dateFormatted = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`;

  if (tasks.length === 0) {
    return `${dayName} ${dateFormatted} — keine Aufgaben zugewiesen.`;
  }

  const header = `Deine Aufgaben fuer ${dayName} ${dateFormatted}:`;
  const lines = tasks.map((t, i) =>
    `${i + 1}. ${t.address}, ${t.city} — ${t.task_description}`
  );
  return `${header}\n${lines.join('\n')}`;
}

export async function generateDailyTasks(dateStr) {
  const weekday = getWeekday(dateStr);

  // Get properties assigned to this weekday
  const props = await pool.query(
    'SELECT * FROM properties WHERE assigned_weekday = $1 AND is_active = true',
    [weekday]
  );

  const created = [];
  for (const prop of props.rows) {
    // Check if task already exists for this property+date
    const exists = await pool.query(
      'SELECT id FROM task_assignments WHERE property_id = $1 AND date = $2',
      [prop.id, dateStr]
    );
    if (exists.rows.length > 0) continue;

    const result = await pool.query(
      `INSERT INTO task_assignments (property_id, date, task_description, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [prop.id, dateStr, prop.standard_tasks]
    );
    created.push(result.rows[0]);
  }

  return created;
}

export async function carryOverTasks(fromDate, toDate) {
  // Find incomplete tasks from the previous day
  const incomplete = await pool.query(
    `SELECT ta.*, p.address, p.city, p.standard_tasks
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.date = $1 AND ta.status IN ('pending', 'in_progress')`,
    [fromDate]
  );

  const carried = [];
  for (const task of incomplete.rows) {
    // Mark original as carried_over
    await pool.query(
      `UPDATE task_assignments SET status = 'carried_over', updated_at = NOW() WHERE id = $1`,
      [task.id]
    );

    // Check if task already exists for target date
    const exists = await pool.query(
      'SELECT id FROM task_assignments WHERE property_id = $1 AND date = $2',
      [task.property_id, toDate]
    );
    if (exists.rows.length > 0) continue;

    // Create new task for the target date
    const result = await pool.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [task.property_id, null, toDate, task.task_description]
    );
    carried.push(result.rows[0]);
  }

  return carried;
}

export async function postponeTask(taskId, reason, newDate) {
  const result = await pool.query(
    `UPDATE task_assignments
     SET status = 'postponed', postpone_reason = $1, postponed_to = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [reason, newDate, taskId]
  );
  if (result.rows.length === 0) throw new Error('Task not found');

  const task = result.rows[0];

  // Create new task for the postponed date
  await pool.query(
    `INSERT INTO task_assignments (property_id, date, task_description, status)
     VALUES ($1, $2, $3, 'pending')`,
    [task.property_id, newDate, task.task_description]
  );

  return task;
}

export async function getTasksForTeam(teamId, dateStr) {
  const result = await pool.query(
    `SELECT ta.*, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.team_id = $1 AND ta.date = $2
     ORDER BY ta.created_at`,
    [teamId, dateStr]
  );
  return result.rows;
}

export async function getDailyOverview(dateStr) {
  const result = await pool.query(
    `SELECT ta.*,
       p.address, p.city,
       t.name AS team_name,
       json_agg(DISTINCT jsonb_build_object('id', w.id, 'name', w.name))
         FILTER (WHERE w.id IS NOT NULL) AS team_members
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     LEFT JOIN teams t ON t.id = ta.team_id
     LEFT JOIN team_members tm ON tm.team_id = t.id
     LEFT JOIN workers w ON w.id = tm.worker_id
     WHERE ta.date = $1
     GROUP BY ta.id, p.address, p.city, t.name
     ORDER BY ta.status, ta.created_at`,
    [dateStr]
  );
  return result.rows;
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/taskScheduling.test.js`
Expected: All 7 pure-function tests pass

- [ ] **Step 4: Commit**

```bash
git add src/services/taskScheduling.js tests/services/taskScheduling.test.js
git commit -m "feat: task scheduling service with carryover, postponement, and daily overview"
```

---

### Task 5: Task Assignment API Routes

**Files:**
- Create: `src/routes/tasks.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the task routes**

```js
// src/routes/tasks.js
import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  generateDailyTasks,
  carryOverTasks,
  postponeTask,
  getDailyOverview,
} from '../services/taskScheduling.js';
import { notifyTeamTaskUpdate } from '../services/taskNotifications.js';

const router = Router();

// Get daily overview
router.get('/daily', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required' });
  const overview = await getDailyOverview(date);
  res.json(overview);
});

// Generate tasks for a date (from property schedules)
router.post('/generate', async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const created = await generateDailyTasks(date);
  res.json({ message: `${created.length} tasks generated`, tasks: created });
});

// Carry over incomplete tasks from one date to the next
router.post('/carryover', async (req, res) => {
  const { from_date, to_date } = req.body;
  if (!from_date || !to_date) return res.status(400).json({ error: 'from_date and to_date required' });
  const carried = await carryOverTasks(from_date, to_date);
  res.json({ message: `${carried.length} tasks carried over`, tasks: carried });
});

// Assign a task to a team
router.put('/:id/assign', async (req, res) => {
  const { team_id } = req.body;
  const result = await pool.query(
    'UPDATE task_assignments SET team_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [team_id, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

  if (team_id) {
    await notifyTeamTaskUpdate(team_id, result.rows[0], 'assigned');
  }
  res.json(result.rows[0]);
});

// Update task status (mark done, in_progress)
router.put('/:id/status', async (req, res) => {
  const { status, photo_url } = req.body;
  const valid = ['pending', 'in_progress', 'done', 'postponed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [status];
  let idx = 2;

  if (status === 'done') {
    updates.push(`completed_at = NOW()`);
  }

  if (photo_url) {
    updates.push(`photo_url = $${idx}`);
    values.push(photo_url);
    idx++;
  }

  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE task_assignments SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(result.rows[0]);
});

// Postpone a task
router.put('/:id/postpone', async (req, res) => {
  const { reason, new_date } = req.body;
  if (!reason || !new_date) return res.status(400).json({ error: 'reason and new_date required' });
  const task = await postponeTask(req.params.id, reason, new_date);
  res.json(task);
});

// Reassign task to different team
router.put('/:id/reassign', async (req, res) => {
  const { team_id } = req.body;

  // Get current task to notify old team
  const current = await pool.query('SELECT * FROM task_assignments WHERE id = $1', [req.params.id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

  const oldTeamId = current.rows[0].team_id;

  const result = await pool.query(
    'UPDATE task_assignments SET team_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [team_id, req.params.id]
  );

  // Notify both old and new teams
  if (oldTeamId) {
    await notifyTeamTaskUpdate(oldTeamId, result.rows[0], 'removed');
  }
  if (team_id) {
    await notifyTeamTaskUpdate(team_id, result.rows[0], 'assigned');
  }

  res.json(result.rows[0]);
});

export default router;
```

- [ ] **Step 2: Register the route in app.js**

Add import:
```js
import tasksRouter from './routes/tasks.js';
```

Add route:
```js
app.use('/api/tasks', requireAuth, tasksRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/tasks.js src/app.js
git commit -m "feat: task assignment API with assign, reassign, postpone, carryover"
```

---

### Task 6: Extra Job API Routes

**Files:**
- Create: `src/routes/extraJobs.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the extra job routes**

```js
// src/routes/extraJobs.js
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { notifyTeamNewExtraJob } from '../services/taskNotifications.js';

const router = Router();

// Get extra jobs filtered by date
router.get('/', async (req, res) => {
  const { date } = req.query;
  let query = `SELECT ej.*,
    t.name AS team_name,
    json_agg(DISTINCT jsonb_build_object('id', w.id, 'name', w.name))
      FILTER (WHERE w.id IS NOT NULL) AS team_members
    FROM extra_jobs ej
    LEFT JOIN teams t ON t.id = ej.team_id
    LEFT JOIN team_members tm ON tm.team_id = t.id
    LEFT JOIN workers w ON w.id = tm.worker_id`;
  const params = [];

  if (date) {
    query += ' WHERE ej.date = $1';
    params.push(date);
  }

  query += ' GROUP BY ej.id, t.name ORDER BY ej.date DESC, ej.created_at';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Create an extra job
router.post('/', async (req, res) => {
  const { description, address, team_id, date } = req.body;
  if (!description || !address || !date) {
    return res.status(400).json({ error: 'description, address, and date required' });
  }

  const result = await pool.query(
    `INSERT INTO extra_jobs (description, address, team_id, date)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [description, address, team_id || null, date]
  );

  if (team_id) {
    await notifyTeamNewExtraJob(team_id, result.rows[0]);
  }
  res.status(201).json(result.rows[0]);
});

// Update extra job status and times
router.put('/:id', async (req, res) => {
  const fields = ['description', 'address', 'team_id', 'date', 'time_in', 'time_out', 'status'];
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

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE extra_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
  res.json(result.rows[0]);
});

// Add photo to extra job
router.post('/:id/photos', async (req, res) => {
  const { photo_url } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url required' });

  const result = await pool.query(
    `UPDATE extra_jobs SET photo_urls = array_append(photo_urls, $1), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [photo_url, req.params.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
  res.json(result.rows[0]);
});

// Delete extra job
router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM extra_jobs WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
  res.json({ message: 'Extra job deleted' });
});

export default router;
```

- [ ] **Step 2: Register the route in app.js**

Add import:
```js
import extraJobsRouter from './routes/extraJobs.js';
```

Add route:
```js
app.use('/api/extra-jobs', requireAuth, extraJobsRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/extraJobs.js src/app.js
git commit -m "feat: extra job CRUD API with photo support and team notifications"
```

---

### Task 7: Task Notification Service

**Files:**
- Create: `src/services/taskNotifications.js`

- [ ] **Step 1: Write the task notification service**

```js
// src/services/taskNotifications.js
import { pool } from '../db/pool.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { formatTaskList, getTasksForTeam } from './taskScheduling.js';

export async function sendDailyTaskLists(dateStr) {
  // Get all teams for the date
  const teams = await pool.query(
    `SELECT t.id, t.name
     FROM teams t
     WHERE t.date = $1`,
    [dateStr]
  );

  for (const team of teams.rows) {
    const tasks = await getTasksForTeam(team.id, dateStr);
    if (tasks.length === 0) continue;

    const message = formatTaskList(tasks, dateStr);

    // Get team member phone numbers
    const members = await pool.query(
      `SELECT w.phone_number, w.name
       FROM team_members tm
       JOIN workers w ON w.id = tm.worker_id AND w.is_active = true
       WHERE tm.team_id = $1`,
      [team.id]
    );

    for (const member of members.rows) {
      await sendWhatsAppMessage(member.phone_number, message);
    }
  }
}

export async function notifyTeamTaskUpdate(teamId, task, action) {
  const members = await pool.query(
    `SELECT w.phone_number
     FROM team_members tm
     JOIN workers w ON w.id = tm.worker_id AND w.is_active = true
     WHERE tm.team_id = $1`,
    [teamId]
  );

  // Get property info
  const prop = await pool.query('SELECT address, city FROM properties WHERE id = $1', [task.property_id]);
  const addr = prop.rows.length > 0 ? `${prop.rows[0].address}, ${prop.rows[0].city}` : 'Unbekannt';

  let message;
  if (action === 'assigned') {
    message = `Neue Aufgabe: ${addr} — ${task.task_description}`;
  } else if (action === 'removed') {
    message = `Aufgabe entfernt: ${addr}`;
  }

  for (const member of members.rows) {
    await sendWhatsAppMessage(member.phone_number, message);
  }
}

export async function notifyTeamNewExtraJob(teamId, job) {
  const members = await pool.query(
    `SELECT w.phone_number
     FROM team_members tm
     JOIN workers w ON w.id = tm.worker_id AND w.is_active = true
     WHERE tm.team_id = $1`,
    [teamId]
  );

  const message = `Zusatzauftrag: ${job.description}\nAdresse: ${job.address}`;
  for (const member of members.rows) {
    await sendWhatsAppMessage(member.phone_number, message);
  }
}

export async function notifyHalilPostponedTask(task, reason) {
  const { sendWhatsAppMessage: send } = await import('./whatsapp.js');
  const { config } = await import('../config.js');

  const prop = await pool.query('SELECT address, city FROM properties WHERE id = $1', [task.property_id]);
  const addr = prop.rows.length > 0 ? `${prop.rows[0].address}, ${prop.rows[0].city}` : 'Unbekannt';

  await send(
    config.halilWhatsappNumber,
    `Aufgabe verschoben: ${addr}\nGrund: ${reason}\n\n> OK\n> Bearbeiten`
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/taskNotifications.js
git commit -m "feat: task notification service for daily lists and team updates"
```

---

### Task 8: Photo Storage Service

**Files:**
- Create: `src/services/photoStorage.js`

- [ ] **Step 1: Write the photo storage service**

Photos from Twilio come as MediaUrl parameters in the webhook body. This service downloads them and stores locally.

```js
// src/services/photoStorage.js
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../uploads/photos');

export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function savePhotoFromTwilio(mediaUrl, mediaContentType) {
  await ensureUploadDir();

  const ext = mediaContentType?.includes('png') ? 'png' : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);

  const response = await fetch(mediaUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filepath, buffer);

  return `/uploads/photos/${filename}`;
}

export function getUploadDir() {
  return UPLOAD_DIR;
}
```

- [ ] **Step 2: Add static serving for uploads in app.js**

Add after the existing static serving block:
```js
const uploadsDir = join(__dirname, '../uploads');
if (existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/photoStorage.js src/app.js
git commit -m "feat: photo storage service for Twilio media downloads"
```

---

### Task 9: Extend WhatsApp Bot for Task Flow

**Files:**
- Modify: `src/services/bot.js`
- Modify: `src/routes/webhook.js`

- [ ] **Step 1: Extend bot.js to handle task completion**

Add new handlers to the bot for:
- `erledigt` — marks current task as done, prompts for photo
- `nicht moeglich` — prompts for reason selection
- Reason selection (Zugang nicht moeglich, etc.)

Add these functions and extend handleIncomingMessage:

```js
// Add to imports at top of bot.js
import { pool } from '../db/pool.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { notifyHalilPostponedTask } from './taskNotifications.js';
import { savePhotoFromTwilio } from './photoStorage.js';

// Extend handleIncomingMessage to add new states
// After 'krank melden' handling and before the default menu response:

  if (command === 'erledigt') {
    return handleErledigt(worker);
  }

  if (command === 'nicht moeglich') {
    return handleNichtMoeglich(worker);
  }

  // Handle postpone reason selection
  if (state === 'awaiting_postpone_reason') {
    return handlePostponeReason(worker, text);
  }

// Add new menu items to the default response:
// Update the menu response to include task options:
  return {
    type: 'menu',
    response: 'Ich kann nur diese Aktionen ausfuehren:\n\n> Einchecken\n> Auschecken\n> Krank melden\n> Erledigt\n> Nicht moeglich\n\nFuer alles andere bitte direkt Halil kontaktieren.',
  };
```

Add new handler functions:

```js
async function handleErledigt(worker) {
  const today = new Date().toISOString().split('T')[0];

  // Find the worker's current in_progress or first pending task for today
  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];

  // Mark task as done
  await pool.query(
    `UPDATE task_assignments SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [task.id]
  );

  conversationState.set(worker.phone_number, `awaiting_photo_${task.id}`);

  return {
    type: 'task_done',
    response: `${task.address}, ${task.city} als erledigt markiert.\nBitte sende ein Foto als Bestaetigung (oder "weiter" um zu ueberspringen).`,
  };
}

async function handleNichtMoeglich(worker) {
  const today = new Date().toISOString().split('T')[0];

  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];
  conversationState.set(worker.phone_number, `awaiting_postpone_reason_${task.id}`);

  return {
    type: 'postpone_prompt',
    response: `Warum kann ${task.address} nicht erledigt werden?\n\n> Zugang nicht moeglich\n> Verantwortlicher nicht da\n> Material fehlt\n> Sonstiges`,
  };
}

async function handlePostponeReason(worker, reasonText) {
  const stateKey = conversationState.get(worker.phone_number);
  const taskId = parseInt(stateKey.replace('awaiting_postpone_reason_', ''), 10);
  conversationState.delete(worker.phone_number);

  const validReasons = ['zugang nicht moeglich', 'verantwortlicher nicht da', 'material fehlt', 'sonstiges'];
  const reason = validReasons.includes(reasonText.toLowerCase()) ? reasonText : reasonText;

  // Postpone to next day
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const result = await pool.query(
    `UPDATE task_assignments
     SET status = 'postponed', postpone_reason = $1, postponed_to = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [reason, tomorrowStr, taskId]
  );

  if (result.rows.length > 0) {
    await notifyHalilPostponedTask(result.rows[0], reason);
  }

  return {
    type: 'postponed',
    response: `Aufgabe wurde verschoben. Halil wird benachrichtigt.`,
  };
}
```

- [ ] **Step 2: Extend webhook to handle photo media**

Update `src/routes/webhook.js` to extract MediaUrl from Twilio body:

```js
router.post('/', validateTwilio, async (req, res) => {
  const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

  if (!From) {
    return res.status(400).send('Missing From');
  }

  const result = await handleIncomingMessage(From, Body || '', {
    numMedia: parseInt(NumMedia || '0', 10),
    mediaUrl: MediaUrl0,
    mediaContentType: MediaContentType0,
  });
  await sendWhatsAppMessage(From, result.response);
  res.status(200).send('<Response></Response>');
});
```

- [ ] **Step 3: Handle photo in bot.js**

Add media handling to `handleIncomingMessage`:

```js
// At the top of handleIncomingMessage, after state check for 'awaiting_sick_days':
  // Handle photo state
  if (state && state.startsWith('awaiting_photo_')) {
    const taskId = parseInt(state.replace('awaiting_photo_', ''), 10);
    conversationState.delete(phone);

    if (media && media.numMedia > 0 && media.mediaUrl) {
      const photoPath = await savePhotoFromTwilio(media.mediaUrl, media.mediaContentType);
      await pool.query(
        'UPDATE task_assignments SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [photoPath, taskId]
      );
      return { type: 'photo_saved', response: 'Foto gespeichert. Weiter zur naechsten Aufgabe!' };
    }

    if (text.toLowerCase() === 'weiter') {
      return { type: 'photo_skipped', response: 'OK, weiter zur naechsten Aufgabe.' };
    }

    // If they sent text instead of photo, save as skipped
    return { type: 'photo_skipped', response: 'Kein Foto erkannt. Weiter zur naechsten Aufgabe.' };
  }

  // Handle postpone reason state
  if (state && state.startsWith('awaiting_postpone_reason_')) {
    return handlePostponeReason(worker, text);
  }
```

Update the function signature to accept media:
```js
export async function handleIncomingMessage(phoneNumber, messageBody, media = {}) {
```

- [ ] **Step 4: Commit**

```bash
git add src/services/bot.js src/routes/webhook.js
git commit -m "feat: extend WhatsApp bot for task completion, postponement, and photo uploads"
```

---

### Task 10: Extend Scheduler for Daily Tasks

**Files:**
- Modify: `src/services/scheduler.js`

- [ ] **Step 1: Add daily task generation and notification cron**

Add two new cron jobs:
1. At 05:00 daily: generate tasks + carry over from yesterday
2. At 05:30 daily: send task lists to teams

```js
// Add imports at top
import { generateDailyTasks, carryOverTasks } from './taskScheduling.js';
import { sendDailyTaskLists } from './taskNotifications.js';

// Add inside startScheduler():

  // Generate daily tasks at 05:00
  cron.schedule('0 5 * * *', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await carryOverTasks(yesterday, today);
      await generateDailyTasks(today);
      console.log(`Daily tasks generated for ${today}`);
    } catch (err) {
      console.error('Error generating daily tasks:', err);
    }
  });

  // Send daily task lists at 05:30
  cron.schedule('30 5 * * *', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await sendDailyTaskLists(today);
      console.log(`Task lists sent for ${today}`);
    } catch (err) {
      console.error('Error sending task lists:', err);
    }
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/services/scheduler.js
git commit -m "feat: daily task generation and notification cron jobs"
```

---

### Task 11: Properties Admin Page

**Files:**
- Create: `client/src/pages/Properties.jsx`
- Create: `client/src/components/PropertyForm.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Write the PropertyForm component**

```jsx
// client/src/components/PropertyForm.jsx
import { useState, useEffect } from 'react';

const WEEKDAYS = [
  { value: '', label: '-- Kein fester Tag --' },
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
  { value: 0, label: 'Sonntag' },
];

export default function PropertyForm({ property, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    address: '',
    city: '',
    standard_tasks: '',
    assigned_weekday: '',
  });

  useEffect(() => {
    if (property) {
      setForm({
        address: property.address || '',
        city: property.city || '',
        standard_tasks: property.standard_tasks || '',
        assigned_weekday: property.assigned_weekday ?? '',
      });
    }
  }, [property]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      assigned_weekday: form.assigned_weekday === '' ? null : Number(form.assigned_weekday),
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '500px' }}>
      <label>
        Adresse *
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
          required style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Stadt *
        <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
          required style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Standardaufgaben
        <input value={form.standard_tasks} onChange={e => setForm({ ...form, standard_tasks: e.target.value })}
          placeholder="z.B. alles, TH reinigen"
          style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Zugewiesener Wochentag
        <select value={form.assigned_weekday} onChange={e => setForm({ ...form, assigned_weekday: e.target.value })}
          style={{ width: '100%', padding: '0.4rem' }}>
          {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Speichern
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the Properties page**

```jsx
// client/src/pages/Properties.jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PropertyForm from '../components/PropertyForm';

const WEEKDAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadProperties(); }, []);

  async function loadProperties() {
    const data = await api.get('/properties');
    setProperties(data);
  }

  async function handleCreate(form) {
    await api.post('/properties', form);
    setShowForm(false);
    loadProperties();
  }

  async function handleUpdate(form) {
    await api.put(`/properties/${editing.id}`, form);
    setEditing(null);
    loadProperties();
  }

  async function handleDelete(id) {
    if (!confirm('Objekt wirklich deaktivieren?')) return;
    await api.delete(`/properties/${id}`);
    loadProperties();
  }

  if (editing) {
    return (
      <div>
        <h1>Objekt bearbeiten</h1>
        <PropertyForm property={editing} onSubmit={handleUpdate} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  if (showForm) {
    return (
      <div>
        <h1>Neues Objekt</h1>
        <PropertyForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Objekte</h1>
        <button onClick={() => setShowForm(true)} style={{
          padding: '0.5rem 1rem', background: '#2b6cb0', color: 'white',
          border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>+ Neues Objekt</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Adresse</th>
            <th style={{ padding: '0.5rem' }}>Stadt</th>
            <th style={{ padding: '0.5rem' }}>Aufgaben</th>
            <th style={{ padding: '0.5rem' }}>Tag</th>
            <th style={{ padding: '0.5rem' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {properties.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.5rem' }}>{p.address}</td>
              <td style={{ padding: '0.5rem' }}>{p.city}</td>
              <td style={{ padding: '0.5rem' }}>{p.standard_tasks}</td>
              <td style={{ padding: '0.5rem' }}>{p.assigned_weekday !== null ? WEEKDAY_NAMES[p.assigned_weekday] : '—'}</td>
              <td style={{ padding: '0.5rem' }}>
                <button onClick={() => setEditing(p)} style={{ marginRight: '0.5rem', cursor: 'pointer' }}>Bearbeiten</button>
                <button onClick={() => handleDelete(p.id)} style={{ color: 'red', cursor: 'pointer' }}>Deaktivieren</button>
              </td>
            </tr>
          ))}
          {properties.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>Keine Objekte vorhanden</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Add route and nav**

In `client/src/App.jsx`, add import and route:
```jsx
import Properties from './pages/Properties';
// Add inside Routes, after reports:
<Route path="properties" element={<Properties />} />
```

In `client/src/components/Layout.jsx`, add to navItems:
```js
{ path: '/properties', label: 'Objekte' },
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Properties.jsx client/src/components/PropertyForm.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: properties admin page with CRUD and weekday assignment"
```

---

### Task 12: Daily Tasks Admin Page

**Files:**
- Create: `client/src/pages/DailyTasks.jsx`
- Create: `client/src/components/TaskCard.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Write the TaskCard component**

```jsx
// client/src/components/TaskCard.jsx
const STATUS_COLORS = {
  pending: '#e2e8f0',
  in_progress: '#bee3f8',
  done: '#c6f6d5',
  postponed: '#fed7d7',
  carried_over: '#fefcbf',
};

const STATUS_LABELS = {
  pending: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  postponed: 'Verschoben',
  carried_over: 'Uebertragen',
};

export default function TaskCard({ task, teams, onAssign, onPostpone }) {
  return (
    <div style={{
      padding: '0.75rem', borderRadius: '6px', marginBottom: '0.5rem',
      background: STATUS_COLORS[task.status] || '#f7fafc',
      border: '1px solid #e2e8f0',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <strong>{task.address}, {task.city}</strong>
          <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: '0.25rem' }}>
            {task.task_description}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.25rem' }}>
            {STATUS_LABELS[task.status]}
            {task.team_name && ` — ${task.team_name}`}
            {task.team_members && task.team_members[0]?.name &&
              ` (${task.team_members.map(m => m.name).join(', ')})`}
          </div>
          {task.postpone_reason && (
            <div style={{ fontSize: '0.8rem', color: '#e53e3e', marginTop: '0.25rem' }}>
              Grund: {task.postpone_reason}
            </div>
          )}
          {task.photo_url && (
            <div style={{ marginTop: '0.25rem' }}>
              <a href={task.photo_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem' }}>Foto ansehen</a>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
          {task.status === 'pending' && !task.team_id && (
            <select onChange={e => onAssign(task.id, e.target.value)} defaultValue=""
              style={{ fontSize: '0.8rem', padding: '0.2rem' }}>
              <option value="" disabled>Zuweisen...</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name || `Team ${t.id}`}</option>)}
            </select>
          )}
          {['pending', 'in_progress'].includes(task.status) && (
            <button onClick={() => onPostpone(task.id)} style={{
              fontSize: '0.75rem', padding: '0.2rem 0.4rem', background: '#fc8181',
              color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer',
            }}>Verschieben</button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the DailyTasks page**

```jsx
// client/src/pages/DailyTasks.jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import TaskCard from '../components/TaskCard';

export default function DailyTasks() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  useEffect(() => { loadData(); }, [date]);

  async function loadData() {
    const [t, tm, w] = await Promise.all([
      api.get(`/tasks/daily?date=${date}`),
      api.get(`/teams?date=${date}`),
      api.get('/workers'),
    ]);
    setTasks(t);
    setTeams(tm);
    setWorkers(w);
  }

  async function handleGenerate() {
    await api.post('/tasks/generate', { date });
    loadData();
  }

  async function handleCarryOver() {
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    await api.post('/tasks/carryover', {
      from_date: yesterday.toISOString().split('T')[0],
      to_date: date,
    });
    loadData();
  }

  async function handleAssign(taskId, teamId) {
    await api.put(`/tasks/${taskId}/assign`, { team_id: parseInt(teamId) });
    loadData();
  }

  async function handlePostpone(taskId) {
    const reason = prompt('Grund fuer Verschiebung:');
    if (!reason) return;
    const newDate = prompt('Neues Datum (YYYY-MM-DD):', date);
    if (!newDate) return;
    await api.put(`/tasks/${taskId}/postpone`, { reason, new_date: newDate });
    loadData();
  }

  async function handleCreateTeam(e) {
    e.preventDefault();
    if (selectedMembers.length === 0) return;
    await api.post('/teams', { date, name: teamName, member_ids: selectedMembers.map(Number) });
    setShowTeamForm(false);
    setTeamName('');
    setSelectedMembers([]);
    loadData();
  }

  function toggleMember(id) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  const grouped = {
    done: tasks.filter(t => t.status === 'done'),
    active: tasks.filter(t => ['pending', 'in_progress'].includes(t.status)),
    other: tasks.filter(t => ['postponed', 'carried_over'].includes(t.status)),
  };

  const unassigned = grouped.active.filter(t => !t.team_id);
  const assigned = grouped.active.filter(t => t.team_id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Tagesansicht</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '0.4rem' }} />
          <button onClick={handleGenerate} style={{
            padding: '0.4rem 0.8rem', background: '#2b6cb0', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>Aufgaben generieren</button>
          <button onClick={handleCarryOver} style={{
            padding: '0.4rem 0.8rem', background: '#d69e2e', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>Uebertragen</button>
        </div>
      </div>

      {/* Teams section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Teams ({teams.length})</h2>
          <button onClick={() => setShowTeamForm(!showTeamForm)} style={{
            padding: '0.3rem 0.6rem', background: '#38a169', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
          }}>+ Team erstellen</button>
        </div>

        {showTeamForm && (
          <form onSubmit={handleCreateTeam} style={{
            padding: '0.75rem', background: '#f7fafc', border: '1px solid #e2e8f0',
            borderRadius: '6px', marginBottom: '0.75rem',
          }}>
            <input value={teamName} onChange={e => setTeamName(e.target.value)}
              placeholder="Teamname (optional)" style={{ padding: '0.3rem', marginBottom: '0.5rem', width: '200px' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.5rem' }}>
              {workers.map(w => (
                <label key={w.id} style={{
                  padding: '0.2rem 0.5rem', background: selectedMembers.includes(w.id) ? '#bee3f8' : '#edf2f7',
                  borderRadius: '3px', cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  <input type="checkbox" checked={selectedMembers.includes(w.id)}
                    onChange={() => toggleMember(w.id)} style={{ display: 'none' }} />
                  {w.name}
                </label>
              ))}
            </div>
            <button type="submit" style={{
              padding: '0.3rem 0.6rem', background: '#2b6cb0', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem',
            }}>Erstellen</button>
          </form>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {teams.map(t => (
            <div key={t.id} style={{
              padding: '0.4rem 0.75rem', background: '#edf2f7', borderRadius: '4px', fontSize: '0.85rem',
            }}>
              <strong>{t.name || `Team ${t.id}`}</strong>: {t.members ? t.members.map(m => m.name).join(', ') : '—'}
            </div>
          ))}
        </div>
      </div>

      {/* Unassigned tasks */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', color: '#e53e3e', marginBottom: '0.5rem' }}>
            Nicht zugewiesen ({unassigned.length})
          </h2>
          {unassigned.map(t => (
            <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />
          ))}
        </div>
      )}

      {/* Assigned / active tasks */}
      {assigned.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Aktiv ({assigned.length})</h2>
          {assigned.map(t => (
            <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />
          ))}
        </div>
      )}

      {/* Done tasks */}
      {grouped.done.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', color: '#38a169', marginBottom: '0.5rem' }}>
            Erledigt ({grouped.done.length})
          </h2>
          {grouped.done.map(t => (
            <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />
          ))}
        </div>
      )}

      {/* Postponed / carried over */}
      {grouped.other.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.1rem', color: '#d69e2e', marginBottom: '0.5rem' }}>
            Verschoben / Uebertragen ({grouped.other.length})
          </h2>
          {grouped.other.map(t => (
            <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: '2rem' }}>
          Keine Aufgaben fuer diesen Tag. Klicke "Aufgaben generieren" um Aufgaben aus dem Wochenplan zu erstellen.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add route and nav**

In `client/src/App.jsx`:
```jsx
import DailyTasks from './pages/DailyTasks';
// Add route:
<Route path="daily-tasks" element={<DailyTasks />} />
```

In `client/src/components/Layout.jsx` navItems:
```js
{ path: '/daily-tasks', label: 'Tagesansicht' },
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DailyTasks.jsx client/src/components/TaskCard.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: daily task overview page with team management and task assignment"
```

---

### Task 13: Extra Jobs Admin Page

**Files:**
- Create: `client/src/pages/ExtraJobs.jsx`
- Create: `client/src/components/ExtraJobForm.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Write the ExtraJobForm component**

```jsx
// client/src/components/ExtraJobForm.jsx
import { useState, useEffect } from 'react';

export default function ExtraJobForm({ teams, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    description: '',
    address: '',
    team_id: '',
    date: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      team_id: form.team_id ? parseInt(form.team_id) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '500px' }}>
      <label>
        Beschreibung *
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
          required rows={3} style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Adresse *
        <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
          required style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Datum *
        <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
          required style={{ width: '100%', padding: '0.4rem' }} />
      </label>
      <label>
        Team zuweisen
        <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}
          style={{ width: '100%', padding: '0.4rem' }}>
          <option value="">-- Kein Team --</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name || `Team ${t.id}`}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Erstellen
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the ExtraJobs page**

```jsx
// client/src/pages/ExtraJobs.jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import ExtraJobForm from '../components/ExtraJobForm';

const STATUS_LABELS = { pending: 'Offen', in_progress: 'Laufend', done: 'Erledigt' };
const STATUS_COLORS = { pending: '#e2e8f0', in_progress: '#bee3f8', done: '#c6f6d5' };

export default function ExtraJobs() {
  const [jobs, setJobs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => { loadJobs(); }, [dateFilter]);

  async function loadJobs() {
    const url = dateFilter ? `/extra-jobs?date=${dateFilter}` : '/extra-jobs';
    const [j, t] = await Promise.all([
      api.get(url),
      dateFilter ? api.get(`/teams?date=${dateFilter}`) : Promise.resolve([]),
    ]);
    setJobs(j);
    setTeams(t);
  }

  async function handleCreate(form) {
    await api.post('/extra-jobs', form);
    setShowForm(false);
    loadJobs();
  }

  async function handleStatusChange(id, status) {
    await api.put(`/extra-jobs/${id}`, { status });
    loadJobs();
  }

  async function handleDelete(id) {
    if (!confirm('Zusatzauftrag wirklich loeschen?')) return;
    await api.delete(`/extra-jobs/${id}`);
    loadJobs();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Zusatzauftraege</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ padding: '0.4rem' }} />
          <button onClick={() => setShowForm(true)} style={{
            padding: '0.5rem 1rem', background: '#2b6cb0', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>+ Neuer Auftrag</button>
        </div>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f7fafc', borderRadius: '6px' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Neuer Zusatzauftrag</h2>
          <ExtraJobForm teams={teams} onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Datum</th>
            <th style={{ padding: '0.5rem' }}>Beschreibung</th>
            <th style={{ padding: '0.5rem' }}>Adresse</th>
            <th style={{ padding: '0.5rem' }}>Team</th>
            <th style={{ padding: '0.5rem' }}>Status</th>
            <th style={{ padding: '0.5rem' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.5rem' }}>{new Date(j.date).toLocaleDateString('de-DE')}</td>
              <td style={{ padding: '0.5rem' }}>{j.description}</td>
              <td style={{ padding: '0.5rem' }}>{j.address}</td>
              <td style={{ padding: '0.5rem' }}>
                {j.team_name || '—'}
                {j.team_members?.[0]?.name && ` (${j.team_members.map(m => m.name).join(', ')})`}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <span style={{
                  padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.8rem',
                  background: STATUS_COLORS[j.status],
                }}>{STATUS_LABELS[j.status]}</span>
              </td>
              <td style={{ padding: '0.5rem' }}>
                {j.status !== 'done' && (
                  <button onClick={() => handleStatusChange(j.id, 'done')}
                    style={{ marginRight: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>Erledigt</button>
                )}
                <button onClick={() => handleDelete(j.id)}
                  style={{ color: 'red', cursor: 'pointer', fontSize: '0.85rem' }}>Loeschen</button>
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>Keine Zusatzauftraege</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Add route and nav**

In `client/src/App.jsx`:
```jsx
import ExtraJobs from './pages/ExtraJobs';
// Add route:
<Route path="extra-jobs" element={<ExtraJobs />} />
```

In `client/src/components/Layout.jsx` navItems:
```js
{ path: '/extra-jobs', label: 'Zusatzauftraege' },
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/ExtraJobs.jsx client/src/components/ExtraJobForm.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: extra jobs page with CRUD, status tracking, and team assignment"
```

---

### Task 14: Final Integration — Wire Everything Together

**Files:**
- Verify: `src/app.js` has all routes registered
- Verify: `client/src/App.jsx` has all routes
- Verify: `client/src/components/Layout.jsx` has all nav items

- [ ] **Step 1: Verify app.js has all Module 2 routes**

Final `src/app.js` should have these imports and routes added:
```js
import propertiesRouter from './routes/properties.js';
import teamsRouter from './routes/teams.js';
import tasksRouter from './routes/tasks.js';
import extraJobsRouter from './routes/extraJobs.js';

app.use('/api/properties', requireAuth, propertiesRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/extra-jobs', requireAuth, extraJobsRouter);
```

- [ ] **Step 2: Verify client App.jsx has all routes**

Should include:
```jsx
<Route path="properties" element={<Properties />} />
<Route path="daily-tasks" element={<DailyTasks />} />
<Route path="extra-jobs" element={<ExtraJobs />} />
```

- [ ] **Step 3: Verify Layout.jsx nav items**

Should include:
```js
{ path: '/properties', label: 'Objekte' },
{ path: '/daily-tasks', label: 'Tagesansicht' },
{ path: '/extra-jobs', label: 'Zusatzauftraege' },
```

- [ ] **Step 4: Add uploads to .gitignore**

```
uploads/
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All pure-function tests pass (timeCalculation + taskScheduling). DB-dependent tests fail with ECONNREFUSED (expected).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: Module 2 (Task Scheduling) complete — properties, teams, daily tasks, extra jobs"
```

---

## Spec Coverage Checklist

| Requirement | Task |
|---|---|
| Properties with address, city, standard_tasks, assigned_weekday | Task 1, 2, 11 |
| Flexible teams (ad-hoc daily creation) | Task 3, 12 |
| Task assignment to teams | Task 5, 12 |
| Workers receive task list via WhatsApp | Task 7, 10 |
| Mark done with photo (Erledigt) | Task 8, 9 |
| Mark not possible (Nicht moeglich) with reason | Task 8, 9 |
| Live daily dashboard | Task 12 |
| Reassign jobs mid-day | Task 5, 12 |
| Carryover unfinished tasks to next day | Task 4, 5, 12 |
| Postpone tasks with reason | Task 4, 5, 12 |
| Extra jobs (non-contracted) | Task 6, 13 |
| Extra jobs with photo and time in/out | Task 6, 13 |
| WhatsApp updates when tasks assigned/removed | Task 7 |
| Halil notified of postponements | Task 7 |
| Photo upload and storage | Task 8, 9 |
