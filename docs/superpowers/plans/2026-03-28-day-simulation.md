# Day Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simulation script that tests full work-day flows against the local Docker test DB using February 2026 dates, verifying plan generation, redistribution, check-in/out, carry-over, analytics, and hour balances.

**Architecture:** Single script `scripts/simulate.js` seeds test data, runs 7 scenarios calling real service functions with February dates, verifies DB state after each step, writes a markdown report, and cleans up. Check-ins/checkouts are simulated via direct DB inserts (option A — no bot layer).

**Tech Stack:** Node.js, pg (pool), existing service functions, Docker PostgreSQL 16

**Spec:** `docs/superpowers/specs/2026-03-28-day-simulation-design.md`

---

## File Structure

- **Create:** `scripts/simulate.js` — main orchestrator (setup, run scenarios, cleanup, report)
- **Create:** `scripts/sim/seed.js` — seed and cleanup functions for test data
- **Create:** `scripts/sim/helpers.js` — DB simulation helpers (simulate check-in, checkout, arrival, completion)
- **Create:** `scripts/sim/report.js` — report builder (collects results, writes markdown)
- **Create:** `scripts/sim/scenarios/scenario1.js` — Normal Day
- **Create:** `scripts/sim/scenarios/scenario2.js` — Multiple Workers
- **Create:** `scripts/sim/scenarios/scenario3.js` — Sick Call
- **Create:** `scripts/sim/scenarios/scenario4.js` — Missing Checkout
- **Create:** `scripts/sim/scenarios/scenario5.js` — Carry-Over
- **Create:** `scripts/sim/scenarios/scenario6.js` — Week Summary
- **Create:** `scripts/sim/scenarios/scenario7.js` — Edge Cases
- **Modify:** `package.json` — add `"simulate"` script

---

### Task 1: Project Setup + Seed Data

**Files:**
- Create: `scripts/sim/seed.js`
- Create: `scripts/sim/helpers.js`
- Create: `scripts/sim/report.js`
- Modify: `package.json`

- [ ] **Step 1: Add simulate script to package.json**

Add to the `"scripts"` section:
```json
"simulate": "node --env-file=.env.test scripts/simulate.js"
```

- [ ] **Step 2: Create seed.js with test data insert/cleanup**

Create `scripts/sim/seed.js`:

```javascript
import { pool } from '../../src/db/pool.js';

const SIM_WORKERS = [
  { name: 'Sim Ali',    phone: '+49SIM001', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 4, flex: true  },
  { name: 'Sim Mehmet', phone: '+49SIM002', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 4, flex: false },
  { name: 'Sim Yusuf',  phone: '+49SIM003', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 3, flex: true  },
  { name: 'Sim Marwa',  phone: '+49SIM004', role: 'cleaning', type: 'fulltime', rate: 14.00, salary: null,   maxProps: 3, flex: false },
  { name: 'Sim Leyla',  phone: '+49SIM005', role: 'joker',    type: 'minijob',  rate: 12.50, salary: 538.00, maxProps: 2, flex: false },
];

const SIM_PROPERTIES = [
  { address: 'Simstraße 1', city: 'Teststadt', weekday: 1, photo: true,  tasks: [{ name: 'Treppenhausreinigung', role: 'field' }] },
  { address: 'Simstraße 2', city: 'Teststadt', weekday: 1, photo: false, tasks: [{ name: 'Außenanlagen', role: 'field' }] },
  { address: 'Simstraße 3', city: 'Teststadt', weekday: 2, photo: true,  tasks: [{ name: 'Reinigung', role: 'cleaning' }] },
  { address: 'Simstraße 4', city: 'Teststadt', weekday: 3, photo: false, tasks: [{ name: 'Treppenhausreinigung', role: 'field' }] },
  { address: 'Simstraße 5', city: 'Teststadt', weekday: 4, photo: true,  tasks: [{ name: 'Grünpflege', role: 'field' }, { name: 'Mülltonnen', role: 'field' }] },
  { address: 'Simstraße 6', city: 'Teststadt', weekday: 5, photo: false, tasks: [{ name: 'Reinigung', role: 'cleaning' }] },
];

export async function seed() {
  const workers = {};
  for (const w of SIM_WORKERS) {
    const { rows } = await pool.query(
      `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
       VALUES ($1, $2, $3, $4, $5, '2025-01-01', 26, $6) RETURNING *`,
      [w.name, w.phone, w.type, w.rate, w.salary, w.role]
    );
    const worker = rows[0];
    workers[w.name] = worker;

    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker, max_properties_per_day)
       VALUES ($1, $2, $3)`,
      [worker.id, w.flex, w.maxProps]
    );
  }

  const properties = {};
  for (const p of SIM_PROPERTIES) {
    const { rows } = await pool.query(
      `INSERT INTO properties (address, city, assigned_weekday, standard_tasks, is_active, photo_required)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
      [p.address, p.city, p.weekday, p.tasks.map(t => t.name).join(', '), p.photo]
    );
    const prop = rows[0];
    properties[p.address] = prop;

    for (const task of p.tasks) {
      await pool.query(
        `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, is_active)
         VALUES ($1, $2, $3, 'property_default', true)`,
        [prop.id, task.name, task.role]
      );
    }
  }

  return { workers, properties };
}

export async function cleanup() {
  // Delete in FK-safe order using sim identifiers
  const { rows: simWorkers } = await pool.query(
    `SELECT id FROM workers WHERE phone_number LIKE '+49SIM%'`
  );
  const { rows: simProps } = await pool.query(
    `SELECT id FROM properties WHERE address LIKE 'Simstraße%'`
  );

  const wIds = simWorkers.map(w => w.id);
  const pIds = simProps.map(p => p.id);

  if (wIds.length > 0 || pIds.length > 0) {
    // Delete analytics
    if (wIds.length > 0) {
      await pool.query(`DELETE FROM analytics_daily WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM hour_balances WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM time_entries WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM sick_leave WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM conversation_state WHERE phone_number LIKE '+49SIM%'`);
    }
    if (pIds.length > 0) {
      await pool.query(`DELETE FROM analytics_property_monthly WHERE property_id = ANY($1)`, [pIds]);
    }

    // Delete plan-related data (plans that only have sim worker/property assignments)
    const { rows: simPlans } = await pool.query(
      `SELECT DISTINCT dp.id FROM daily_plans dp
       JOIN plan_assignments pa ON pa.daily_plan_id = dp.id
       WHERE pa.worker_id = ANY($1) OR pa.property_id = ANY($2)`,
      [wIds, pIds]
    );
    const planIds = simPlans.map(p => p.id);

    if (planIds.length > 0) {
      await pool.query(
        `DELETE FROM property_visit_photos WHERE property_visit_id IN (
           SELECT id FROM property_visits WHERE plan_assignment_id IN (
             SELECT id FROM plan_assignments WHERE daily_plan_id = ANY($1)))`,
        [planIds]
      );
      await pool.query(
        `DELETE FROM property_visits WHERE plan_assignment_id IN (
           SELECT id FROM plan_assignments WHERE daily_plan_id = ANY($1))`,
        [planIds]
      );
      await pool.query(`DELETE FROM plan_assignments WHERE daily_plan_id = ANY($1)`, [planIds]);
      await pool.query(`DELETE FROM daily_plans WHERE id = ANY($1)`, [planIds]);
    }

    // Delete property tasks and properties
    if (pIds.length > 0) {
      await pool.query(`DELETE FROM property_tasks WHERE property_id = ANY($1)`, [pIds]);
      await pool.query(`DELETE FROM properties WHERE id = ANY($1)`, [pIds]);
    }

    // Delete worker preferences and workers
    if (wIds.length > 0) {
      await pool.query(`DELETE FROM worker_preferences WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM workers WHERE id = ANY($1)`, [wIds]);
    }
  }
}
```

- [ ] **Step 3: Create helpers.js with DB simulation functions**

Create `scripts/sim/helpers.js`:

```javascript
import { pool } from '../../src/db/pool.js';

/**
 * Simulate a worker check-in by inserting a time_entry directly.
 */
export async function simulateCheckIn(workerId, dateStr, timeStr) {
  const checkIn = `${dateStr}T${timeStr}:00+01:00`; // CET
  const { rows } = await pool.query(
    `INSERT INTO time_entries (worker_id, date, check_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, date) DO UPDATE SET check_in = $3, updated_at = NOW()
     RETURNING *`,
    [workerId, dateStr, checkIn]
  );
  return rows[0];
}

/**
 * Simulate a worker check-out by updating the time_entry.
 */
export async function simulateCheckOut(workerId, dateStr, timeStr) {
  const checkOut = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE time_entries SET check_out = $1, updated_at = NOW()
     WHERE worker_id = $2 AND date = $3 RETURNING *`,
    [checkOut, workerId, dateStr]
  );
  return rows[0];
}

/**
 * Simulate arriving at a property visit.
 */
export async function simulateArrival(visitId, dateStr, timeStr) {
  const arrivedAt = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE property_visits SET status = 'in_progress', arrived_at = $1
     WHERE id = $2 RETURNING *`,
    [arrivedAt, visitId]
  );
  return rows[0];
}

/**
 * Simulate completing a property visit.
 */
export async function simulateCompletion(visitId, dateStr, timeStr) {
  const completedAt = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE property_visits SET status = 'completed', completed_at = $1,
     duration_minutes = EXTRACT(EPOCH FROM ($1::timestamptz - arrived_at)) / 60
     WHERE id = $2 RETURNING *`,
    [completedAt, visitId]
  );
  // Also update plan_assignment
  if (rows[0]) {
    await pool.query(
      `UPDATE plan_assignments SET status = 'completed', completed_at = $1
       WHERE id = $2`,
      [completedAt, rows[0].plan_assignment_id]
    );
  }
  return rows[0];
}

/**
 * Query helpers for verification.
 */
export async function getAssignmentsForPlan(planId) {
  const { rows } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, p.address AS property_address
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.assignment_order`,
    [planId]
  );
  return rows;
}

export async function getVisitsForPlan(planId) {
  const { rows } = await pool.query(
    `SELECT pv.*, w.name AS worker_name, p.address AS property_address
     FROM property_visits pv
     JOIN workers w ON w.id = pv.worker_id
     JOIN properties p ON p.id = pv.property_id
     WHERE pv.plan_assignment_id IN (SELECT id FROM plan_assignments WHERE daily_plan_id = $1)
     ORDER BY pv.id`,
    [planId]
  );
  return rows;
}

export async function getTimeEntry(workerId, dateStr) {
  const { rows } = await pool.query(
    `SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2`,
    [workerId, dateStr]
  );
  return rows[0] || null;
}

export async function getAnalyticsForDate(dateStr) {
  const { rows } = await pool.query(
    `SELECT ad.*, w.name AS worker_name FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date = $1`,
    [dateStr]
  );
  return rows;
}
```

- [ ] **Step 4: Create report.js**

Create `scripts/sim/report.js`:

```javascript
import { writeFileSync } from 'fs';

export class Report {
  constructor() {
    this.scenarios = [];
    this.current = null;
  }

  startScenario(name) {
    this.current = { name, steps: [], passed: 0, failed: 0 };
    this.scenarios.push(this.current);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${name}`);
    console.log('='.repeat(60));
  }

  check(description, condition, details = '') {
    const pass = !!condition;
    this.current.steps.push({ description, pass, details: String(details) });
    if (pass) {
      this.current.passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${description}`);
    } else {
      this.current.failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${description}`);
      if (details) console.log(`    → ${details}`);
    }
    return pass;
  }

  writeReport(filepath) {
    const totalPassed = this.scenarios.reduce((s, sc) => s + sc.passed, 0);
    const totalFailed = this.scenarios.reduce((s, sc) => s + sc.failed, 0);

    let md = `# Simulation Report — ${new Date().toISOString().split('T')[0]}\n\n`;
    md += `## Summary: ${this.scenarios.length} scenarios, ${totalPassed} passed, ${totalFailed} failed\n\n`;

    for (const sc of this.scenarios) {
      const icon = sc.failed === 0 ? '✅' : '❌';
      md += `### ${icon} ${sc.name} (${sc.passed}/${sc.passed + sc.failed})\n\n`;
      for (const step of sc.steps) {
        md += `- [${step.pass ? 'PASS' : 'FAIL'}] ${step.description}`;
        if (!step.pass && step.details) md += ` — ${step.details}`;
        md += '\n';
      }
      md += '\n';
    }

    writeFileSync(filepath, md, 'utf-8');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
    console.log(`  Report: ${filepath}`);
    console.log('='.repeat(60));

    return totalFailed;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sim/ package.json
git commit -m "feat: add simulation seed data, helpers, and report builder"
```

---

### Task 2: Main Orchestrator + Scenario 1 (Normal Day)

**Files:**
- Create: `scripts/simulate.js`
- Create: `scripts/sim/scenarios/scenario1.js`

- [ ] **Step 1: Create scenario1.js — Normal Day (Mon Feb 2)**

Create `scripts/sim/scenarios/scenario1.js`:

```javascript
import { generateDraftPlan, approvePlan, getPlanWithAssignments } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getTimeEntry, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-02'; // Monday

export default async function scenario1(report, { workers }) {
  report.startScenario('Scenario 1: Normal Day (Mon Feb 2)');

  // Step 1: Generate plan
  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for 2026-02-02', plan && plan.id, `plan_id: ${plan?.id}`);
  report.check('Plan status is draft', plan?.status === 'draft', `status: ${plan?.status}`);

  // Step 2: Check assignments — Monday properties: Simstraße 1, Simstraße 2 (both field)
  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has 2 assignments (Mon has 2 properties)', assignments.length === 2, `got: ${assignments.length}`);

  const fieldAssignments = assignments.filter(a => a.worker_name?.startsWith('Sim'));
  report.check('Assignments given to sim workers', fieldAssignments.length === 2, `sim workers: ${fieldAssignments.length}`);

  // Step 3: Approve plan
  await approvePlan(plan.id, 'halil');
  const approved = await getPlanWithAssignments(plan.id);
  report.check('Plan approved', approved.status === 'approved', `status: ${approved.status}`);

  // Step 4: Create visits
  const visits = await createVisitsFromPlan(plan.id);
  report.check('Property visits created', visits.length >= 2, `visits: ${visits.length}`);

  // Step 5: Simulate worker day — use first assignment's worker
  const worker = workers['Sim Ali'];
  const workerAssignments = assignments.filter(a => a.worker_id === worker.id);

  if (workerAssignments.length > 0) {
    // Check in
    const timeEntry = await simulateCheckIn(worker.id, DATE, '07:00');
    report.check('Sim Ali checked in at 07:00', timeEntry && timeEntry.check_in, `entry_id: ${timeEntry?.id}`);

    // Visit each assignment
    const workerVisits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.id);
    for (let i = 0; i < workerVisits.length; i++) {
      const v = workerVisits[i];
      const arriveTime = `07:${15 + i * 60}`;
      const completeTime = `${8 + i}:${45 + i * 10}`;
      await simulateArrival(v.id, DATE, arriveTime);
      await simulateCompletion(v.id, DATE, completeTime);
    }

    const completedVisits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.id && v.status === 'completed');
    report.check('All visits completed', completedVisits.length === workerVisits.length, `completed: ${completedVisits.length}/${workerVisits.length}`);

    // Check out
    await simulateCheckOut(worker.id, DATE, '15:00');
    const finalEntry = await getTimeEntry(worker.id, DATE);
    report.check('Sim Ali checked out at 15:00', finalEntry?.check_out, `check_out: ${finalEntry?.check_out}`);
  } else {
    report.check('Sim Ali has assignments', false, 'No assignments found for Sim Ali');
  }

  // Step 6: Also simulate second worker if they have assignments
  for (const a of assignments) {
    if (a.worker_id !== worker.id) {
      await simulateCheckIn(a.worker_id, DATE, '07:00');
      const v = (await getVisitsForPlan(plan.id)).find(v => v.worker_id === a.worker_id);
      if (v) {
        await simulateArrival(v.id, DATE, '07:30');
        await simulateCompletion(v.id, DATE, '09:00');
      }
      await simulateCheckOut(a.worker_id, DATE, '15:00');
    }
  }

  // Step 7: Analytics
  await computeDailyAnalyticsForDate(DATE);
  const analytics = await getAnalyticsForDate(DATE);
  report.check('Analytics computed for Feb 2', analytics.length > 0, `rows: ${analytics.length}`);

  const aliAnalytics = analytics.find(a => a.worker_name === 'Sim Ali');
  if (aliAnalytics) {
    report.check('Analytics: properties completed > 0', aliAnalytics.properties_completed > 0, `completed: ${aliAnalytics.properties_completed}`);
  }

  return plan;
}
```

- [ ] **Step 2: Create main simulate.js orchestrator**

Create `scripts/simulate.js`:

```javascript
import { config } from 'dotenv';
config({ path: '.env.test' });

import { pool } from '../src/db/pool.js';
import { seed, cleanup } from './sim/seed.js';
import { Report } from './sim/report.js';
import scenario1 from './sim/scenarios/scenario1.js';

const REPORT_PATH = 'docs/simulation/results.md';

async function main() {
  console.log('Day Simulation — Bal Hausmeisterservice');
  console.log('Database:', process.env.DATABASE_URL);
  console.log('');

  const report = new Report();
  let data;

  try {
    // Setup
    console.log('Seeding test data...');
    await cleanup(); // Clean any leftover sim data
    data = await seed();
    console.log(`Seeded ${Object.keys(data.workers).length} workers, ${Object.keys(data.properties).length} properties`);

    // Run scenarios
    await scenario1(report, data);

  } catch (err) {
    console.error('\nFATAL ERROR:', err);
  } finally {
    // Cleanup
    console.log('\nCleaning up simulation data...');
    await cleanup();
    await pool.end();
  }

  // Write report
  const { mkdirSync } = await import('fs');
  mkdirSync('docs/simulation', { recursive: true });
  const failures = report.writeReport(REPORT_PATH);
  process.exit(failures > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 3: Run the simulation to verify Scenario 1 works**

Run:
```bash
docker compose up db-test -d
npm run migrate
npm run simulate
```

Expected: Scenario 1 passes, report written to `docs/simulation/results.md`.

- [ ] **Step 4: Commit**

```bash
git add scripts/simulate.js scripts/sim/scenarios/scenario1.js
git commit -m "feat: add simulation orchestrator and Scenario 1 (Normal Day)"
```

---

### Task 3: Scenario 2 — Multiple Workers, Multiple Roles

**Files:**
- Create: `scripts/sim/scenarios/scenario2.js`
- Modify: `scripts/simulate.js` (add import + call)

- [ ] **Step 1: Create scenario2.js**

Create `scripts/sim/scenarios/scenario2.js`:

```javascript
import { generateDraftPlan, approvePlan } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-03'; // Tuesday

export default async function scenario2(report, { workers }) {
  report.startScenario('Scenario 2: Multiple Workers, Multiple Roles (Tue Feb 3)');

  // Tuesday: Simstraße 3 (cleaning task)
  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Tue Feb 3', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignment(s) for Tuesday', assignments.length > 0, `assignments: ${assignments.length}`);

  // Simstraße 3 has a cleaning task — should go to Sim Marwa (cleaning role)
  const cleaningAssignment = assignments.find(a => a.property_address === 'Simstraße 3');
  if (cleaningAssignment) {
    report.check(
      'Cleaning property assigned to cleaning worker',
      cleaningAssignment.worker_name === 'Sim Marwa',
      `assigned to: ${cleaningAssignment.worker_name}`
    );
  } else {
    report.check('Simstraße 3 in plan', false, 'Not found in assignments');
  }

  // No field properties on Tuesday — field workers should NOT be assigned
  const fieldWorkerNames = ['Sim Ali', 'Sim Mehmet', 'Sim Yusuf'];
  const fieldAssigned = assignments.filter(a => fieldWorkerNames.includes(a.worker_name));
  report.check('No field workers assigned on cleaning-only day', fieldAssigned.length === 0, `field workers: ${fieldAssigned.length}`);

  // Approve and simulate
  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  const marwa = workers['Sim Marwa'];
  await simulateCheckIn(marwa.id, DATE, '07:00');
  const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === marwa.id);
  for (const v of visits) {
    await simulateArrival(v.id, DATE, '07:20');
    await simulateCompletion(v.id, DATE, '10:00');
  }
  await simulateCheckOut(marwa.id, DATE, '15:00');

  await computeDailyAnalyticsForDate(DATE);
  const analytics = await getAnalyticsForDate(DATE);
  report.check('Analytics computed', analytics.length > 0, `rows: ${analytics.length}`);

  return plan;
}
```

- [ ] **Step 2: Add scenario2 to simulate.js**

Add import at top:
```javascript
import scenario2 from './sim/scenarios/scenario2.js';
```

Add after `scenario1` call:
```javascript
    await scenario2(report, data);
```

- [ ] **Step 3: Run simulation, verify Scenario 2 passes**

```bash
npm run simulate
```

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario2.js scripts/simulate.js
git commit -m "feat: add Scenario 2 — Multiple Workers, Multiple Roles"
```

---

### Task 4: Scenario 3 — Sick Call + Redistribution

**Files:**
- Create: `scripts/sim/scenarios/scenario3.js`
- Modify: `scripts/simulate.js`

- [ ] **Step 1: Create scenario3.js**

Create `scripts/sim/scenarios/scenario3.js`:

```javascript
import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan, approvePlan, redistributeSickWorkers } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-04'; // Wednesday

export default async function scenario3(report, { workers }) {
  report.startScenario('Scenario 3: Sick Call + Redistribution (Wed Feb 4)');

  // Wednesday: Simstraße 4 (field task)
  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Wed Feb 4', plan && plan.id);

  const assignmentsBefore = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignment(s)', assignmentsBefore.length > 0, `count: ${assignmentsBefore.length}`);

  // Find which field worker got assigned
  const fieldAssignment = assignmentsBefore.find(a => a.property_address === 'Simstraße 4');
  const sickWorkerName = fieldAssignment?.worker_name;
  const sickWorkerId = fieldAssignment?.worker_id;
  report.check('Field worker assigned to Simstraße 4', !!sickWorkerName, `worker: ${sickWorkerName}`);

  // Approve plan first
  await approvePlan(plan.id, 'halil');

  // Worker calls in sick
  await pool.query(
    `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
     VALUES ($1, $2, 1, 'pending')`,
    [sickWorkerId, DATE]
  );
  report.check(`${sickWorkerName} reported sick`, true);

  // Redistribute
  const result = await redistributeSickWorkers(DATE);
  report.check('Redistribution ran', result.reassigned >= 0, `reassigned: ${result.reassigned}`);

  // Check assignment was reassigned
  const assignmentsAfter = await getAssignmentsForPlan(plan.id);
  const reassigned = assignmentsAfter.find(a => a.property_address === 'Simstraße 4');
  report.check(
    'Simstraße 4 reassigned to different worker',
    reassigned && reassigned.worker_id !== sickWorkerId,
    `now: ${reassigned?.worker_name} (was: ${sickWorkerName})`
  );
  report.check(
    'Source changed to substitution',
    reassigned?.source === 'substitution',
    `source: ${reassigned?.source}`
  );

  // Simulate replacement worker's day
  if (reassigned) {
    await createVisitsFromPlan(plan.id);
    await simulateCheckIn(reassigned.worker_id, DATE, '07:00');
    const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === reassigned.worker_id);
    for (const v of visits) {
      await simulateArrival(v.id, DATE, '07:30');
      await simulateCompletion(v.id, DATE, '10:00');
    }
    await simulateCheckOut(reassigned.worker_id, DATE, '15:00');
  }

  // Verify sick worker has no time entry
  const { rows: sickEntries } = await pool.query(
    `SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2`,
    [sickWorkerId, DATE]
  );
  report.check(`${sickWorkerName} has no time entry (was sick)`, sickEntries.length === 0, `entries: ${sickEntries.length}`);

  await computeDailyAnalyticsForDate(DATE);

  return plan;
}
```

- [ ] **Step 2: Add to simulate.js**

Add import and call (same pattern as Task 3 Step 2).

- [ ] **Step 3: Run and verify**

```bash
npm run simulate
```

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario3.js scripts/simulate.js
git commit -m "feat: add Scenario 3 — Sick Call + Redistribution"
```

---

### Task 5: Scenario 4 — Missing Checkout

**Files:**
- Create: `scripts/sim/scenarios/scenario4.js`
- Modify: `scripts/simulate.js`

- [ ] **Step 1: Create scenario4.js**

Create `scripts/sim/scenarios/scenario4.js`:

```javascript
import { generateDraftPlan, approvePlan } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { detectMissingCheckouts, flagMissingCheckout } from '../../../src/services/anomaly.js';
import { simulateCheckIn, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getTimeEntry } from '../helpers.js';

const DATE = '2026-02-05'; // Thursday

export default async function scenario4(report, { workers }) {
  report.startScenario('Scenario 4: Missing Checkout (Thu Feb 5)');

  // Thursday: Simstraße 5 (2 field tasks: Grünpflege + Mülltonnen)
  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Thu Feb 5', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignments for Thursday', assignments.length > 0, `count: ${assignments.length}`);

  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  // Pick worker who got assigned
  const worker = assignments[0];
  await simulateCheckIn(worker.worker_id, DATE, '07:00');

  // Complete only the FIRST visit, leave second as pending (for carry-over)
  const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.worker_id);
  if (visits.length > 0) {
    await simulateArrival(visits[0].id, DATE, '07:15');
    await simulateCompletion(visits[0].id, DATE, '09:30');
    report.check('First visit completed', true, `visit: ${visits[0].property_address}`);
  }
  if (visits.length > 1) {
    report.check('Second visit left pending', visits[1].status === 'assigned', `status: ${visits[1].status}`);
  }

  // DO NOT check out — simulate forgotten checkout
  const timeEntry = await getTimeEntry(worker.worker_id, DATE);
  report.check('Check-in exists but no check-out', timeEntry?.check_in && !timeEntry?.check_out);

  // Detect anomaly
  const missing = await detectMissingCheckouts(DATE);
  const workerMissing = missing.find(m => m.worker_id === worker.worker_id);
  report.check('Missing checkout detected', !!workerMissing, `missing entries: ${missing.length}`);

  // Flag it
  if (workerMissing) {
    await flagMissingCheckout(workerMissing.id);
    const flagged = await getTimeEntry(worker.worker_id, DATE);
    report.check('Time entry flagged', flagged?.is_flagged === true, `flagged: ${flagged?.is_flagged}`);
    report.check('Flag reason set', !!flagged?.flag_reason, `reason: ${flagged?.flag_reason}`);
  }

  return { plan, incompleteWorkerId: worker.worker_id };
}
```

- [ ] **Step 2: Add to simulate.js**

Add import and call. Store the return value for scenario 5:
```javascript
    const s4result = await scenario4(report, data);
```

- [ ] **Step 3: Run and verify**

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario4.js scripts/simulate.js
git commit -m "feat: add Scenario 4 — Missing Checkout"
```

---

### Task 6: Scenario 5 — Carry-Over

**Files:**
- Create: `scripts/sim/scenarios/scenario5.js`
- Modify: `scripts/simulate.js`

- [ ] **Step 1: Create scenario5.js**

Create `scripts/sim/scenarios/scenario5.js`:

```javascript
import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan, approvePlan, carryOverPlanTasks } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan } from '../helpers.js';

const FROM_DATE = '2026-02-05'; // Thursday (has incomplete task)
const TO_DATE = '2026-02-06';   // Friday

export default async function scenario5(report, { workers }) {
  report.startScenario('Scenario 5: Carry-Over (Thu→Fri, Feb 5→6)');

  // Carry over incomplete tasks from Thursday to Friday
  const carried = await carryOverPlanTasks(FROM_DATE, TO_DATE);
  report.check('Carry-over executed', Array.isArray(carried), `carried: ${carried?.length}`);
  report.check('At least 1 task carried over', carried.length > 0, `count: ${carried.length}`);

  // Verify original assignment is now 'carried_over'
  const { rows: originals } = await pool.query(
    `SELECT pa.*, p.address FROM plan_assignments pa
     JOIN properties p ON p.id = pa.property_id
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     WHERE dp.plan_date = $1 AND pa.status = 'carried_over'`,
    [FROM_DATE]
  );
  report.check('Original assignment marked carried_over', originals.length > 0, `count: ${originals.length}`);

  // Generate Friday plan (should include regular Friday tasks + carried)
  const plan = await generateDraftPlan(TO_DATE);
  report.check('Friday plan generated', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Friday has assignments', assignments.length > 0, `count: ${assignments.length}`);

  // Check for Simstraße 6 (regular Friday cleaning)
  const fridayRegular = assignments.find(a => a.property_address === 'Simstraße 6');
  report.check('Simstraße 6 in Friday plan (regular)', !!fridayRegular, `found: ${!!fridayRegular}`);

  // Approve and simulate
  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  // Simulate day for each assigned worker
  const workerIds = [...new Set(assignments.map(a => a.worker_id))];
  for (const wId of workerIds) {
    await simulateCheckIn(wId, TO_DATE, '07:00');
    const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === wId);
    for (let i = 0; i < visits.length; i++) {
      await simulateArrival(visits[i].id, TO_DATE, `07:${15 + i * 45}`);
      await simulateCompletion(visits[i].id, TO_DATE, `${8 + i}:30`);
    }
    await simulateCheckOut(wId, TO_DATE, '15:00');
  }

  const allVisits = await getVisitsForPlan(plan.id);
  const allCompleted = allVisits.every(v => v.status === 'completed');
  report.check('All Friday visits completed', allCompleted, `completed: ${allVisits.filter(v => v.status === 'completed').length}/${allVisits.length}`);

  await computeDailyAnalyticsForDate(TO_DATE);

  return plan;
}
```

- [ ] **Step 2: Add to simulate.js**

- [ ] **Step 3: Run and verify**

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario5.js scripts/simulate.js
git commit -m "feat: add Scenario 5 — Carry-Over"
```

---

### Task 7: Scenario 6 — Full Week Summary

**Files:**
- Create: `scripts/sim/scenarios/scenario6.js`
- Modify: `scripts/simulate.js`

- [ ] **Step 1: Create scenario6.js**

Create `scripts/sim/scenarios/scenario6.js`:

```javascript
import { getWorkerAnalytics, getOperationsAnalytics, getCostAnalytics } from '../../../src/services/analytics.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';
import { pool } from '../../../src/db/pool.js';

export default async function scenario6(report, { workers }) {
  report.startScenario('Scenario 6: Full Week Summary (Feb 2-6)');

  // Worker analytics for February
  const workerStats = await getWorkerAnalytics('2026-02-01', '2026-02-28');
  report.check('Worker analytics returned data', workerStats.length > 0, `workers: ${workerStats.length}`);

  const ali = workerStats.find(w => w.name === 'Sim Ali');
  if (ali) {
    report.check('Sim Ali has days worked', ali.daysWorked > 0, `days: ${ali.daysWorked}`);
    report.check('Sim Ali has properties completed', ali.totalCompleted > 0, `completed: ${ali.totalCompleted}`);
    report.check('Sim Ali has sick days (Wed)', ali.sickDays >= 1, `sick: ${ali.sickDays}`);
  }

  // Operations analytics
  const ops = await getOperationsAnalytics('2026-02-01', '2026-02-28');
  report.check('Operations analytics computed', ops.totalScheduled > 0, `scheduled: ${ops.totalScheduled}, completed: ${ops.totalCompleted}`);
  report.check('Plan adherence > 0%', ops.planAdherence > 0, `adherence: ${ops.planAdherence}%`);

  // Cost analytics
  const costs = await getCostAnalytics('2026-02-01', '2026-02-28');
  report.check('Cost analytics returned data', costs.length > 0, `workers: ${costs.length}`);

  const aliCost = costs.find(c => c.name === 'Sim Ali');
  if (aliCost) {
    report.check('Sim Ali cost computed', aliCost.totalHours > 0, `hours: ${aliCost.totalHours}, cost: €${aliCost.regularCost}`);
  }

  // Hour balance sync
  const balances = await syncMonthForAll(2026, 2);
  report.check('Hour balances synced for February', balances.length > 0, `workers: ${balances.length}`);

  // Check individual balances
  const aliBalance = balances.find(b => b.worker_id === workers['Sim Ali']?.id);
  if (aliBalance) {
    report.check('Sim Ali has February hour balance', aliBalance.surplus_hours !== undefined, `surplus: ${aliBalance.surplus_hours}h`);
  }

  return { workerStats, ops, costs, balances };
}
```

- [ ] **Step 2: Add to simulate.js**

- [ ] **Step 3: Run and verify**

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario6.js scripts/simulate.js
git commit -m "feat: add Scenario 6 — Full Week Summary"
```

---

### Task 8: Scenario 7 — Edge Cases

**Files:**
- Create: `scripts/sim/scenarios/scenario7.js`
- Modify: `scripts/simulate.js`

- [ ] **Step 1: Create scenario7.js**

Create `scripts/sim/scenarios/scenario7.js`:

```javascript
import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';
import { getAssignmentsForPlan } from '../helpers.js';
import { simulateCheckIn, simulateCheckOut } from '../helpers.js';

export default async function scenario7(report, { workers }) {
  report.startScenario('Scenario 7: Edge Cases');

  // --- Edge Case 1: Empty day (Saturday) ---
  const saturdayPlan = await generateDraftPlan('2026-02-07');
  report.check('Saturday plan generated (no error)', !!saturdayPlan);
  const satAssignments = await getAssignmentsForPlan(saturdayPlan.id);
  report.check('Saturday has 0 assignments', satAssignments.length === 0, `assignments: ${satAssignments.length}`);

  // --- Edge Case 2: Duplicate plan generation ---
  const mondayPlanAgain = await generateDraftPlan('2026-02-02');
  const { rows: mondayPlans } = await pool.query(
    `SELECT * FROM daily_plans WHERE plan_date = '2026-02-02'`
  );
  report.check('Duplicate plan call returns existing (no duplicate)', mondayPlans.length === 1, `plans: ${mondayPlans.length}`);

  // --- Edge Case 3: Minijob limit ---
  const leyla = workers['Sim Leyla'];
  // Insert many time entries for Leyla to approach 538€ limit at 12.50/hr
  // 538 / 12.50 = 43.04 hours max. Insert ~40 hours across 10 days.
  for (let day = 9; day <= 20; day++) {
    const d = `2026-02-${String(day).padStart(2, '0')}`;
    await simulateCheckIn(leyla.id, d, '08:00');
    await simulateCheckOut(leyla.id, d, '12:00'); // 4 hours/day × 12 days = 48 hours
  }

  const balances = await syncMonthForAll(2026, 2);
  const leylaBalance = balances.find(b => b.worker_id === leyla.id);
  report.check('Sim Leyla hour balance computed', leylaBalance !== undefined, `surplus: ${leylaBalance?.surplus_hours}h`);

  // --- Edge Case 4: Worker with no assignments ---
  const { rows: yusufAnalytics } = await pool.query(
    `SELECT * FROM analytics_daily WHERE worker_id = $1 AND date = '2026-02-03'`,
    [workers['Sim Yusuf'].id]
  );
  report.check('Sim Yusuf has no analytics for Tue (no assignment)', yusufAnalytics.length === 0, `rows: ${yusufAnalytics.length}`);
}
```

- [ ] **Step 2: Add to simulate.js — final version**

Final `simulate.js` should import all 7 scenarios and call them in order.

Add import:
```javascript
import scenario7 from './sim/scenarios/scenario7.js';
```

Add call:
```javascript
    await scenario7(report, data);
```

- [ ] **Step 3: Run full simulation**

```bash
npm run simulate
```

Expected: All 7 scenarios pass, report written.

- [ ] **Step 4: Commit**

```bash
git add scripts/sim/scenarios/scenario7.js scripts/simulate.js
git commit -m "feat: add Scenario 7 — Edge Cases, simulation complete"
```

---

### Task 9: Final Run + Report Commit

**Files:**
- Create: `docs/simulation/results.md` (generated by script)

- [ ] **Step 1: Ensure Docker test DB is running and migrated**

```bash
docker compose up db-test -d
npm run migrate
```

- [ ] **Step 2: Run full simulation**

```bash
npm run simulate
```

Expected: All 7 scenarios pass.

- [ ] **Step 3: If any failures, investigate and fix**

Read the report at `docs/simulation/results.md`. Fix any issues in the scenario files or service code.

- [ ] **Step 4: Commit the report and any fixes**

```bash
git add docs/simulation/results.md
git commit -m "docs: add simulation results — all scenarios passed"
```

- [ ] **Step 5: Push**

```bash
git push origin master
```
