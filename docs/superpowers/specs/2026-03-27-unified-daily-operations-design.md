# Unified Daily Operations — Design Spec

Replaces the separate Daily Plan and Daily Tasks pages with a single automated workflow.

## Problem

Two parallel systems exist for the same job — "who does what today":
- **Daily Plan** (`daily_plans` + `plan_assignments`): assigns properties to individual workers
- **Daily Tasks** (`task_assignments` + `teams`): generates tasks from property schedules, assigns to manually-created teams

They use separate tables, separate notifications, separate status flows. The teams concept adds manual overhead that defeats automation.

## Solution

Extend `plan_assignments` to include task-level tracking. Drop the teams concept entirely. Auto-assign 2 workers per property based on history and load. Generate the plan the evening before and send via WhatsApp.

---

## 1. Database Changes

### Extend `worker_role` enum

Add `'joker'` to the existing enum: `'field' | 'cleaning' | 'office' | 'joker'`

A joker is an office worker who substitutes for sick field workers. When activated, they check in/out like a normal field worker for that day.

### Extend `plan_assignments`

Add columns:

| Column | Type | Purpose |
|--------|------|---------|
| `task_name` | VARCHAR(255) | From `property_tasks.task_name` |
| `worker_role` | worker_role_enum | Which role this task needs |
| `status` | ENUM | `'pending'`, `'in_progress'`, `'done'`, `'postponed'`, `'carried_over'` |
| `postpone_reason` | VARCHAR(255) | Why it was postponed |
| `postponed_to` | DATE | New date for postponed task |
| `carried_from_id` | INTEGER FK | Points to original plan_assignment if carried over |
| `photo_url` | VARCHAR(500) | Completion evidence |
| `completed_at` | TIMESTAMPTZ | When task was marked done |

One row = 1 worker + 1 property + 1 task. A property with 3 tasks and 2 workers = 6 rows.

### Extend `daily_plans`

Add columns:

| Column | Type | Purpose |
|--------|------|---------|
| `auto_approved` | BOOLEAN DEFAULT FALSE | Was this auto-approved? |
| `scheduled_send_at` | TIMESTAMPTZ | When to auto-send (19:00 day before) |

### Tables retired (no new writes, keep data)

- `teams`
- `team_members`
- `task_assignments`

---

## 2. Plan Generation Logic

Unified `generateDailyPlan(dateStr)` replaces both `generateDraftPlan` and `generateDailyTasks`.

### Step 1 — Find what needs to be done

- Query all active `property_tasks`
- For each, run `shouldTaskRunOnDate(task, property, dateStr)` (from Spec 2)
- Result: list of `(property, task_name, worker_role)` tuples for the day

### Step 2 — Find who's available

- Get active workers with `worker_role IN ('field', 'cleaning')` — not office, not joker
- Exclude workers on sick leave or vacation for that date
- Load `worker_preferences` (max_properties_per_day, preferred_properties)

### Step 3 — Auto-assign 2 workers per property

- Group tasks by property (all tasks at a property go to the same 2 workers)
- For each property, pick 2 workers:
  1. Prefer workers with **history** at this property (from past `plan_assignments`)
  2. Among those, pick workers with **fewest assignments** today
  3. Respect `max_properties_per_day` cap
  4. If not enough workers with history, fill from least-loaded available workers
- Create one `plan_assignment` row per worker x task at that property

### Step 4 — Handle gaps

- Property can't get 2 workers → assign 1
- Property can't get any worker → flag as `unassigned` (shown to Halil in review)

### Step 5 — Carryover (runs before generation)

- Check previous day's `plan_assignments` with status `pending` or `in_progress`
- Create new assignments on today with `carried_from_id` pointing to the original
- Mark originals as `carried_over`

### Sick worker flow (triggered by sick leave entry)

1. Find sick worker's assignments for today
2. Reassign to other available field/cleaning workers (same priority logic)
3. If not enough workers → check for jokers
4. 1 joker available → auto-activate, assign properties, WhatsApp notification
5. 2+ jokers → WhatsApp Halil with options, he picks

---

## 3. Approval & Notification Flow

### Evening cron (~19:00, day before)

1. `generateDailyPlan(tomorrow)` creates plan with status `draft`
2. **Manual mode** (default): Halil gets WhatsApp summary:
   ```
   Tagesplan fur Dienstag, 31.03.2026

   Ahmed: Musterstr. 5, Hauptstr. 12 (4 Aufgaben)
   Ali: Musterstr. 5, Parkweg 3 (5 Aufgaben)
   Fatih: Parkweg 3, Ringstr. 8 (3 Aufgaben)

   1 Objekt nicht zugewiesen

   [Genehmigen] [Bearbeiten]
   ```
3. Halil clicks **Genehmigen** → plan approved → WhatsApp to each worker:
   ```
   Deine Aufgaben fur Dienstag, 31.03.2026

   1. Musterstr. 5, Berlin — Treppenhausreinigung, Mulltonnen
   2. Hauptstr. 12, Berlin — Winterdienst
   ```
4. **Auto mode**: If enabled, skip Halil — auto-approve at 19:00 and send directly

### Morning cron (day-of)

1. Carry over unfinished tasks from yesterday
2. Check for sick workers → redistribute + activate jokers if needed
3. No more separate task generation or team-based notifications

### Day-of changes

- Halil reassigns a worker after approval → affected workers get updated WhatsApp
- Joker activation sends: "Du wirst heute als Vertretung eingesetzt" + task list

---

## 4. Frontend — Unified Daily Operations Page

**Route:** `/daily-operations` (replaces `/daily-plan` and `/daily-tasks`)

### Layout

- **Header**: Title, date picker with arrow nav, settings gear (auto-mode toggle)
- **Status bar**: Draft / Approved / Auto-approved with timestamp, approve button if draft
- **Worker cards**: One card per worker, showing:
  - Worker name
  - Properties grouped, each showing partner name ("mit Ali")
  - Tasks under each property with status indicator (pending/in_progress/done)
  - Reassign dropdown (while in draft status)
- **Unassigned section** (red): Properties with no workers, dropdown to assign
- **Carried over section**: Tasks rolled from previous days with original date shown

### Interactions

- Reassign a property's tasks to a different worker (dropdown, draft only)
- Approve plan → sends WhatsApp
- Postpone a task → enter reason + new date
- Live task status updates during the day
- Toggle auto-approve mode via settings

---

## 5. Command Center Impact

Minimal changes — Command Center already reads `plan_assignments` and `time_entries`.

**What stays:** Worker status derivation, time entry monitoring, alerts, timeline view.

**What changes:**
- Stats count tasks completed, not just properties
- Progress shows "Ahmed: 3/5 tasks done" instead of "2/3 properties done"
- Carried-over tasks show as separate alert category

---

## 6. What Gets Retired

### Pages removed

- `/daily-tasks` → replaced by `/daily-operations`
- `/daily-plan` → replaced by `/daily-operations`

### Backend retired

- `api/_handlers/tasks/daily.js`
- `api/_handlers/tasks/generate.js`
- `api/_handlers/tasks/carryover.js`
- `api/_handlers/tasks/[id]/assign.js`
- `api/_handlers/teams/index.js`
- `taskNotifications.js` → merged into `planNotifications.js`

### Tables retired (no new writes)

- `teams`, `team_members`, `task_assignments`

### Cron changes

**Before:**
```
Morning: carryOver → redistributeSick → generateTasks → sendTaskLists
```

**After:**
```
Evening (19:00): generateDailyPlan(tomorrow) → notify Halil or auto-approve+send
Morning: carryOver → redistributeSick
```
