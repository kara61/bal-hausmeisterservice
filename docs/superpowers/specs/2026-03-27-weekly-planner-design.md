# Weekly Planner — Design Spec

**Date:** 2026-03-27
**Route:** `/weekly-planner`
**Purpose:** A calendar-grid page for management to view the full week's workload across all properties, workers, and task types — with the ability to navigate into the past (history) and future (forecast).

---

## Core Concept

A Mon–Fri calendar grid (one column per day) showing all scheduled work: field tasks, cleaning tasks, garbage pickup/return, and extra jobs. The page has two modes determined by the date being viewed:

- **History mode** (past days): Shows completed `plan_assignments` and `garbage_tasks` data with worker names and status indicators.
- **Forecast mode** (future days): Shows predicted tasks derived from recurring `property_tasks` schedules and `garbage_schedules`, without worker names (since assignments haven't been made yet).
- **Current week** splits at today — past days show history, future days show forecast. Today itself shows current assignments from Daily Operations data.

---

## Data Sources

### History Mode (past days)
- `plan_assignments` joined with `daily_plans`, `workers`, `properties` — for field, cleaning, and carried-over tasks
- `garbage_tasks` joined with `garbage_schedules` and `properties` — for garbage raus/rein
- `task_assignments` where source is extra job — for extra jobs
- Status derived from `plan_assignments.status`: done → ✓, postponed → ⏸, pending/not found → ✗, in_progress → ⟳

### Forecast Mode (future days)
- `property_tasks` with `schedule_type` (weekly/biweekly/monthly) and `schedule_day` — to predict which tasks fall on which day
- `garbage_schedules` with `collection_date` — for known future garbage pickups
- Biweekly tasks: use `biweekly_start_date` to calculate if the target week is an "on" or "off" week
- Extra jobs: `task_assignments` with future dates
- No worker names — workers are not assigned to future dates

### Today
- Same as history mode but includes in-progress status (⟳)

---

## UI Layout

### Top Bar
- **Week navigation**: ◀ / ▶ arrows to move week-by-week
- **Week label**: "KW {number} — {startDate}–{endDate}" in German date format (DD.MM.YYYY)
- **"Heute" button**: Jump back to current week
- **Mode badge**: Automatically shows "HISTORY" (green), "FORECAST" (purple), or "AKTUELL" (blue) based on which week is being viewed

### Filter Bar
- **Work type toggles**: Clickable pills for Field / Cleaning / Garbage / Extra Jobs — each can be toggled on/off independently. All on by default.
- **Property dropdown**: "Alle Objekte" default, lists all active properties
- **Worker dropdown** (history only): "Alle Mitarbeiter" default, lists all workers. Disabled/hidden in forecast mode since no workers are assigned.

### Calendar Grid
- **5 columns** (Mon–Fri), no weekends
- **Day header**: "Mo DD.MM" format. Today highlighted with blue background and "● Heute" label. Forecast days show small "Prognose" label.
- **Task cards** stacked vertically in each day column, each showing:
  - Color-coded left border and label by type:
    - Field: blue (#3b82f6)
    - Cleaning: green (#22c55e)
    - Garbage: purple (#a855f7)
    - Extra Jobs: yellow (#eab308)
  - Property address (bold)
  - Task name (e.g. "Treppenhausreinigung", "Restmüll raus")
  - Worker name (history mode only)
  - Status icon (history mode only): ✓ done, ⏸ postponed, ✗ missed, ⟳ in progress
- **Visual distinction**:
  - History cards: solid borders, full opacity
  - Forecast cards: dashed borders, 0.7 opacity
  - Today's column: subtle blue background tint

### Legend Bar (bottom)
- Status icon meanings: ✓ Erledigt, ⏸ Verschoben, ✗ Verpasst, ⟳ In Arbeit
- Note: "Gestrichelte Rahmen = Prognose (keine Mitarbeiter zugewiesen)"

---

## Navigation Range

- **Past**: As far back as data exists in `plan_assignments` / `daily_plans`
- **Future**: Up to 8 weeks ahead (forecast becomes less meaningful beyond that for recurring schedules)
- **Default view**: Current week

---

## API Endpoint

### `GET /api/weekly-planner?week_start=YYYY-MM-DD`

Returns all tasks for the Mon–Fri of the given week. The backend determines which days are history vs. forecast and returns data accordingly.

**Response shape:**
```json
{
  "week_start": "2026-03-23",
  "week_end": "2026-03-27",
  "calendar_week": 13,
  "days": {
    "2026-03-23": {
      "mode": "history",
      "tasks": [
        {
          "type": "cleaning",
          "property_id": 5,
          "property_address": "Hauptstr. 12",
          "task_name": "Treppenhausreinigung",
          "worker_name": "Marwa Ahmadi",
          "worker_id": 15,
          "status": "done"
        }
      ]
    },
    "2026-03-27": {
      "mode": "today",
      "tasks": [...]
    },
    "2026-03-28": {
      "mode": "forecast",
      "tasks": [
        {
          "type": "cleaning",
          "property_id": 8,
          "property_address": "Parkstr. 8",
          "task_name": "Treppenhausreinigung",
          "worker_name": null,
          "worker_id": null,
          "status": null
        }
      ]
    }
  }
}
```

### Backend Logic

1. Calculate Mon–Fri dates for the requested week
2. For each day:
   - If day < today → **history**: query `plan_assignments` + `garbage_tasks` + extra jobs with actual status and worker
   - If day == today → **today**: same as history but include in_progress
   - If day > today → **forecast**: query `property_tasks` schedule rules + `garbage_schedules` to predict tasks, no worker/status
3. Apply biweekly logic: for biweekly tasks, check if `(target_week - biweekly_start_week) % 2 == 0`
4. Limit forecast to 8 weeks from today; return empty for weeks beyond that

---

## Filtering

Filtering happens client-side on the returned data:
- **Work type**: Filter `tasks` array by `type` field
- **Property**: Filter by `property_id`
- **Worker**: Filter by `worker_id` (only applicable to history/today tasks)

---

## File Structure

- **Page**: `client/src/pages/WeeklyPlanner.jsx`
- **Styles**: `client/src/styles/weekly-planner.css`
- **API handler**: `api/_handlers/weekly-planner/index.js`
- **Route**: Add `/weekly-planner` to `App.jsx` router
- **Sidebar**: Add "Wochenplaner" menu item with calendar icon

---

## Edge Cases

- **No data for a past week**: Show empty day columns (this can happen for weeks before the system was in use)
- **No tasks on a forecast day**: Show empty column or a subtle "Keine Aufgaben" placeholder
- **Garbage schedules not uploaded yet for future dates**: Those days simply won't show garbage tasks in forecast
- **Worker was deleted/deactivated**: Still show their name in history since the assignment existed
- **Postponed tasks**: Show on the original day with ⏸ icon and "→ verschoben auf {date}" note. The rescheduled instance appears on its new date.
