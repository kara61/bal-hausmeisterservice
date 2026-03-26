import { describe, it, expect } from 'vitest';
import { getWeekday, shouldCarryOver, formatTaskList } from '../../src/services/taskScheduling.js';

describe('getWeekday', () => {
  it('returns 1 for Monday (2026-03-23)', () => {
    expect(getWeekday('2026-03-23')).toBe(1);
  });

  it('returns 0 for Sunday (2026-03-29)', () => {
    expect(getWeekday('2026-03-29')).toBe(0);
  });
});

describe('shouldCarryOver', () => {
  it('returns true for pending', () => {
    expect(shouldCarryOver({ status: 'pending' })).toBe(true);
  });

  it('returns true for in_progress', () => {
    expect(shouldCarryOver({ status: 'in_progress' })).toBe(true);
  });

  it('returns false for done', () => {
    expect(shouldCarryOver({ status: 'done' })).toBe(false);
  });

  it('returns false for postponed', () => {
    expect(shouldCarryOver({ status: 'postponed' })).toBe(false);
  });
});

describe('formatTaskList', () => {
  it('formats a list of tasks with header and numbered items', () => {
    const tasks = [
      { address: 'Musterstr. 1', city: 'Hannover', task_description: 'Rasen maehen' },
      { address: 'Beispielweg 5', city: 'Berlin', task_description: 'Treppe reinigen' },
    ];
    const result = formatTaskList(tasks, '2026-03-23');
    expect(result).toContain('Deine Aufgaben fuer Montag 23.03:');
    expect(result).toContain('1. Musterstr. 1, Hannover — Rasen maehen');
    expect(result).toContain('2. Beispielweg 5, Berlin — Treppe reinigen');
  });

  it('returns "keine Aufgaben" message when tasks are empty', () => {
    const result = formatTaskList([], '2026-03-29');
    expect(result).toBe('Sonntag 29.03 — keine Aufgaben zugewiesen.');
  });
});
