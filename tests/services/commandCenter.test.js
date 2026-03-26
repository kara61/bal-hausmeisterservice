import { describe, it, expect } from 'vitest';
import { deriveWorkerStatus, computeStatsSummary } from '../../src/services/commandCenter.js';

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
