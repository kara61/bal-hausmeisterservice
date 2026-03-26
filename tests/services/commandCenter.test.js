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
});
