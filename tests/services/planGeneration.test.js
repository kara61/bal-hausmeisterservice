import { describe, it, expect } from 'vitest';
import { getAvailableWorkers, findBestWorkerForProperty } from '../../src/services/planGeneration.js';

describe('getAvailableWorkers', () => {
  it('excludes workers who are on sick leave', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
      { id: 3, name: 'Hasan' },
    ];
    const sickWorkerIds = [2];
    const vacationWorkerIds = [];
    const result = getAvailableWorkers(workers, sickWorkerIds, vacationWorkerIds);
    expect(result).toHaveLength(2);
    expect(result.map(w => w.id)).toEqual([1, 3]);
  });

  it('excludes workers who are on vacation', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
    ];
    const result = getAvailableWorkers(workers, [], [1]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('excludes both sick and vacation workers', () => {
    const workers = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Mehmet' },
      { id: 3, name: 'Hasan' },
    ];
    const result = getAvailableWorkers(workers, [1], [3]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('findBestWorkerForProperty', () => {
  it('returns flex worker with fewest assignments first', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: false, assignment_count: 1 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 2 },
      { id: 3, name: 'Hasan', is_flex: true, assignment_count: 1 },
    ];
    const result = findBestWorkerForProperty(available, 10, []);
    expect(result.id).toBe(3);
  });

  it('prefers worker who has serviced the property before', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: true, assignment_count: 2 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 3 },
    ];
    const propertyHistory = [2];
    const result = findBestWorkerForProperty(available, 10, propertyHistory);
    expect(result.id).toBe(2);
  });

  it('returns null if no workers available', () => {
    const result = findBestWorkerForProperty([], 10, []);
    expect(result).toBeNull();
  });

  it('skips workers at max capacity', () => {
    const available = [
      { id: 1, name: 'Ali', is_flex: true, assignment_count: 4, max_properties: 4 },
      { id: 2, name: 'Mehmet', is_flex: true, assignment_count: 2, max_properties: 4 },
    ];
    const result = findBestWorkerForProperty(available, 10, []);
    expect(result.id).toBe(2);
  });
});
