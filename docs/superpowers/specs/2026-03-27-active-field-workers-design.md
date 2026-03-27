# Active Field Worker System — Design Spec

**Date:** 2026-03-27
**Status:** Draft

## Problem

The system has ~10 workers, but not all of them go to properties. Office/admin staff, seasonal workers, and workers on long-term leave should not receive WhatsApp messages, appear in daily plans, or be tracked in the command center. However, they must still appear in the Steuerberater monthly report with hours calculated from their contract type (fulltime/minijob).

Currently, the only worker status is `is_active` (soft-delete). There is no distinction between field workers and non-field workers.

## Solution

Add an `is_field_worker` boolean column to the `workers` table. This flag controls whether a worker participates in field operations (planning, messaging, tracking, analytics). It is independent of `is_active` (soft-delete).

## Data Model

### New Column

```sql
ALTER TABLE workers ADD COLUMN is_field_worker BOOLEAN NOT NULL DEFAULT true;
```

Default `true` ensures all existing workers remain field workers. Halil manually toggles off office/admin workers after deployment.

### Column Semantics

| Column | Purpose |
|--------|---------|
| `is_active` | Soft-delete. `false` = worker is removed from the system entirely |
| `is_field_worker` | Operational role. `false` = worker exists but does not go to properties |

A worker can be:
- `is_active=true, is_field_worker=true` — active field worker (full system participation)
- `is_active=true, is_field_worker=false` — active non-field worker (reports only)
- `is_active=false` — deactivated (hidden from everything)

## System Behavior Matrix

| System Area | Field Workers (`is_field_worker=true`) | Non-Field Workers (`is_field_worker=false`) |
|---|---|---|
| Workers page (list) | Shown | Shown |
| Workers page (edit) | Full form | Full form |
| Daily plan generation | Included in auto-assignment | Hidden completely |
| Plan assignment UI | Available for assignment | Hidden completely |
| Command Center | Tracked (check-in, status, alerts) | Hidden completely |
| WhatsApp check-in/out prompts | Sent | Not sent |
| WhatsApp task messages | Sent | Not sent |
| Analytics dashboards | Performance tracked | Hidden completely |
| Worker preferences | Can set max properties, preferred properties | Hidden completely |
| Task scheduling | Tasks assigned | Not assigned |
| Steuerberater monthly report | Included (real tracked hours) | Included (contract-based hours) |
| Notifications to Halil | Anomalies reported | No anomaly tracking |

## Affected Services

### Services that need `AND is_field_worker = true` added to queries

| Service | File | Current Query Filter | Change |
|---|---|---|---|
| Plan generation | `src/services/planGeneration.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Command Center | `src/services/commandCenter.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Accountability flow | `src/services/accountabilityFlow.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Analytics | `src/services/analytics.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Task scheduling | `src/services/taskScheduling.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Notifications (worker-specific) | `src/services/notifications.js` | `WHERE is_active = true` | Add `AND is_field_worker = true` |
| Worker preferences API | `api/_handlers/worker-preferences/` | `WHERE is_active = true` | Add `AND is_field_worker = true` |

### Services that remain unchanged

| Service | File | Reason |
|---|---|---|
| PDF report generation | `src/services/pdfReport.js` | Must include all active workers |
| Workers API (list/CRUD) | `api/_handlers/workers/` | Workers page shows everyone |
| Vacation management | `src/services/vacation.js` | All workers have vacation entitlements |
| Sick leave management | `api/_handlers/sick-leave/` | All workers can declare sick leave |

## Workers Page UI Changes

### Table Changes

- New **"Field Worker"** column with an inline toggle switch per row
- Non-field workers display a muted **"Office"** badge next to their name
- Optional filter tabs at the top: **All | Field | Office**

### Edit Form Changes

- New toggle in the worker edit form: **"Field Worker"** (on/off)
- Placed in a visible section alongside worker type (fulltime/minijob)

### API Changes

- `GET /api/workers` — response includes `is_field_worker` for each worker
- `PUT /api/workers/:id` — accepts `is_field_worker` in the request body
- New convenience endpoint: `PUT /api/workers/:id/field-status` — toggle field worker status (used by inline toggle)

## Error Handling

### Last field worker warning

When toggling off the last remaining field worker, show a warning dialog:
> "No field workers will remain. Daily plans cannot be generated and no WhatsApp messages will be sent."

Allow the action but ensure the user is informed.

### Future assignments conflict

When toggling off a worker who has plan assignments for future dates, show a confirmation dialog:
> "This worker has X upcoming plan assignments. They will be removed from those plans. Continue?"

On confirmation, remove the worker from future plan assignments (set status to `removed` or delete the assignment rows).

## Migration Strategy

1. Run migration to add `is_field_worker` column (default `true`)
2. All existing workers become field workers — no behavior change
3. Halil manually toggles off office/admin workers from the Workers page
4. No data migration needed beyond the column addition

## Out of Scope

- Worker roles/permissions system (not needed — simple boolean is sufficient)
- Separate pages for field vs. office workers (single page with filter is enough)
- Time tracking changes for non-field workers (contract-based calculation already exists)
