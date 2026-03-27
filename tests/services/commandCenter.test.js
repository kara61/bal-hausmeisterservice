import { describe, it, expect } from 'vitest';
import { deriveWorkerStatus, computeStatsSummary, getCommandCenterData } from '../../src/services/commandCenter.js';
import { describeWithDb, cleanDb, createTestWorker, createTestProperty, createTestPlan, createTestAssignment } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

describe('deriveWorkerStatus', () => {
  it('returns "not_started" when no time entry exists', () => {
    expect(deriveWorkerStatus(null, [])).toBe('not_started');
  });

  it('returns "checked_in" when checked in but no assignments started', () => {
    const entry = { check_in: '2026-03-26T07:00:00Z', check_out: null };
    const assignments = [{ status: 'assigned' }, { status: 'assigned' }];
    expect(deriveWorkerStatus(entry, assignments)).toBe('checked_in');
  });

  it('returns "working" when checked in and at least one assignment started', () => {
    const entry = { check_in: '2026-03-26T07:00:00Z', check_out: null };
    const assignments = [{ status: 'started' }, { status: 'assigned' }];
    expect(deriveWorkerStatus(entry, assignments)).toBe('working');
  });

  it('returns "done" when all assignments completed', () => {
    const entry = { check_in: '2026-03-26T07:00:00Z', check_out: null };
    const assignments = [{ status: 'completed' }, { status: 'completed' }];
    expect(deriveWorkerStatus(entry, assignments)).toBe('done');
  });

  it('returns "done" when checked out', () => {
    const entry = { check_in: '2026-03-26T07:00:00Z', check_out: '2026-03-26T15:00:00Z' };
    const assignments = [{ status: 'completed' }];
    expect(deriveWorkerStatus(entry, assignments)).toBe('done');
  });
});

describe('computeStatsSummary', () => {
  it('computes correct counts from worker and assignment data', () => {
    const workers = [
      { id: 1, status: 'working', assignments: [{ status: 'completed' }, { status: 'started' }] },
      { id: 2, status: 'checked_in', assignments: [{ status: 'assigned' }] },
      { id: 3, status: 'not_started', assignments: [{ status: 'assigned' }] },
    ];
    const alerts = [{ type: 'flagged_entry' }, { type: 'sick_leave' }];
    const garbageCount = 3;

    const stats = computeStatsSummary(workers, alerts, garbageCount);

    expect(stats.workersActive).toBe(2);
    expect(stats.workersTotal).toBe(3);
    expect(stats.propertiesCompleted).toBe(1);
    expect(stats.propertiesInProgress).toBe(1);
    expect(stats.propertiesRemaining).toBe(2);
    expect(stats.propertiesTotal).toBe(4);
    expect(stats.alertCount).toBe(2);
    expect(stats.garbageCount).toBe(3);
  });

  it('handles empty inputs', () => {
    const stats = computeStatsSummary([], [], 0);
    expect(stats.workersActive).toBe(0);
    expect(stats.propertiesTotal).toBe(0);
  });
});

describeWithDb('getCommandCenterData', () => {
  beforeEach(async () => { await cleanDb(); });
  afterEach(async () => { await cleanDb(); });

  it('returns combined payload for a date with plan and workers', async () => {
    const today = '2026-03-26';
    const worker = await createTestWorker({ name: 'Ali' });
    const property = await createTestProperty({ assigned_weekday: 4 });
    const plan = await createTestPlan({ plan_date: today, status: 'approved' });
    await createTestAssignment(plan.id, worker.id, property.id);

    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, NOW())`,
      [worker.id, today]
    );

    const data = await getCommandCenterData(today);

    expect(data.date).toBe(today);
    expect(data.planStatus).toBe('approved');
    expect(data.planId).toBe(plan.id);
    expect(data.workers).toHaveLength(1);
    expect(data.workers[0].name).toBe('Ali');
    expect(data.workers[0].status).toBe('checked_in');
    expect(data.workers[0].assignments).toHaveLength(1);
    expect(data.stats.workersActive).toBe(1);
    expect(data.stats.workersTotal).toBe(1);
    expect(data.stats.propertiesTotal).toBe(1);
    expect(data.alerts).toBeDefined();
    expect(data.timeline).toBeDefined();
  });

  it('returns empty state when no plan exists', async () => {
    const data = await getCommandCenterData('2026-03-26');

    expect(data.planStatus).toBe('none');
    expect(data.planId).toBeNull();
    expect(data.workers).toEqual([]);
    expect(data.stats.workersTotal).toBe(0);
  });

  it('excludes non-field worker time entries from timeline', async () => {
    const today = '2026-03-26';
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
    const property = await createTestProperty({ assigned_weekday: 4 });
    const plan = await createTestPlan({ plan_date: today, status: 'approved' });
    await createTestAssignment(plan.id, fieldWorker.id, property.id);

    // Both workers have time entries
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, NOW()), ($3, $2, NOW())`,
      [fieldWorker.id, today, officeWorker.id]
    );

    const data = await getCommandCenterData(today);

    const timelineNames = data.timeline.map(t => t.worker_name);
    expect(timelineNames).toContain('Ali');
    expect(timelineNames).not.toContain('Buero');
  });
});

describeWithDb('getCommandCenterData - full integration', () => {
  beforeEach(async () => { await cleanDb(); });
  afterEach(async () => { await cleanDb(); });

  it('returns correct stats, workers, alerts, and timeline for a working day', async () => {
    const today = '2026-03-26';

    // Set up 2 workers, 3 properties, 1 plan with assignments
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop1 = await createTestProperty({ address: 'Mozartstraße 12', assigned_weekday: 4 });
    const prop2 = await createTestProperty({ address: 'Beethoven Residenz', assigned_weekday: 4 });
    const prop3 = await createTestProperty({ address: 'Am Stadtpark 5', assigned_weekday: 4 });

    const plan = await createTestPlan({ plan_date: today, status: 'approved' });
    await createTestAssignment(plan.id, worker1.id, prop1.id, { status: 'completed', assignment_order: 1 });
    await createTestAssignment(plan.id, worker1.id, prop2.id, { status: 'started', assignment_order: 2 });
    await createTestAssignment(plan.id, worker2.id, prop3.id, { status: 'assigned', assignment_order: 1 });

    // Worker 1 checked in, Worker 2 not yet
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, '2026-03-26T07:00:00Z')`,
      [worker1.id, today]
    );

    const data = await getCommandCenterData(today);

    // Plan
    expect(data.planStatus).toBe('approved');
    expect(data.planId).toBe(plan.id);

    // Stats
    expect(data.stats.workersActive).toBe(1);
    expect(data.stats.workersTotal).toBe(2);
    expect(data.stats.propertiesCompleted).toBe(1);
    expect(data.stats.propertiesInProgress).toBe(1);
    expect(data.stats.propertiesRemaining).toBe(1);
    expect(data.stats.propertiesTotal).toBe(3);

    // Workers
    expect(data.workers).toHaveLength(2);
    const ali = data.workers.find(w => w.name === 'Ali');
    expect(ali.status).toBe('working');
    expect(ali.completedCount).toBe(1);
    expect(ali.totalCount).toBe(2);
    expect(ali.checkIn).toBeTruthy();

    const mehmet = data.workers.find(w => w.name === 'Mehmet');
    expect(mehmet.status).toBe('not_started');
    expect(mehmet.completedCount).toBe(0);

    // Timeline
    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0].worker_name).toBe('Ali');

    // Alerts
    expect(data.alerts).toBeDefined();
    expect(Array.isArray(data.alerts)).toBe(true);
  });
});
