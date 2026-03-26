# Smart Operations Suite — Design Spec

**Date:** 2026-03-26
**Project:** Bal Hausmeisterservice
**Author:** Brainstorming session with Halil

---

## Overview

Four integrated features that transform Halil's daily workflow from manual coordination to a guided, data-driven operation for his facility management company (6-10 workers, ~36 properties).

### Current pain points

- Scheduling is semi-manual — default assignments exist but Halil adjusts daily based on absences and urgency
- When workers are sick, their properties risk being missed — Halil manually reassigns or calls backup workers
- No systematic work verification — trust-based with occasional drive-by checks
- No visibility into worker performance or property trends
- Operational data spread across 6+ separate pages

### Build order

1. **Smart Daily Planner** — foundation, everything depends on it
2. **Command Center Dashboard** — gives Halil immediate visibility
3. **Worker Accountability Flow** — adds verification layer
4. **Performance Analytics** — needs accumulated data from features 1-3

---

## Feature 1: Smart Daily Planner

### How it works

**Nightly cron (00:00) — draft plan generation:**
- Generates a draft daily plan for tomorrow
- Pulls property schedule (which properties need service on which weekday)
- Assigns workers based on default teams (existing `team_members` assignments)
- Checks for known absences (pre-approved vacation, multi-day sick leave)
- Flags gaps — properties with no available workers

**Morning cron (05:00) — sick worker redistribution:**
- Checks for new sick declarations via WhatsApp bot
- Auto-redistributes orphaned properties:
  1. Check if a flex worker is available
  2. If not, assign to the worker with the fewest assignments that day who has serviced that property before (from `plan_assignments` history). If no history, pick the worker with lowest assignment count.
  3. If unresolvable, flag for Halil with suggested action

**Halil opens the app:**
- Sees the Daily Plan screen with each worker → their assigned properties
- Unresolved gaps highlighted in red
- Suggested redistributions he can accept or override
- Drag-and-drop or quick-reassign to move properties between workers
- "Approve & Send" button — locks plan, sends assignments via WhatsApp

**Workers receive via WhatsApp:**
```
📋 Deine Aufgaben für heute (Mittwoch, 26.03):

1. Mozartstraße 12 — Treppenhausreinigung, Mülltonnen
2. Beethoven Residenz — Grünpflege
3. Am Stadtpark 5 — Treppenhausreinigung

Drücke "Einchecken" wenn du loslegst.
```

### Data model

```sql
CREATE TABLE daily_plans (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- draft, approved, in_progress, completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(50)
);

CREATE TABLE plan_assignments (
  id SERIAL PRIMARY KEY,
  daily_plan_id INTEGER NOT NULL REFERENCES daily_plans(id),
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  assignment_order INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(10) NOT NULL DEFAULT 'auto',
    -- auto (system-generated), manual (Halil overrode)
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
    -- assigned, started, completed
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
CREATE INDEX idx_plan_assignments_worker_date ON plan_assignments(worker_id, daily_plan_id);
```

### Key rules

- Default plan follows existing `properties.assigned_day` + `team_members` assignments
- Sick/vacation workers excluded automatically
- Unresolved gaps are never silently dropped — always flagged
- Plan history kept for analytics
- Workers only see their own assignments

---

## Feature 2: Command Center Dashboard

### Purpose

Replace the current multi-page navigation with a single operational screen for Halil's entire day.

### Layout

**Top bar — Day summary stats:**
- Workers active: 7/9 (checked in / total assigned)
- Properties: in progress / completed / remaining
- Flagged items count
- Garbage collections today count

**Left panel — Worker status list:**
Each worker as a card showing:
- Name + status indicator (not started / en route / working / done for today)
- Current property
- Tasks completed: 3/5
- Check-in time
- Quick actions: reassign, message via WhatsApp

**Center panel — Property grid (kanban-style):**
- Columns: Pending → In Progress → Completed
- Each property card: name, assigned worker, task checkmarks, time started
- Color coding: green (on track), yellow (running late), red (gap/unassigned)
- Click to expand for task details, photos, notes

**Right panel — Alerts & quick actions:**
- Sick leave declarations awaiting approval
- Flagged time entries
- Upcoming garbage collections (next 2 days)
- Unresolved plan gaps
- Extra job requests
- Each alert has a one-tap action (approve, reassign, dismiss)

**Bottom bar — Timeline:**
- Horizontal timeline 06:00-18:00
- Check-in/check-out markers per worker
- Visual gaps = potential missed checkouts

### Real-time updates

- Dashboard polls API every 30 seconds
- WhatsApp task completions update immediately on next poll
- New sick declarations trigger alert badge

### API

```
GET /api/command-center?date=2026-03-26
```

Returns combined payload: plan status, worker statuses, task progress, alerts, garbage schedule. One call instead of 6.

### Navigation changes

- Command Center becomes the default landing page (replaces Dashboard.jsx)
- All existing CRUD pages remain accessible from sidebar for detailed operations
- DailyTasks.jsx functionality integrated into Command Center

---

## Feature 3: Worker Accountability Flow

### Purpose

Systematic work verification via a structured WhatsApp workflow. Workers go through properties sequentially, with timestamps and optional photo proof.

### Worker's day via WhatsApp

**1. Assignment received** (after Halil approves plan):
```
📋 Deine Aufgaben für heute (Mittwoch, 26.03):
1. Mozartstraße 12 — Treppenhausreinigung, Mülltonnen
2. Beethoven Residenz — Grünpflege
3. Am Stadtpark 5 — Treppenhausreinigung

Drücke "Einchecken" wenn du loslegst.
```

**2. After check-in:**
```
✅ Eingecheckt um 07:12

Deine erste Aufgabe:
📍 Mozartstraße 12
• Treppenhausreinigung
• Mülltonnen

Drücke "Angekommen" wenn du vor Ort bist.
```

**3. Arrive at property:**
```
📍 Mozartstraße 12 — Los geht's!

Wenn du fertig bist:
1. Mach ein Foto vom Ergebnis
2. Drücke "Fertig"
```

**4. Complete property:**
Worker sends photo → presses "Fertig"
```
✅ Mozartstraße 12 abgeschlossen (07:12 - 08:45)

Weiter zu:
📍 Beethoven Residenz — Grünpflege

Drücke "Angekommen" wenn du vor Ort bist.
```

**5. End of day:**
```
📊 Dein Tag:
✅ Mozartstraße 12 — 1h 33m — ✓ Foto
✅ Beethoven Residenz — 2h 10m — ✓ Foto
✅ Am Stadtpark 5 — 1h 15m — ✓ Foto

Gesamtzeit: 4h 58m
Gute Arbeit! 👍
```

### Photo requirements

- Not mandatory by default — workers are prompted but can skip
- Halil can mark specific properties as "Foto erforderlich" in property settings
- Missing required photos show as warnings in Command Center
- Photos stored in Supabase Storage (existing infrastructure)

### Data model

```sql
ALTER TABLE properties ADD COLUMN photo_required BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE property_visits (
  id SERIAL PRIMARY KEY,
  plan_assignment_id INTEGER REFERENCES plan_assignments(id),
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  visit_date DATE NOT NULL,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
    -- assigned, en_route, in_progress, completed, skipped
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE property_visit_photos (
  id SERIAL PRIMARY KEY,
  property_visit_id INTEGER NOT NULL REFERENCES property_visits(id),
  photo_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  caption TEXT
);

CREATE INDEX idx_property_visits_date ON property_visits(visit_date);
CREATE INDEX idx_property_visits_worker ON property_visits(worker_id, visit_date);
CREATE INDEX idx_property_visits_assignment ON property_visits(plan_assignment_id);
```

### Bot conversation state additions

New states: `awaiting_arrival`, `at_property`, `awaiting_photo`

Follows existing conversation state pattern. Worker can still use existing flows (sick leave, etc.) — the property flow is layered on top.

### Key design decisions

- **No GPS tracking** — too invasive, timestamps + photos provide enough evidence
- **Photos prompted but not blocking** — worker can press "Fertig" without photo, system flags it
- **Sequential property flow** — workers go through properties in plan order, cannot skip ahead
- **Graceful degradation** — if a worker ignores the new flow and just checks in/out like before, the system still works. Accountability data is additive.

---

## Feature 4: Performance Analytics

### Purpose

Turn operational data into actionable insights for staffing and scheduling decisions.

### Analytics views

**1. Worker Performance (weekly/monthly toggle)**

Per worker:
- Tasks completed — total and per day average
- Properties serviced — count and which ones
- Average time per property — compared to team average
- Photo compliance — % of required photos submitted
- Punctuality — average time between assignment and arrival
- Sick days — count this month, trend vs. previous months
- Overtime — hours over standard, official vs. unofficial split

Color coding: green (above average), neutral (normal), red (below average or concerning trend)

**2. Property Insights (monthly)**

Per property:
- Average service duration — how long workers typically spend
- Completion rate — % of scheduled visits completed vs. postponed/skipped
- Most frequent workers — who services this property most
- Common postponement reasons — "kein Zugang", "Material fehlt", etc.

Answers: "Which properties are trouble spots?" and "Should I adjust time estimates?"

**3. Operations Overview (weekly/monthly)**

High-level:
- Plan adherence — % of plans executed as approved vs. modified during the day
- Total properties serviced vs. scheduled
- Average workers active per day
- Sick leave trend — rolling 4-week view
- Overtime trend — rolling 4-week view
- Busiest days — which weekdays have most workload
- Task carryover rate

**4. Cost Insights (monthly)**

Ties into existing payroll:
- Cost per property — worker hours × rate, averaged
- Worker utilization — actual working hours vs. paid hours
- Overtime cost — broken down by worker
- Harcirah costs — travel allowance totals

### Implementation approach

Pre-computed, not real-time:

```sql
CREATE TABLE analytics_daily (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  worker_id INTEGER REFERENCES workers(id),
    -- null for global stats
  property_id INTEGER REFERENCES properties(id),
    -- null for worker-level or global stats
  properties_completed INTEGER NOT NULL DEFAULT 0,
  properties_scheduled INTEGER NOT NULL DEFAULT 0,
  total_duration_minutes INTEGER NOT NULL DEFAULT 0,
  photos_submitted INTEGER NOT NULL DEFAULT 0,
  photos_required INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_postponed INTEGER NOT NULL DEFAULT 0,
  tasks_carried_over INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  sick_leave_declared BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE analytics_property_monthly (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  avg_duration_minutes INTEGER,
  completion_rate NUMERIC(5,2),
  visit_count INTEGER NOT NULL DEFAULT 0,
  postponement_count INTEGER NOT NULL DEFAULT 0,
  top_postponement_reason VARCHAR(100)
);

CREATE INDEX idx_analytics_daily_date ON analytics_daily(date);
CREATE INDEX idx_analytics_daily_worker ON analytics_daily(worker_id, date);
CREATE INDEX idx_analytics_monthly_property ON analytics_property_monthly(property_id, month);
```

Nightly cron computes daily aggregates. Weekly/monthly views aggregate from daily summaries.

### Access

- New page: Analytics.jsx — accessible from sidebar
- Not part of Command Center (that's for today, analytics is for trends)
- Export to Excel using existing `xlsx` dependency

---

## What stays the same

- All existing CRUD pages (Workers, Properties, Reports, Vacation, SickLeave, etc.)
- Existing check-in/check-out WhatsApp flow (accountability is layered on top)
- Payroll calculations, sick leave cascade, vacation tracking
- PDF report generation for Steuerberater
- Garbage bin management (Module 3)
- Authentication and authorization model

## New database tables summary

| Table | Purpose |
|---|---|
| `daily_plans` | Daily plan status and metadata |
| `plan_assignments` | Worker-to-property assignments per day |
| `worker_preferences` | Flex worker flag, capacity, preferred properties |
| `property_visits` | Arrival/completion/duration per property visit |
| `property_visit_photos` | Photo evidence linked to visits |
| `analytics_daily` | Pre-computed daily statistics |
| `analytics_property_monthly` | Pre-computed monthly property trends |

## Schema changes to existing tables

| Table | Change |
|---|---|
| `properties` | Add `photo_required BOOLEAN DEFAULT false` |

## New API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/command-center` | Combined payload for Command Center |
| `GET/POST /api/daily-plans` | Plan CRUD and approval |
| `PUT /api/daily-plans/:id/approve` | Approve and send assignments |
| `PUT /api/plan-assignments/:id` | Reassign worker/property |
| `POST /api/property-visits/:id/arrive` | Worker arrived at property |
| `POST /api/property-visits/:id/complete` | Worker completed property |
| `POST /api/property-visits/:id/photos` | Upload visit photo |
| `GET /api/analytics/workers` | Worker performance data |
| `GET /api/analytics/properties` | Property insights |
| `GET /api/analytics/operations` | Operations overview |
| `GET /api/analytics/costs` | Cost insights |
| `GET /api/analytics/export` | Excel export |

## New frontend pages

| Page | Purpose |
|---|---|
| `CommandCenter.jsx` | Single-screen daily operations (replaces Dashboard as landing) |
| `DailyPlan.jsx` | Plan review, editing, approval |
| `Analytics.jsx` | Performance analytics with sub-views |

## Cron job changes

| Time | Current | Added |
|---|---|---|
| 00:00 (nightly) | Existing nightly tasks | + Draft plan generation, + Analytics daily computation |
| 05:00 (morning) | Existing morning tasks | + Sick worker redistribution check |
