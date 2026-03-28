# Day Simulation System — Design Spec

## Goal

A Node.js script that simulates full work days in February 2026, calling the real service functions against the local Docker test database. Validates that plan generation, worker assignment, sick redistribution, check-in/out, carry-over, analytics, and hour balances all work correctly end-to-end.

## Architecture

Single script (`scripts/simulate.js`) that:
1. Seeds fictional test data into the Docker test DB
2. Runs 7 scenarios sequentially (simple → complex)
3. Verifies results by querying the DB after each step
4. Writes a detailed PASS/FAIL report to `docs/simulation/results.md`
5. Cleans up all simulation data on exit

No production code changes. No WhatsApp messages sent. No Supabase access needed.

## Prerequisites

- Docker test DB running: `docker compose up db-test`
- Migrations applied (the script will run them if needed)

## Test Data

### Workers

| Name | Role | Type | Phone | Max props/day | Flex |
|------|------|------|-------|---------------|------|
| Sim Ali | field | fulltime | +49SIM001 | 4 | yes |
| Sim Mehmet | field | fulltime | +49SIM002 | 4 | no |
| Sim Yusuf | field | fulltime | +49SIM003 | 3 | yes |
| Sim Marwa | cleaning | fulltime | +49SIM004 | 3 | no |
| Sim Leyla | joker | minijob | +49SIM005 | 2 | no |

All workers: `hourly_rate: 14.00`, `registration_date: '2025-01-01'`, `vacation_entitlement: 26`
Sim Leyla (minijob): `hourly_rate: 12.50`, `vacation_entitlement: 0`

### Properties

| Address | City | Weekday | Photo req | Tasks |
|---------|------|---------|-----------|-------|
| Simstraße 1 | Teststadt | 1 (Mon) | yes | Treppenhausreinigung (field, property_default) |
| Simstraße 2 | Teststadt | 1 (Mon) | no | Außenanlagen (field, property_default) |
| Simstraße 3 | Teststadt | 2 (Tue) | yes | Reinigung (cleaning, property_default) |
| Simstraße 4 | Teststadt | 3 (Wed) | no | Treppenhausreinigung (field, property_default) |
| Simstraße 5 | Teststadt | 4 (Thu) | yes | Grünpflege (field, property_default), Mülltonnen (field, property_default) |
| Simstraße 6 | Teststadt | 5 (Fri) | no | Reinigung (cleaning, property_default) |

### Identification

All sim data uses `+49SIM` phone prefix and `Simstraße` address prefix for easy cleanup.

## Scenarios

### Scenario 1: Normal Day (Monday Feb 2, 2026)

**Purpose:** Verify the basic daily flow from plan generation to analytics.

**Steps:**
1. Call `generateDraftPlan('2026-02-02')` — Monday, so Simstraße 1 and 2 should be scheduled
2. Verify plan has assignments for field workers (Sim Ali/Mehmet) to Simstraße 1 and 2
3. Approve the plan (update status to 'approved')
4. Call `createVisitsFromPlan(planId)` — creates property_visits
5. Simulate check-in: INSERT time_entry for Sim Ali (check_in: 07:00)
6. Simulate arrival: UPDATE property_visit SET status='in_progress', arrived_at='07:15'
7. Simulate completion: UPDATE property_visit SET status='completed', completed_at='09:30'
8. Update plan_assignment status='completed'
9. Simulate check-out: UPDATE time_entry SET check_out='15:00'
10. Call `computeDailyAnalyticsForDate('2026-02-02')`
11. Verify analytics_daily has correct rows

**Verifications:**
- Plan created with status='draft'
- 2 assignments exist (one per Monday property)
- Workers assigned have role='field'
- Property visits created after approval
- Time entry has check_in and check_out
- Analytics shows 1+ properties completed per worker
- Duration calculated correctly

### Scenario 2: Multiple Workers, Multiple Roles (Tuesday Feb 3)

**Purpose:** Verify plan distribution across workers by role.

**Steps:**
1. Call `generateDraftPlan('2026-02-03')` — Tuesday, Simstraße 3 scheduled (cleaning task)
2. Verify Sim Marwa (cleaning role) gets the assignment, NOT field workers
3. Approve plan and create visits
4. Simulate full day for Sim Marwa: check-in 07:00, arrive 07:20, complete 10:00, check-out 15:00
5. Compute analytics

**Verifications:**
- Only Simstraße 3 in the plan (only Tuesday property)
- Assignment goes to cleaning role worker (Sim Marwa)
- No field workers assigned to cleaning tasks
- Analytics correct for single-worker day

### Scenario 3: Sick Call + Redistribution (Wednesday Feb 4)

**Purpose:** Verify sick leave and automatic redistribution.

**Steps:**
1. Call `generateDraftPlan('2026-02-04')` — Wednesday, Simstraße 4 scheduled (field task)
2. Note which worker got assigned (expect Sim Ali or Sim Mehmet)
3. Approve the plan
4. INSERT sick_leave for the assigned worker (start_date: '2026-02-04', declared_days: 1)
5. Call `redistributeSickWorkers('2026-02-04')`
6. Verify the assignment was reassigned to a different field worker with source='substitution'
7. Simulate the replacement worker's full day
8. Compute analytics

**Verifications:**
- Sick leave record exists
- Original assignment reassigned (source changed to 'substitution')
- New worker has matching role (field)
- Original worker has NO time entry for this day
- Replacement worker's time entry and visits recorded
- Analytics reflects the substitution correctly

### Scenario 4: Missing Checkout (Thursday Feb 5)

**Purpose:** Verify anomaly detection for missing checkouts.

**Steps:**
1. Call `generateDraftPlan('2026-02-05')` — Thursday, Simstraße 5 (2 field tasks)
2. Approve plan, create visits
3. Simulate check-in for assigned worker at 07:00
4. Simulate arrival and completion of both tasks
5. Do NOT insert check-out
6. Call `detectMissingCheckouts('2026-02-05')` + `flagMissingCheckout()`
7. Also leave one assignment as 'pending' (not completed) for carry-over test

**Verifications:**
- Time entry exists with check_in but NO check_out
- After detection: time entry is_flagged=true, flag_reason set
- One assignment left as 'pending' for Scenario 5

### Scenario 5: Carry-Over (Friday Feb 6)

**Purpose:** Verify incomplete tasks carry to next day.

**Steps:**
1. Call `carryOverPlanTasks('2026-02-05', '2026-02-06')` — carries Thursday incomplete to Friday
2. Verify original assignment status changed to 'carried_over'
3. Call `generateDraftPlan('2026-02-06')` — Friday, Simstraße 6 scheduled + carried task
4. Verify plan includes both: Friday's regular assignment AND the carried-over task
5. Approve and simulate full day
6. Compute analytics

**Verifications:**
- Thursday's incomplete assignment now has status='carried_over'
- Friday's plan has the carried task (source='carryover')
- Friday's plan also has Simstraße 6 (regular Friday property, cleaning)
- Both tasks can be completed
- Analytics correct for combined regular + carry-over day

### Scenario 6: Full Week Summary (Feb 2-6)

**Purpose:** Verify weekly analytics and hour balance calculations.

**Steps:**
1. Call `computeDailyAnalyticsForDate()` for any days not yet computed
2. Query `getWorkerAnalytics('2026-02-01', '2026-02-28')` — full month
3. Query `getOperationsAnalytics('2026-02-01', '2026-02-28')`
4. Query `getCostAnalytics('2026-02-01', '2026-02-28')`
5. Call `syncMonthForAll(2026, 2)` — compute February hour balances
6. Query hour_balances for each sim worker

**Verifications:**
- Worker analytics show correct days worked, properties completed, sick days
- Operations analytics show correct totals across the week
- Cost analytics reflect hours * hourly_rate
- Hour balances computed for each worker
- Sim Ali has fewer hours (was sick Wednesday)
- Workers who worked >8h on a day show overtime

### Scenario 7: Edge Cases

**Purpose:** Verify the system handles unusual situations gracefully.

**Steps:**
1. **Empty day:** Call `generateDraftPlan('2026-02-07')` — Saturday, no properties scheduled. Verify plan created with 0 assignments.
2. **Duplicate plan:** Call `generateDraftPlan('2026-02-02')` again — should return existing plan, not create duplicate.
3. **Minijob limit:** Insert time entries for Sim Leyla across multiple days totaling ~43 hours (approaching 538€ at 12.50/hr). Call `syncMonthForAll(2026, 2)`. Verify hour balance respects minijob cap.
4. **Worker with no assignments:** Verify a worker who had no properties for a day has no analytics_daily row for that day.

**Verifications:**
- Saturday plan has 0 assignments (not an error)
- Second generateDraftPlan call returns same plan_id
- Minijob worker's hour balance capped appropriately
- No phantom data for unassigned workers

## Script Structure

```
scripts/simulate.js
├── setup()        — connect DB, run migrations, seed test data
├── scenario1()    — Normal Day
├── scenario2()    — Multiple Workers
├── scenario3()    — Sick Call
├── scenario4()    — Missing Checkout
├── scenario5()    — Carry-Over
├── scenario6()    — Week Summary
├── scenario7()    — Edge Cases
├── cleanup()      — delete all sim data
└── writeReport()  — write docs/simulation/results.md
```

Each scenario function returns an array of `{ step, expected, actual, pass }` objects.

## Report Format

Terminal output: colored progress with PASS/FAIL per step.
File output: `docs/simulation/results.md` with full details.

```markdown
# Simulation Report — {date}

## Summary: 7 scenarios, X passed, Y failed

### Scenario 1: Normal Day (Mon Feb 2)
- [PASS] Plan generated for 2026-02-02 (plan_id: 42)
- [PASS] Plan has 2 assignments (expected: 2)
- [PASS] Sim Ali assigned to Simstraße 1 (role: field)
- [PASS] Check-in recorded at 07:00
- [FAIL] Analytics duration: expected 135, got 0 ← INVESTIGATE
...
```

## Package.json

Add script: `"simulate": "node scripts/simulate.js"`

## What This Does NOT Test

- WhatsApp message delivery (requires Twilio)
- Photo uploads (requires Supabase storage)
- PDF/Excel generation (requires Supabase storage)
- Frontend UI rendering
- Real cron job scheduling (we call the functions directly)

These are covered by the manual testing checklist.
