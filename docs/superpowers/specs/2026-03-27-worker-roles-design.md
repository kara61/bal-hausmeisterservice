# Spec 1: Worker Roles

**Date:** 2026-03-27
**Status:** Draft
**Part of:** Worker Roles → Structured Property Tasks → Stundenkonto (3-spec series)

## Summary

Replace the `is_field_worker` boolean with a `worker_role` enum to support three distinct worker types: Field Worker, Cleaning Worker, and Office Worker. This is the foundation for Spec 2 (Structured Property Tasks with role-based assignment) and Spec 3 (Stundenkonto).

## Motivation

- The cleaning lady (Marwa) has a separate schedule and separate properties from field workers
- Cleaning tasks at properties should only be assigned to cleaning workers, not field workers
- The current `is_field_worker` boolean cannot distinguish between cleaning workers and office workers — both are `false`
- A proper role system enables role-based task assignment in Spec 2

## Worker Roles

| Role | DB Value | Description |
|------|----------|-------------|
| Field Worker | `'field'` | Hausmeister tasks — daily plans, command center, analytics, WhatsApp |
| Cleaning Worker | `'cleaning'` | Cleaning tasks only — separate schedule, separate properties |
| Office Worker | `'office'` | No field tasks — only appears in Steuerberater reports |

## Database Changes

### Migration 009: `009-worker-roles.sql`

1. Add column: `worker_role VARCHAR(20) CHECK (worker_role IN ('field', 'cleaning', 'office')) DEFAULT 'office'`
2. Migrate data:
   - `is_field_worker = true` → `worker_role = 'field'` (Ertugrul id:1, Dorde id:18)
   - Marwa (id: 15) → `worker_role = 'cleaning'`
   - All others remain `'office'`
3. Set `NOT NULL` constraint on `worker_role`
4. Drop column: `is_field_worker`

## API Changes

### Modified Endpoints

- **`GET /workers`** — returns `worker_role` instead of `is_field_worker`
- **`POST /workers`** — accepts `worker_role` (default: `'field'`) instead of `is_field_worker`
- **`PUT /workers/{id}`** — accepts `worker_role` instead of `is_field_worker`
- **`PUT /workers/field-status`** → **renamed to `PUT /workers/role`**
  - Accepts `{ workerId, role }` instead of `{ workerId, isFieldWorker }`
  - Same validation: warn if changing the last field worker
  - Same cleanup: remove future plan assignments when leaving `'field'` role

### Query Changes

All queries filtering `is_field_worker = true` change to `worker_role = 'field'`:

- `src/services/planGeneration.js` — daily plan generation (field workers only)
- `src/services/analytics.js` — analytics calculations (field workers only)
- `src/services/accountabilityFlow.js` — accountability tracking
- Command center queries
- Any WhatsApp message targeting

## Frontend Changes

### Workers Page (`client/src/pages/Workers.jsx`)

- Filter tabs: "All | Field | Office" → **"All | Field | Cleaning | Office"**
- Table column: replace toggle switch with role badge/label
- Inline role change: dropdown selector with two-step confirmation
  - Confirmation required when: changing last field worker, or changing role removes future assignments

### Worker Form (`client/src/components/WorkerForm.jsx`)

- Replace `is_field_worker` checkbox with **role dropdown**: Field / Cleaning / Office
- Default for new workers: `'field'`

### Translations (`client/src/i18n/translations.js`)

New keys:
- `workers.role.field` → "Außendienstmitarbeiter" / "Field Worker"
- `workers.role.cleaning` → "Reinigungskraft" / "Cleaning Worker"
- `workers.role.office` → "Büromitarbeiter" / "Office Worker"
- `workers.role.label` → "Rolle" / "Role"
- `workers.tabs.cleaning` → "Reinigung" / "Cleaning"

Replace/remove:
- `workers.fieldWorker` and related keys → replaced by role keys

## What Stays the Same

- `worker_type` (fulltime/minijob) — orthogonal to role, unchanged
- Salary, hourly rate, vacation entitlement — unchanged
- Time entries, sick leave — unchanged
- Steuerberater reports — include all roles, calculate hours per existing logic

## Files to Modify

| File | Change |
|------|--------|
| `src/db/migrations/009-worker-roles.sql` | New migration |
| `api/_handlers/workers/index.js` | Replace `is_field_worker` with `worker_role` |
| `api/_handlers/workers/[id].js` | Replace `is_field_worker` with `worker_role` |
| `api/_handlers/workers/field-status.js` | Rename to `role.js`, accept `role` param |
| `src/services/planGeneration.js` | Filter by `worker_role = 'field'` |
| `src/services/analytics.js` | Filter by `worker_role = 'field'` |
| `src/services/accountabilityFlow.js` | Filter by `worker_role = 'field'` |
| `client/src/pages/Workers.jsx` | Tabs, table column, inline role change |
| `client/src/components/WorkerForm.jsx` | Role dropdown |
| `client/src/i18n/translations.js` | New role keys, remove field worker keys |
| Any command center components | Filter update |

## Data Migration (Current Workers)

| Worker | ID | Current | New Role |
|--------|----|---------|----------|
| Ertugrul Bal | 1 | `is_field_worker: true` | `'field'` |
| Dorde Vulic | 18 | `is_field_worker: true` | `'field'` |
| Marwa Ahmadi | 15 | `is_field_worker: false` | `'cleaning'` |
| Deniz Büsra Bal | 14 | `is_field_worker: false` | `'office'` |
| Ferize Hristova | 10 | `is_field_worker: false` | `'office'` |
| Hamide Topal | 16 | `is_field_worker: false` | `'office'` |
| Hasan Ziya Birinci | 23 | `is_field_worker: false` | `'office'` |
| Hristina Karastoyanova | 13 | `is_field_worker: false` | `'office'` |
| Lucian Popa | 12 | `is_field_worker: false` | `'office'` |
| Onur Ayri | 11 | `is_field_worker: false` | `'office'` |
| Recep Bal | 9 | `is_field_worker: false` | `'office'` |
| Zehra Bal | 17 | `is_field_worker: false` | `'office'` |

## Future (Spec 2 & 3)

- **Spec 2: Structured Property Tasks** — uses `worker_role` to restrict which workers can be assigned to which tasks
- **Spec 3: Stundenkonto** — dedicated page for tracking official vs. surplus hours per worker, with historical view and payout/carry-over options
