import { describe, it, expect } from 'vitest';
import {
  getWeekday,
  shouldCarryOver,
  formatTaskList,
  shouldTaskRunOnDate,
} from '../../src/services/taskScheduling.js';

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

describe('shouldTaskRunOnDate', () => {
  it('returns true for property_default when weekday matches', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: 1 };
    expect(shouldTaskRunOnDate(task, property, '2026-03-23')).toBe(true);
  });

  it('returns false for property_default when weekday does not match', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: 1 };
    expect(shouldTaskRunOnDate(task, property, '2026-03-24')).toBe(false);
  });

  it('returns false for property_default when property has no assigned_weekday', () => {
    const task = { schedule_type: 'property_default' };
    const property = { assigned_weekday: null };
    expect(shouldTaskRunOnDate(task, property, '2026-03-23')).toBe(false);
  });

  it('returns true for weekly when weekday matches schedule_day', () => {
    const task = { schedule_type: 'weekly', schedule_day: 3 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-25')).toBe(true);
  });

  it('returns false for weekly when weekday does not match', () => {
    const task = { schedule_type: 'weekly', schedule_day: 3 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-23')).toBe(false);
  });

  it('returns true for biweekly on the start week', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1,
      biweekly_start_date: '2026-03-23',
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-23')).toBe(true);
  });

  it('returns false for biweekly on the off-week', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1,
      biweekly_start_date: '2026-03-23',
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-30')).toBe(false);
  });

  it('returns true for biweekly two weeks after start', () => {
    const task = {
      schedule_type: 'biweekly',
      schedule_day: 1,
      biweekly_start_date: '2026-03-23',
    };
    expect(shouldTaskRunOnDate(task, {}, '2026-04-06')).toBe(true);
  });

  it('returns true for monthly when day-of-month matches', () => {
    const task = { schedule_type: 'monthly', schedule_day: 15 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-15')).toBe(true);
  });

  it('returns false for monthly when day-of-month does not match', () => {
    const task = { schedule_type: 'monthly', schedule_day: 15 };
    expect(shouldTaskRunOnDate(task, {}, '2026-03-16')).toBe(false);
  });
});
