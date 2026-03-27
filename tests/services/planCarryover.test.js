import { describe, it, expect, beforeEach, vi } from 'vitest';
import { carryOverPlanTasks, postponePlanTask } from '../../src/services/planGeneration.js';
import { cleanDb, createTestWorker, createTestProperty, createTestPropertyTask, createTestPlan, createTestAssignment, describeWithDb } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
}));

describeWithDb('carryOverPlanTasks', () => {
  beforeEach(async () => { await cleanDb(); });

  it('carries over pending tasks to next day', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'pending',
      task_name: 'Reinigung',
      worker_role: 'field',
    });

    const carried = await carryOverPlanTasks('2026-03-30', '2026-03-31');

    expect(carried.length).toBe(1);
    expect(carried[0].task_name).toBe('Reinigung');
    expect(carried[0].status).toBe('pending');
    expect(carried[0].carried_from_id).toBeDefined();

    // Original should be marked as carried_over
    const { rows: originals } = await pool.query(
      `SELECT status FROM plan_assignments WHERE daily_plan_id = $1`,
      [plan.id]
    );
    expect(originals[0].status).toBe('carried_over');
  });

  it('does not carry over completed tasks', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'done',
      task_name: 'Reinigung',
    });

    const carried = await carryOverPlanTasks('2026-03-30', '2026-03-31');
    expect(carried.length).toBe(0);
  });
});

describeWithDb('postponePlanTask', () => {
  beforeEach(async () => { await cleanDb(); });

  it('postpones a task to a new date', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ assigned_weekday: 1 });
    const plan = await createTestPlan({ plan_date: '2026-03-30' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, {
      status: 'pending',
      task_name: 'Reinigung',
      worker_role: 'field',
    });

    const result = await postponePlanTask(assignment.id, 'Regen', '2026-04-01');

    expect(result.status).toBe('postponed');
    expect(result.postpone_reason).toBe('Regen');
    expect(new Date(result.postponed_to).toISOString().split('T')[0]).toBe('2026-04-01');

    // New assignment should exist on postponed_to date
    const { rows: newAssignments } = await pool.query(
      `SELECT * FROM plan_assignments WHERE carried_from_id = $1`,
      [assignment.id]
    );
    expect(newAssignments.length).toBe(1);
    expect(newAssignments[0].task_name).toBe('Reinigung');
  });
});
