import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWeekday,
  shouldCarryOver,
  formatTaskList,
  shouldTaskRunOnDate,
  carryOverTasks,
  postponeTask,
} from '../../src/services/taskScheduling.js';
import { pool } from '../../src/db/pool.js';
import { describeWithDb, cleanDb, createTestProperty } from '../helpers.js';

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

// --- Integration tests ---

async function createTestTeam(date = '2026-03-23') {
  const { rows } = await pool.query(
    `INSERT INTO teams (date, name) VALUES ($1, $2) RETURNING *`,
    [date, 'Test Team']
  );
  return rows[0];
}

async function createTestTaskAssignment(overrides = {}) {
  const defaults = {
    property_id: null,
    team_id: null,
    date: '2026-03-23',
    task_description: 'Treppenhausreinigung',
    status: 'pending',
  };
  const t = { ...defaults, ...overrides };
  const { rows } = await pool.query(
    `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [t.property_id, t.team_id, t.date, t.task_description, t.status]
  );
  return rows[0];
}

describeWithDb('carryOverTasks (BUG-005)', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('does not create duplicate tasks when same property+date+description already carried over', async () => {
    const property = await createTestProperty();
    const team = await createTestTeam();

    // Create two pending tasks with DIFFERENT descriptions for the same property
    await createTestTaskAssignment({
      property_id: property.id,
      team_id: team.id,
      date: '2026-03-23',
      task_description: 'Treppenhausreinigung',
      status: 'pending',
    });
    await createTestTaskAssignment({
      property_id: property.id,
      team_id: team.id,
      date: '2026-03-23',
      task_description: 'Rasen mähen',
      status: 'pending',
    });

    // First carry-over should create 2 tasks
    const first = await carryOverTasks('2026-03-23', '2026-03-24');
    expect(first).toHaveLength(2);

    // Second carry-over (e.g. chained or repeated) should not create duplicates
    // Re-create pending tasks for fromDate to simulate chained carry-over
    await createTestTaskAssignment({
      property_id: property.id,
      team_id: team.id,
      date: '2026-03-23',
      task_description: 'Treppenhausreinigung',
      status: 'pending',
    });

    const second = await carryOverTasks('2026-03-23', '2026-03-24');
    expect(second).toHaveLength(0);

    // Verify only 2 tasks exist for the target date
    const { rows } = await pool.query(
      `SELECT * FROM task_assignments WHERE date = $1 AND status = 'pending'`,
      ['2026-03-24']
    );
    expect(rows).toHaveLength(2);
  });
});

describeWithDb('postponeTask (BUG-006)', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('throws a descriptive error when task ID does not exist', async () => {
    await expect(
      postponeTask(999999, 'Regen', '2026-03-25')
    ).rejects.toThrow(/not found|does not exist/i);
  });

  it('postpones an existing task successfully', async () => {
    const property = await createTestProperty();
    const team = await createTestTeam();
    const task = await createTestTaskAssignment({
      property_id: property.id,
      team_id: team.id,
      date: '2026-03-23',
      task_description: 'Fenster putzen',
      status: 'pending',
    });

    const result = await postponeTask(task.id, 'Regen', '2026-03-25');
    expect(result.status).toBe('postponed');
    expect(result.postpone_reason).toBe('Regen');
  });
});
