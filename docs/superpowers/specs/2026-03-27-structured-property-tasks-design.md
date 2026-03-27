# Spec 2: Structured Property Tasks

**Date:** 2026-03-27
**Status:** Draft
**Part of:** Worker Roles → Structured Property Tasks → Stundenkonto (3-spec series)
**Depends on:** Spec 1 (Worker Roles) — completed

## Summary

Replace the free-text `standard_tasks` field on properties with a `property_tasks` table. Each task has a name, worker role, and flexible schedule. This enables role-based task assignment: cleaning tasks go only to cleaning workers, facility tasks to field workers. The PropertyForm gets an inline task list for creating/managing tasks alongside the property.

## Motivation

- The current `standard_tasks` is a free-text field with no structure — can't filter by role, can't schedule individually
- Cleaning tasks (done by Marwa) have different schedules: some weekly, some bi-weekly, some monthly
- The daily plan needs to know which tasks belong to which worker role
- Properties like "Otto Hahn Ring 15" may need both field workers (facility) and cleaning workers (Reinigung) — each with different schedules

## Database Changes

### New table: `property_tasks`

```sql
CREATE TABLE property_tasks (
  id                  SERIAL PRIMARY KEY,
  property_id         INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  task_name           VARCHAR(255) NOT NULL,
  worker_role         VARCHAR(20) NOT NULL CHECK (worker_role IN ('field', 'cleaning', 'office')),
  schedule_type       VARCHAR(20) NOT NULL DEFAULT 'property_default'
                      CHECK (schedule_type IN ('property_default', 'weekly', 'biweekly', 'monthly')),
  schedule_day        INTEGER,          -- weekday (0-6) for weekly/biweekly, day of month (1-31) for monthly
  biweekly_start_date DATE,             -- reference date for biweekly: which week is "on"
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_tasks_property ON property_tasks(property_id);
```

**Schedule types:**
- `property_default` — uses the property's `assigned_weekday`. No `schedule_day` needed. Most field worker tasks use this.
- `weekly` — runs every week on `schedule_day` (0=Sunday to 6=Saturday)
- `biweekly` — runs every 2 weeks on `schedule_day`, starting from `biweekly_start_date`
- `monthly` — runs on day `schedule_day` (1-31) of each month

### Modified table: `task_assignments`

Add column:
```sql
ALTER TABLE task_assignments ADD COLUMN worker_role VARCHAR(20) DEFAULT 'field';
```

This lets the system know which worker role should handle each generated task assignment.

### Existing column: `standard_tasks`

The `properties.standard_tasks` column is **kept but no longer used by code**. It remains as a reference during transition. Can be dropped in a future cleanup.

The `properties.assigned_weekday` column is **unchanged** — it remains the default day for field worker tasks.

## Data Migration

Split existing `standard_tasks` text into individual `property_tasks` records, all with `worker_role: 'field'` and `schedule_type: 'property_default'`.

### Splitting rules

| standard_tasks value | Expands to |
|---|---|
| `alles` | Treppenhausreinigung, Außenanlage, Mülltonnen |
| `alles, Aschebox` | Treppenhausreinigung, Außenanlage, Mülltonnen, Aschebox |
| `alles, Liste aufhängen` | Treppenhausreinigung, Außenanlage, Mülltonnen, Liste aufhängen |
| `alles, Salztabletten` | Treppenhausreinigung, Außenanlage, Mülltonnen, Salztabletten |
| `Außenanlagen und Müll` | Außenanlage, Mülltonnen |
| `nur Tonnendienst` | Mülltonnen |
| `start 1.4.2026` | *(skip — note, not a task)* |
| `TH reinigen` | Treppenhausreinigung |
| `TH reinigen, Außenanlage` | Treppenhausreinigung, Außenanlage |
| `TH reinigen, Therapieraum Wasser WC` | Treppenhausreinigung, Therapieraum Wasser WC |

All migrated tasks get: `worker_role = 'field'`, `schedule_type = 'property_default'`, `schedule_day = NULL`.

## API Changes

### Properties endpoints (modified)

- **`GET /properties`** — returns each property with its `property_tasks` array (joined query or separate fetch)
- **`POST /properties`** — accepts a `tasks` array in the body. After creating the property, inserts each task into `property_tasks`.
- **`PUT /properties/{id}`** — accepts a `tasks` array. Syncs tasks: deletes removed tasks, updates existing, inserts new.

### New endpoint: `GET /properties/{id}/tasks`

Returns the tasks for a specific property. Used when the PropertyForm loads for editing.

### Task generation (modified)

- **`POST /tasks/generate`** — reads from `property_tasks` instead of `properties.standard_tasks`. For each matching task on the given date, creates a `task_assignment` with the task's `worker_role`.

## Task Generation Logic

For a given date, find all active `property_tasks` that should run:

1. **`property_default`**: date's weekday matches `properties.assigned_weekday`
2. **`weekly`**: date's weekday matches `property_tasks.schedule_day`
3. **`biweekly`**: date's weekday matches `schedule_day` AND the week number (since `biweekly_start_date`) is even
4. **`monthly`**: date's day-of-month matches `schedule_day`

For each matching task:
```sql
INSERT INTO task_assignments (property_id, date, task_description, worker_role, status)
VALUES (property_id, date, task_name, worker_role, 'pending')
```

**Duplicate prevention**: same as current — check if a task_assignment already exists for this property + date + task_description before inserting.

## Frontend Changes

### PropertyForm (`client/src/components/PropertyForm.jsx`)

Replace the `standard_tasks` text input with an inline task list.

**Form layout:**
```
Address: [___________]    City: [___________]
Assigned Weekday: [Monday ▼]

── Tasks ──────────────────────────────────────────
| Task Name            | Role         | Schedule             | ✕ |
| Treppenhausreinigung | Field ▼      | Property default ▼   |   |
| Büroreinigung        | Cleaning ▼   | Weekly ▼  Day: Mon ▼ |   |
| Fensterreinigung     | Cleaning ▼   | Bi-weekly ▼ Day: Tue ▼ Start: [date] |   |

[+ Add Task]
────────────────────────────────────────────────────

[Save]  [Cancel]
```

**Each task row:**
- Task name: text input
- Worker role: dropdown (Field / Cleaning / Office)
- Schedule type: dropdown (Property Default / Weekly / Bi-weekly / Monthly)
- Schedule day: conditional — weekday dropdown for weekly/biweekly, number input (1-31) for monthly. Hidden for `property_default`.
- Biweekly start date: date picker, only shown when schedule_type = biweekly
- Delete button (✕)

**Behavior:**
- "+ Add Task" adds a row with defaults: empty name, `field` role, `property_default` schedule
- Tasks are submitted as part of the property form (single save)
- When editing, existing tasks are loaded from API
- Empty task names are ignored on save

### Properties Page (`client/src/pages/Properties.jsx`)

- The `standard_tasks` column in the table now shows the count of tasks (e.g., "3 tasks") or a comma-separated list of task names
- No other changes to the properties list page

### Translations

New keys needed:
- `properties.tasks` — "Aufgaben" / "Tasks"
- `properties.addTask` — "Aufgabe hinzufügen" / "Add Task"
- `properties.taskName` — "Aufgabe" / "Task"
- `properties.schedule` — "Zeitplan" / "Schedule"
- `properties.scheduleDefault` — "Objekt-Tag" / "Property Default"
- `properties.scheduleWeekly` — "Wöchentlich" / "Weekly"
- `properties.scheduleBiweekly` — "Alle 2 Wochen" / "Every 2 Weeks"
- `properties.scheduleMonthly` — "Monatlich" / "Monthly"
- `properties.scheduleDay` — "Tag" / "Day"
- `properties.biweeklyStart` — "Startdatum" / "Start Date"
- `properties.dayOfMonth` — "Tag des Monats" / "Day of Month"

## What Stays the Same

- `properties.assigned_weekday` — unchanged, still the default day for field worker tasks
- `properties.photo_required` — unchanged
- Daily plan generation — still assigns workers to properties (not individual tasks)
- Garbage scheduling — separate system, unchanged
- Teams and team assignments — unchanged
- Command center, analytics, accountability — unchanged

## Files to Modify

| File | Change |
|------|--------|
| `src/db/migrations/010-property-tasks.sql` | New migration: create table, migrate data |
| `api/_handlers/properties/index.js` | Return tasks with properties, accept tasks in POST |
| `api/_handlers/properties/[id].js` | Accept tasks in PUT, sync task records |
| `src/services/taskScheduling.js` | Read from `property_tasks`, support schedule types |
| `client/src/components/PropertyForm.jsx` | Inline task list UI |
| `client/src/pages/Properties.jsx` | Show task count/names in table |
| `client/src/i18n/translations.js` | New keys for task UI |
| `tests/helpers.js` | Add `createTestPropertyTask` helper |
| `tests/services/taskScheduling.test.js` | Update tests for new generation logic |

## Future (Spec 3)

- **Spec 3: Stundenkonto** — dedicated page for tracking official vs. surplus hours per worker, with historical view and payout/carry-over options
