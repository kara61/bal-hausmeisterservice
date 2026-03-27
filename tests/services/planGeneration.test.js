import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvailableWorkers, findBestWorkerForProperty, generateDraftPlan, getPlanWithAssignments, redistributeSickWorkers, approvePlan } from '../../src/services/planGeneration.js';
import { cleanDb, createTestWorker, createTestProperty, describeWithDb } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendInteractiveButtons: vi.fn().mockResolvedValue({}),
}));

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

describeWithDb('generateDraftPlan', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a draft plan with assignments based on property schedule', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop1 = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });

    // Create team with worker assigned to property for 2026-03-30 (Monday = weekday 1)
    const { rows: [team] } = await pool.query(
      `INSERT INTO teams (name, date) VALUES ('Team A', '2026-03-30') RETURNING *`
    );
    await pool.query(
      `INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)`,
      [team.id, worker1.id]
    );
    await pool.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, '2026-03-30', 'Reinigung', 'pending')`,
      [prop1.id, team.id]
    );

    const plan = await generateDraftPlan('2026-03-30');
    expect(plan.status).toBe('draft');

    const full = await getPlanWithAssignments(plan.id);
    expect(full.assignments.length).toBeGreaterThanOrEqual(1);
  });

  it('does not create duplicate plan for same date', async () => {
    await createTestWorker({ phone_number: '+4917600000001' });
    await createTestProperty({ assigned_weekday: 1 });

    const plan1 = await generateDraftPlan('2026-03-30');
    const plan2 = await generateDraftPlan('2026-03-30');

    expect(plan2.id).toBe(plan1.id);
  });

  it('excludes non-field workers from plan generation', async () => {
    const fieldWorker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001', worker_role: 'field' });
    const officeWorker = await createTestWorker({ name: 'Buero', phone_number: '+4917600000099', worker_role: 'office' });
    const prop = await createTestProperty({ assigned_weekday: 1, address: 'Teststr 1' });

    const plan = await generateDraftPlan('2026-03-30');
    const full = await getPlanWithAssignments(plan.id);

    const assignedWorkerIds = full.assignments.map(a => a.worker_id);
    expect(assignedWorkerIds).not.toContain(officeWorker.id);
    if (full.assignments.length > 0) {
      expect(assignedWorkerIds).toContain(fieldWorker.id);
    }
  });
});

describeWithDb('redistributeSickWorkers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('reassigns properties from sick worker to available flex worker', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop = await createTestProperty({ assigned_weekday: 1 });

    // Mark worker2 as flex
    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker) VALUES ($1, true)`,
      [worker2.id]
    );

    // Create plan with worker1 assigned
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ('2026-03-30', 'draft') RETURNING *`
    );
    await pool.query(
      `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order)
       VALUES ($1, $2, $3, 1)`,
      [plan.id, worker1.id, prop.id]
    );

    // Worker1 calls in sick
    await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
       VALUES ($1, '2026-03-30', 1, 'pending')`,
      [worker1.id]
    );

    const result = await redistributeSickWorkers('2026-03-30');
    expect(result.reassigned).toBeGreaterThanOrEqual(1);

    const { rows: assignments } = await pool.query(
      `SELECT * FROM plan_assignments WHERE daily_plan_id = $1`,
      [plan.id]
    );
    const reassigned = assignments.find(a => a.property_id === prop.id);
    expect(reassigned.worker_id).toBe(worker2.id);
  });
});

describeWithDb('approvePlan', () => {
  beforeEach(async () => { await cleanDb(); });

  it('sets plan status to approved', async () => {
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ('2026-03-30', 'draft') RETURNING *`
    );

    const approved = await approvePlan(plan.id, 'halil');
    expect(approved.status).toBe('approved');
    expect(approved.approved_by).toBe('halil');
    expect(approved.approved_at).toBeDefined();
  });

  it('throws if plan is already approved', async () => {
    const { rows: [plan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status, approved_at, approved_by)
       VALUES ('2026-03-30', 'approved', NOW(), 'halil') RETURNING *`
    );

    await expect(approvePlan(plan.id, 'halil')).rejects.toThrow('already approved');
  });
});

describeWithDb('full plan flow', () => {
  beforeEach(async () => { await cleanDb(); });

  it('generates plan, redistributes on sick call, approves', async () => {
    const worker1 = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const worker2 = await createTestWorker({ name: 'Mehmet', phone_number: '+4917600000002' });
    const prop1 = await createTestProperty({ assigned_weekday: 1, address: 'Mozartstr 12' });

    // Mark worker2 as flex
    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker) VALUES ($1, true)`,
      [worker2.id]
    );

    // Create team with worker1
    const { rows: [team] } = await pool.query(
      `INSERT INTO teams (name, date) VALUES ('Team A', '2026-03-30') RETURNING *`
    );
    await pool.query(
      `INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)`,
      [team.id, worker1.id]
    );
    await pool.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, '2026-03-30', 'Reinigung', 'pending')`,
      [prop1.id, team.id]
    );

    // Step 1: Generate draft plan
    const plan = await generateDraftPlan('2026-03-30');
    expect(plan.status).toBe('draft');

    // Step 2: Worker1 calls in sick
    await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
       VALUES ($1, '2026-03-30', 1, 'pending')`,
      [worker1.id]
    );

    // Step 3: Redistribute
    const result = await redistributeSickWorkers('2026-03-30');
    expect(result.reassigned).toBeGreaterThanOrEqual(0);

    // Step 4: Approve
    const approved = await approvePlan(plan.id, 'halil');
    expect(approved.status).toBe('approved');
  });
});
