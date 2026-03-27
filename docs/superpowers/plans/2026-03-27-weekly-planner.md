# Weekly Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly calendar-grid page showing all scheduled work (field, cleaning, garbage, extra jobs) with history/forecast modes, filters, and status indicators.

**Architecture:** Single API endpoint returns a week of data with per-day mode detection (history/today/forecast). The frontend renders a Mon–Fri grid with color-coded task cards, client-side filtering, and week navigation.

**Tech Stack:** React 18 + React Router (frontend), Node.js serverless function with `pg` (backend), CSS (styling)

---

### Task 1: API Handler — Weekly Planner Endpoint

**Files:**
- Create: `api/_handlers/weekly-planner/index.js`
- Modify: `api/index.js` (add route)

- [ ] **Step 1: Create the handler file**

Create `api/_handlers/weekly-planner/index.js`:

```js
import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

// Helpers
function getMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function getWeekDates(mondayDate) {
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayDate);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(toDateStr(d));
  }
  return dates;
}

function getCalendarWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const dayOfYear = Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1;
  const jan4DayOfWeek = jan4.getUTCDay() || 7;
  const weekNum = Math.ceil((dayOfYear + jan4DayOfWeek - 1) / 7);
  return weekNum;
}

function isBiweeklyActive(targetDateStr, biweeklyStartDateStr) {
  const target = new Date(targetDateStr + 'T00:00:00Z');
  const start = new Date(biweeklyStartDateStr + 'T00:00:00Z');
  const diffWeeks = Math.floor((target - start) / (7 * 86400000));
  return diffWeeks % 2 === 0;
}

async function getHistoryTasks(dates) {
  const tasks = {};
  for (const d of dates) tasks[d] = [];

  // Plan assignments (field, cleaning tasks)
  const { rows: planRows } = await pool.query(
    `SELECT pa.status, pa.task_name, pa.worker_role, pa.postpone_reason, pa.postponed_to,
            dp.plan_date, w.name AS worker_name, w.id AS worker_id,
            p.address AS property_address, p.id AS property_id
     FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE dp.plan_date = ANY($1)
     ORDER BY dp.plan_date, pa.assignment_order`,
    [dates]
  );
  for (const row of planRows) {
    const dateKey = toDateStr(new Date(row.plan_date));
    if (!tasks[dateKey]) continue;
    const status = row.status === 'done' ? 'done'
      : row.status === 'postponed' ? 'postponed'
      : row.status === 'in_progress' ? 'in_progress'
      : 'missed';
    tasks[dateKey].push({
      type: row.worker_role === 'cleaning' ? 'cleaning' : 'field',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_name || 'Aufgabe',
      worker_name: row.worker_name,
      worker_id: row.worker_id,
      status,
      postponed_to: row.postponed_to ? toDateStr(new Date(row.postponed_to)) : null,
    });
  }

  // Garbage tasks
  const { rows: garbageRows } = await pool.query(
    `SELECT gt.status, gt.due_date, gt.task_type,
            gs.trash_type, gs.collection_date,
            p.address AS property_address, p.id AS property_id
     FROM garbage_tasks gt
     JOIN garbage_schedules gs ON gs.id = gt.garbage_schedule_id
     JOIN properties p ON p.id = gs.property_id
     WHERE gt.due_date = ANY($1)
     ORDER BY gt.due_date, p.address`,
    [dates]
  );
  for (const row of garbageRows) {
    const dateKey = toDateStr(new Date(row.due_date));
    if (!tasks[dateKey]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    const action = row.task_type === 'raus' ? 'raus' : 'rein';
    tasks[dateKey].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} ${action}`,
      worker_name: null,
      worker_id: null,
      status: row.status === 'done' ? 'done' : 'missed',
    });
  }

  // Extra jobs (task_assignments table)
  const { rows: extraRows } = await pool.query(
    `SELECT ta.date, ta.task_description, ta.status,
            p.address AS property_address, p.id AS property_id
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.date = ANY($1)
     ORDER BY ta.date, p.address`,
    [dates]
  );
  for (const row of extraRows) {
    const dateKey = toDateStr(new Date(row.date));
    if (!tasks[dateKey]) continue;
    const status = row.status === 'done' ? 'done'
      : row.status === 'postponed' ? 'postponed'
      : row.status === 'in_progress' ? 'in_progress'
      : 'missed';
    tasks[dateKey].push({
      type: 'extra',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_description || 'Zusatzauftrag',
      worker_name: null,
      worker_id: null,
      status,
    });
  }

  return tasks;
}

async function getForecastTasks(dates) {
  const tasks = {};
  for (const d of dates) tasks[d] = [];

  // Property tasks based on schedule rules
  const { rows: ptRows } = await pool.query(
    `SELECT pt.schedule_type, pt.schedule_day, pt.biweekly_start_date,
            pt.task_name, pt.worker_role,
            p.address AS property_address, p.id AS property_id,
            p.assigned_weekday
     FROM property_tasks pt
     JOIN properties p ON p.id = pt.property_id
     WHERE pt.is_active = true AND p.is_active = true`
  );

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...
    const dayOfMonth = d.getUTCDate();

    for (const pt of ptRows) {
      let matches = false;

      if (pt.schedule_type === 'property_default') {
        // Use the property's assigned_weekday
        matches = pt.assigned_weekday === dayOfWeek;
      } else if (pt.schedule_type === 'weekly') {
        matches = pt.schedule_day === dayOfWeek;
      } else if (pt.schedule_type === 'biweekly') {
        matches = pt.schedule_day === dayOfWeek
          && pt.biweekly_start_date
          && isBiweeklyActive(dateStr, toDateStr(new Date(pt.biweekly_start_date)));
      } else if (pt.schedule_type === 'monthly') {
        matches = pt.schedule_day === dayOfMonth;
      }

      if (matches) {
        tasks[dateStr].push({
          type: pt.worker_role === 'cleaning' ? 'cleaning' : 'field',
          property_id: pt.property_id,
          property_address: pt.property_address,
          task_name: pt.task_name,
          worker_name: null,
          worker_id: null,
          status: null,
        });
      }
    }
  }

  // Garbage schedules for future dates
  const { rows: gsRows } = await pool.query(
    `SELECT gs.collection_date, gs.trash_type,
            p.address AS property_address, p.id AS property_id
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = ANY($1)
     ORDER BY gs.collection_date, p.address`,
    [dates]
  );
  for (const row of gsRows) {
    const dateKey = toDateStr(new Date(row.collection_date));
    if (!tasks[dateKey]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    // For forecast, show both raus (day before) and rein (collection day)
    tasks[dateKey].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} rein`,
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  // Also check day-before for "raus" tasks
  const nextDays = dates.map(d => {
    const next = new Date(d + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    return toDateStr(next);
  });
  const { rows: rausRows } = await pool.query(
    `SELECT gs.collection_date, gs.trash_type,
            p.address AS property_address, p.id AS property_id
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = ANY($1)
     ORDER BY gs.collection_date, p.address`,
    [nextDays]
  );
  for (const row of rausRows) {
    const collectionDate = toDateStr(new Date(row.collection_date));
    // The "raus" task is the day before collection
    const rausDate = new Date(collectionDate + 'T00:00:00Z');
    rausDate.setUTCDate(rausDate.getUTCDate() - 1);
    const rausDateStr = toDateStr(rausDate);
    if (!tasks[rausDateStr]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    tasks[rausDateStr].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} raus`,
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  // Extra jobs with future dates
  const { rows: extraRows } = await pool.query(
    `SELECT ta.date, ta.task_description,
            p.address AS property_address, p.id AS property_id
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.date = ANY($1)
     ORDER BY ta.date, p.address`,
    [dates]
  );
  for (const row of extraRows) {
    const dateKey = toDateStr(new Date(row.date));
    if (!tasks[dateKey]) continue;
    tasks[dateKey].push({
      type: 'extra',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_description || 'Zusatzauftrag',
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  return tasks;
}

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const todayStr = toDateStr(new Date());
  const weekStartParam = req.query.week_start || todayStr;
  const monday = getMonday(weekStartParam);
  const mondayStr = toDateStr(monday);
  const weekDates = getWeekDates(monday);
  const fridayStr = weekDates[4];

  // Check 8-week forecast limit
  const maxForecast = new Date(todayStr + 'T00:00:00Z');
  maxForecast.setUTCDate(maxForecast.getUTCDate() + 56);
  if (new Date(mondayStr + 'T00:00:00Z') > maxForecast) {
    return res.json({
      week_start: mondayStr,
      week_end: fridayStr,
      calendar_week: getCalendarWeek(mondayStr),
      days: Object.fromEntries(weekDates.map(d => [d, { mode: 'forecast', tasks: [] }])),
    });
  }

  // Split dates into history and forecast
  const historyDates = weekDates.filter(d => d <= todayStr);
  const forecastDates = weekDates.filter(d => d > todayStr);

  const [historyTasks, forecastTasks] = await Promise.all([
    historyDates.length > 0 ? getHistoryTasks(historyDates) : {},
    forecastDates.length > 0 ? getForecastTasks(forecastDates) : {},
  ]);

  const days = {};
  for (const d of weekDates) {
    if (d === todayStr) {
      days[d] = { mode: 'today', tasks: historyTasks[d] || [] };
    } else if (d < todayStr) {
      days[d] = { mode: 'history', tasks: historyTasks[d] || [] };
    } else {
      days[d] = { mode: 'forecast', tasks: forecastTasks[d] || [] };
    }
  }

  res.json({
    week_start: mondayStr,
    week_end: fridayStr,
    calendar_week: getCalendarWeek(mondayStr),
    days,
  });
});
```

- [ ] **Step 2: Register the route in the API router**

In `api/index.js`, add the import at the top with the other imports:

```js
import weeklyPlannerHandler from './_handlers/weekly-planner/index.js';
```

Add to the `routes` array (before the `// Command Center` comment):

```js
  // Weekly Planner
  ['weekly-planner', weeklyPlannerHandler],
```

- [ ] **Step 3: Verify the handler loads without errors**

Run: `node -e "import('./api/_handlers/weekly-planner/index.js').then(() => console.log('OK')).catch(e => console.error(e))"`

Expected: `OK` (or a pg connection error which is fine — it means the module loaded)

- [ ] **Step 4: Commit**

```bash
git add api/_handlers/weekly-planner/index.js api/index.js
git commit -m "feat: add weekly-planner API endpoint with history/forecast modes"
```

---

### Task 2: Translation Keys

**Files:**
- Modify: `client/src/i18n/translations.js`

- [ ] **Step 1: Add German translation keys**

Add these keys inside the `de` object (after the existing `nav.*` keys):

```js
    'nav.weeklyPlanner': 'Wochenplaner',

    // Weekly Planner page
    'weeklyPlanner.title': 'Wochenplaner',
    'weeklyPlanner.today': 'Heute',
    'weeklyPlanner.forecast': 'Prognose',
    'weeklyPlanner.history': 'VERLAUF',
    'weeklyPlanner.forecastBadge': 'PROGNOSE',
    'weeklyPlanner.currentBadge': 'AKTUELL',
    'weeklyPlanner.allProperties': 'Alle Objekte',
    'weeklyPlanner.allWorkers': 'Alle Mitarbeiter',
    'weeklyPlanner.field': 'Außendienst',
    'weeklyPlanner.cleaning': 'Reinigung',
    'weeklyPlanner.garbage': 'Müll',
    'weeklyPlanner.extra': 'Zusatz',
    'weeklyPlanner.done': 'Erledigt',
    'weeklyPlanner.postponed': 'Verschoben',
    'weeklyPlanner.missed': 'Verpasst',
    'weeklyPlanner.inProgress': 'In Arbeit',
    'weeklyPlanner.noTasks': 'Keine Aufgaben',
    'weeklyPlanner.dashedHint': 'Gestrichelte Rahmen = Prognose (keine Mitarbeiter zugewiesen)',
    'weeklyPlanner.postponedTo': 'verschoben auf',
```

- [ ] **Step 2: Add English translation keys**

Add these keys inside the `en` object:

```js
    'nav.weeklyPlanner': 'Weekly Planner',

    'weeklyPlanner.title': 'Weekly Planner',
    'weeklyPlanner.today': 'Today',
    'weeklyPlanner.forecast': 'Forecast',
    'weeklyPlanner.history': 'HISTORY',
    'weeklyPlanner.forecastBadge': 'FORECAST',
    'weeklyPlanner.currentBadge': 'CURRENT',
    'weeklyPlanner.allProperties': 'All Properties',
    'weeklyPlanner.allWorkers': 'All Workers',
    'weeklyPlanner.field': 'Field',
    'weeklyPlanner.cleaning': 'Cleaning',
    'weeklyPlanner.garbage': 'Garbage',
    'weeklyPlanner.extra': 'Extra',
    'weeklyPlanner.done': 'Done',
    'weeklyPlanner.postponed': 'Postponed',
    'weeklyPlanner.missed': 'Missed',
    'weeklyPlanner.inProgress': 'In Progress',
    'weeklyPlanner.noTasks': 'No tasks',
    'weeklyPlanner.dashedHint': 'Dashed borders = Forecast (no workers assigned)',
    'weeklyPlanner.postponedTo': 'postponed to',
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/translations.js
git commit -m "feat: add weekly planner translation keys (DE/EN)"
```

---

### Task 3: CSS Styles

**Files:**
- Create: `client/src/styles/weekly-planner.css`

- [ ] **Step 1: Create the stylesheet**

Create `client/src/styles/weekly-planner.css`:

```css
/* Weekly Planner */
.weekly-planner {
  padding: 1.5rem;
}

.weekly-planner .top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.weekly-planner .week-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.weekly-planner .week-nav button {
  padding: 0.25rem 0.6rem;
}

.weekly-planner .week-label {
  font-weight: 700;
  font-size: 1.05rem;
}

.weekly-planner .mode-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.weekly-planner .mode-badge.history {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.weekly-planner .mode-badge.forecast {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.weekly-planner .mode-badge.current {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

/* Filter bar */
.weekly-planner .filter-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0;
  margin-bottom: 1rem;
  border-top: 1px solid var(--border-default);
  border-bottom: 1px solid var(--border-default);
  flex-wrap: wrap;
  font-size: 0.8rem;
}

.weekly-planner .filter-bar .filter-label {
  color: var(--text-muted);
  margin-right: 0.25rem;
  font-size: 0.75rem;
}

.weekly-planner .type-pill {
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid;
  user-select: none;
  transition: opacity 0.15s;
}

.weekly-planner .type-pill.inactive {
  opacity: 0.35;
}

.weekly-planner .type-pill.field { background: rgba(59, 130, 246, 0.1); border-color: #3b82f6; color: #60a5fa; }
.weekly-planner .type-pill.cleaning { background: rgba(34, 197, 94, 0.1); border-color: #22c55e; color: #4ade80; }
.weekly-planner .type-pill.garbage { background: rgba(168, 85, 247, 0.1); border-color: #a855f7; color: #c084fc; }
.weekly-planner .type-pill.extra { background: rgba(234, 179, 8, 0.1); border-color: #eab308; color: #facc15; }

.weekly-planner .filter-sep {
  width: 1px;
  height: 18px;
  background: var(--border-default);
  margin: 0 0.25rem;
}

.weekly-planner .filter-bar select {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  color: var(--text-primary);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

/* Calendar grid */
.weekly-planner .calendar-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
}

.weekly-planner .day-column {
  border-right: 1px solid var(--border-default);
}

.weekly-planner .day-column:last-child {
  border-right: none;
}

.weekly-planner .day-header {
  font-weight: 700;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-secondary);
  text-align: center;
  font-size: 0.85rem;
}

.weekly-planner .day-header.today {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.weekly-planner .day-header .forecast-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: 0.25rem;
}

.weekly-planner .day-body {
  padding: 0.5rem;
  min-height: 120px;
}

.weekly-planner .day-body.today-bg {
  background: rgba(59, 130, 246, 0.03);
}

.weekly-planner .day-body.forecast-bg {
  opacity: 0.7;
}

/* Task cards */
.weekly-planner .task-card {
  padding: 0.4rem 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.4rem;
  border-left: 3px solid;
  font-size: 0.75rem;
  border-width: 1px;
  border-left-width: 3px;
}

.weekly-planner .task-card.field {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(30, 58, 95, 0.6);
  border-left-color: #3b82f6;
}

.weekly-planner .task-card.cleaning {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(22, 101, 52, 0.6);
  border-left-color: #22c55e;
}

.weekly-planner .task-card.garbage {
  background: rgba(168, 85, 247, 0.08);
  border-color: rgba(76, 29, 149, 0.6);
  border-left-color: #a855f7;
}

.weekly-planner .task-card.extra {
  background: rgba(234, 179, 8, 0.08);
  border-color: rgba(146, 64, 14, 0.6);
  border-left-color: #eab308;
}

.weekly-planner .task-card.forecast-card {
  border-style: dashed;
  border-left-style: solid;
}

.weekly-planner .task-card .card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.weekly-planner .task-card .type-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  font-weight: 600;
}

.weekly-planner .task-card .type-label.field { color: #60a5fa; }
.weekly-planner .task-card .type-label.cleaning { color: #4ade80; }
.weekly-planner .task-card .type-label.garbage { color: #c084fc; }
.weekly-planner .task-card .type-label.extra { color: #facc15; }

.weekly-planner .task-card .status-icon { font-size: 0.7rem; }
.weekly-planner .task-card .status-icon.done { color: #22c55e; }
.weekly-planner .task-card .status-icon.postponed { color: #f59e0b; }
.weekly-planner .task-card .status-icon.missed { color: #ef4444; }
.weekly-planner .task-card .status-icon.in_progress { color: #3b82f6; }

.weekly-planner .task-card .property-name {
  font-weight: 600;
  margin: 0.15rem 0;
}

.weekly-planner .task-card .task-name {
  color: var(--text-muted);
  font-size: 0.7rem;
}

.weekly-planner .task-card .worker-name {
  font-size: 0.7rem;
  margin-top: 0.15rem;
}

.weekly-planner .task-card .worker-name.field { color: #60a5fa; }
.weekly-planner .task-card .worker-name.cleaning { color: #4ade80; }

.weekly-planner .task-card .postpone-note {
  font-size: 0.65rem;
  color: #f59e0b;
  margin-top: 0.15rem;
}

.weekly-planner .no-tasks {
  color: var(--text-muted);
  font-size: 0.75rem;
  text-align: center;
  padding: 1.5rem 0;
  font-style: italic;
}

/* Legend */
.weekly-planner .legend {
  display: flex;
  gap: 1rem;
  padding: 0.6rem 0;
  margin-top: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.weekly-planner .legend .dashed-hint {
  margin-left: auto;
}

@media (max-width: 900px) {
  .weekly-planner .calendar-grid {
    grid-template-columns: 1fr;
  }
  .weekly-planner .day-column {
    border-right: none;
    border-bottom: 1px solid var(--border-default);
  }
  .weekly-planner .day-column:last-child {
    border-bottom: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/styles/weekly-planner.css
git commit -m "feat: add weekly planner CSS styles"
```

---

### Task 4: Page Component

**Files:**
- Create: `client/src/pages/WeeklyPlanner.jsx`

- [ ] **Step 1: Create the WeeklyPlanner page component**

Create `client/src/pages/WeeklyPlanner.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import '../styles/weekly-planner.css';

const DAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_ICONS = {
  done: { icon: '✓', cls: 'done' },
  postponed: { icon: '⏸', cls: 'postponed' },
  missed: { icon: '✗', cls: 'missed' },
  in_progress: { icon: '⟳', cls: 'in_progress' },
};

const TYPE_KEYS = ['field', 'cleaning', 'garbage', 'extra'];

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtDE(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}.${m}.`;
}

function fmtFullDE(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export default function WeeklyPlanner() {
  const { t, lang } = useLang();
  const dayShort = lang === 'de' ? DAY_SHORT_DE : DAY_SHORT_EN;
  const todayStr = toDateStr(new Date());

  const [weekStart, setWeekStart] = useState(() => toDateStr(getMonday(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeTypes, setActiveTypes] = useState(new Set(TYPE_KEYS));
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [properties, setProperties] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Load properties and workers for filter dropdowns
  useEffect(() => {
    api.get('/properties').then(setProperties).catch(() => {});
    api.get('/workers').then(setWorkers).catch(() => {});
  }, []);

  // Load weekly data
  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/weekly-planner?week_start=${weekStart}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const navigateWeek = (offset) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(toDateStr(d));
  };

  const goToday = () => setWeekStart(toDateStr(getMonday(new Date())));

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Determine overall mode badge
  const overallMode = useMemo(() => {
    if (!data) return 'current';
    const modes = Object.values(data.days).map(d => d.mode);
    if (modes.every(m => m === 'forecast')) return 'forecast';
    if (modes.every(m => m === 'history')) return 'history';
    return 'current';
  }, [data]);

  // Collect unique workers/properties from data for smart filtering
  const filteredDays = useMemo(() => {
    if (!data) return {};
    const result = {};
    for (const [dateStr, day] of Object.entries(data.days)) {
      let tasks = day.tasks.filter(t => activeTypes.has(t.type));
      if (filterPropertyId) tasks = tasks.filter(t => String(t.property_id) === filterPropertyId);
      if (filterWorkerId) tasks = tasks.filter(t => String(t.worker_id) === filterWorkerId);
      result[dateStr] = { ...day, tasks };
    }
    return result;
  }, [data, activeTypes, filterPropertyId, filterWorkerId]);

  // Is the entire week in forecast? (hide worker filter)
  const hasHistoryDays = data && Object.values(data.days).some(d => d.mode !== 'forecast');

  // 8-week limit check
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 56);
  const isAtFutureLimit = new Date(weekStart + 'T00:00:00') >= maxDate;

  if (loading && !data) {
    return <div className="weekly-planner"><p>{t('weeklyPlanner.title')}...</p></div>;
  }

  if (error) {
    return <div className="weekly-planner"><p className="text-danger">{error}</p></div>;
  }

  if (!data) return null;

  const weekDates = Object.keys(data.days).sort();

  return (
    <div className="weekly-planner">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="week-nav">
          <button className="btn btn-sm btn-ghost" onClick={() => navigateWeek(-1)}>◀</button>
          <div className="week-label">
            KW {data.calendar_week} — {fmtFullDE(data.week_start)}–{fmtFullDE(data.week_end)}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => navigateWeek(1)} disabled={isAtFutureLimit}>▶</button>
          <button className="btn btn-sm btn-ghost" onClick={goToday}>{t('weeklyPlanner.today')}</button>
        </div>
        <span className={`mode-badge ${overallMode}`}>
          {overallMode === 'history' ? t('weeklyPlanner.history')
            : overallMode === 'forecast' ? t('weeklyPlanner.forecastBadge')
            : t('weeklyPlanner.currentBadge')}
        </span>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <span className="filter-label">Filter:</span>
        {TYPE_KEYS.map(type => (
          <span
            key={type}
            className={`type-pill ${type} ${activeTypes.has(type) ? '' : 'inactive'}`}
            onClick={() => toggleType(type)}
          >
            {activeTypes.has(type) ? '✓ ' : ''}{t(`weeklyPlanner.${type}`)}
          </span>
        ))}
        <span className="filter-sep" />
        <select value={filterPropertyId} onChange={e => setFilterPropertyId(e.target.value)}>
          <option value="">{t('weeklyPlanner.allProperties')}</option>
          {properties.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{p.address}</option>
          ))}
        </select>
        {hasHistoryDays && (
          <select value={filterWorkerId} onChange={e => setFilterWorkerId(e.target.value)}>
            <option value="">{t('weeklyPlanner.allWorkers')}</option>
            {workers.filter(w => w.is_active).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {weekDates.map(dateStr => {
          const day = filteredDays[dateStr];
          if (!day) return null;
          const d = new Date(dateStr + 'T00:00:00');
          const dayIdx = d.getDay();
          const isToday = dateStr === todayStr;
          const isForecast = day.mode === 'forecast';

          return (
            <div key={dateStr} className="day-column">
              <div className={`day-header ${isToday ? 'today' : ''}`}>
                {dayShort[dayIdx]} {fmtDE(dateStr)}
                {isToday && ' ● ' + t('weeklyPlanner.today')}
                {isForecast && !isToday && (
                  <span className="forecast-label">{t('weeklyPlanner.forecast')}</span>
                )}
              </div>
              <div className={`day-body ${isToday ? 'today-bg' : ''} ${isForecast ? 'forecast-bg' : ''}`}>
                {day.tasks.length === 0 ? (
                  <div className="no-tasks">{t('weeklyPlanner.noTasks')}</div>
                ) : (
                  day.tasks.map((task, i) => (
                    <div key={i} className={`task-card ${task.type} ${isForecast ? 'forecast-card' : ''}`}>
                      <div className="card-top">
                        <span className={`type-label ${task.type}`}>
                          {t(`weeklyPlanner.${task.type}`)}
                        </span>
                        {task.status && STATUS_ICONS[task.status] && (
                          <span className={`status-icon ${STATUS_ICONS[task.status].cls}`}>
                            {STATUS_ICONS[task.status].icon}
                          </span>
                        )}
                      </div>
                      <div className="property-name">{task.property_address}</div>
                      <div className="task-name">{task.task_name}</div>
                      {task.worker_name && (
                        <div className={`worker-name ${task.type}`}>{task.worker_name}</div>
                      )}
                      {task.status === 'postponed' && task.postponed_to && (
                        <div className="postpone-note">
                          → {t('weeklyPlanner.postponedTo')} {fmtDE(task.postponed_to)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="legend">
        <span><span className="status-icon done">✓</span> {t('weeklyPlanner.done')}</span>
        <span><span className="status-icon postponed">⏸</span> {t('weeklyPlanner.postponed')}</span>
        <span><span className="status-icon missed">✗</span> {t('weeklyPlanner.missed')}</span>
        <span><span className="status-icon in_progress">⟳</span> {t('weeklyPlanner.inProgress')}</span>
        <span className="dashed-hint">{t('weeklyPlanner.dashedHint')}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/WeeklyPlanner.jsx
git commit -m "feat: add WeeklyPlanner page component with filters and calendar grid"
```

---

### Task 5: Route and Sidebar Registration

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Add route to App.jsx**

Add the import at the top of `App.jsx`:

```js
import WeeklyPlanner from './pages/WeeklyPlanner';
```

Add the route inside the Layout route, after the `daily-operations` route:

```jsx
            <Route path="weekly-planner" element={<WeeklyPlanner />} />
```

- [ ] **Step 2: Add sidebar menu item to Layout.jsx**

In `Layout.jsx`, inside the `getNavSections` function, add a new item to the `operations` section (the third section), after the `daily-operations` item:

```jsx
        {
          path: '/weekly-planner', label: t('nav.weeklyPlanner'),
          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/><line x1="7" y1="10" x2="7" y2="22"/><line x1="11" y1="10" x2="11" y2="22"/><line x1="15" y1="10" x2="15" y2="22"/></svg>,
        },
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd client && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: register weekly-planner route and sidebar nav item"
```

---

### Task 6: Manual Smoke Test

- [ ] **Step 1: Start the dev server**

Run: `cd client && npx vite dev`

- [ ] **Step 2: Verify the page renders**

Open `http://localhost:5173/weekly-planner` in a browser. Verify:
- The calendar grid shows Mon–Fri columns
- Week navigation (◀ ▶) works and updates the KW label
- "Heute" button jumps back to current week
- Filter pills toggle on/off visually
- Property and worker dropdowns are populated
- Worker dropdown hides when viewing a full forecast week (navigate 2+ weeks forward)
- Task cards show with correct colors and status icons for past days
- Future days show dashed borders and no worker names
- The forward button disables beyond 8 weeks
- Today's column has the blue highlight
- Legend bar shows at the bottom

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: weekly planner smoke test fixes"
```
