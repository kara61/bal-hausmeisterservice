import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatPropertyPrompt, formatDaySummary, getNextAssignment } from '../../src/services/accountabilityFlow.js';
import { describeWithDb, cleanDb, createTestWorker, createTestProperty, createTestPlan, createTestAssignment } from '../helpers.js';
import { pool } from '../../src/db/pool.js';
import {
  createVisitsFromPlan,
  markArrived,
  markCompleted,
  getWorkerVisitsForDate,
  getWorkerFlowState,
} from '../../src/services/accountabilityFlow.js';
import { handleIncomingMessage } from '../../src/services/bot.js';

describe('formatPropertyPrompt', () => {
  it('formats arrival prompt with address and tasks', () => {
    const assignment = { address: 'Mozartstraße 12', city: 'Pfaffenhofen', standardTasks: 'Treppenhausreinigung, Mülltonnen' };
    const result = formatPropertyPrompt(assignment);
    expect(result).toContain('Mozartstraße 12');
    expect(result).toContain('Treppenhausreinigung');
    expect(result).toContain('Angekommen');
  });
});

describe('formatDaySummary', () => {
  it('formats completed visits with durations', () => {
    const visits = [
      { address: 'Mozartstraße 12', arrived_at: '2026-03-26T07:12:00Z', completed_at: '2026-03-26T08:45:00Z', hasPhoto: true },
      { address: 'Beethoven Residenz', arrived_at: '2026-03-26T09:00:00Z', completed_at: '2026-03-26T11:10:00Z', hasPhoto: false },
    ];
    const result = formatDaySummary(visits);
    expect(result).toContain('Mozartstraße 12');
    expect(result).toContain('1h 33m');
    expect(result).toContain('Foto');
    expect(result).toContain('Beethoven Residenz');
    expect(result).toContain('2h 10m');
    expect(result).toContain('Gesamtzeit');
  });

  it('handles empty visits', () => {
    const result = formatDaySummary([]);
    expect(result).toContain('Keine');
  });
});

describe('getNextAssignment', () => {
  it('returns the first non-completed assignment', () => {
    const assignments = [
      { id: 1, status: 'completed', assignment_order: 1 },
      { id: 2, status: 'assigned', assignment_order: 2 },
      { id: 3, status: 'assigned', assignment_order: 3 },
    ];
    expect(getNextAssignment(assignments)).toEqual(assignments[1]);
  });

  it('returns null when all completed', () => {
    const assignments = [{ id: 1, status: 'completed', assignment_order: 1 }];
    expect(getNextAssignment(assignments)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getNextAssignment([])).toBeNull();
  });
});

describeWithDb('accountability flow DB functions', () => {
  beforeEach(async () => { await cleanDb(); });
  afterEach(async () => { await cleanDb(); });

  it('createVisitsFromPlan creates visits from plan assignments', async () => {
    const worker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop = await createTestProperty({ address: 'Mozartstraße 12' });
    const plan = await createTestPlan({ plan_date: '2026-03-26', status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id);

    const visits = await createVisitsFromPlan(plan.id);
    expect(visits).toHaveLength(1);
    expect(visits[0].worker_id).toBe(worker.id);
    expect(visits[0].property_id).toBe(prop.id);
    expect(visits[0].status).toBe('assigned');
  });

  it('markArrived sets arrived_at and status to in_progress', async () => {
    const worker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ plan_date: '2026-03-26' });
    await createTestAssignment(plan.id, worker.id, prop.id);
    const [visit] = await createVisitsFromPlan(plan.id);

    const updated = await markArrived(visit.id);
    expect(updated.status).toBe('in_progress');
    expect(updated.arrived_at).toBeTruthy();
  });

  it('markCompleted sets completed_at, duration, and status', async () => {
    const worker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ plan_date: '2026-03-26' });
    await createTestAssignment(plan.id, worker.id, prop.id);
    const [visit] = await createVisitsFromPlan(plan.id);

    await markArrived(visit.id);
    const completed = await markCompleted(visit.id);
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).toBeTruthy();
    expect(completed.duration_minutes).toBeDefined();
  });

  it('getWorkerFlowState returns current visit and next assignment', async () => {
    const worker = await createTestWorker({ name: 'Ali', phone_number: '+4917600000001' });
    const prop1 = await createTestProperty({ address: 'Straße 1', assigned_weekday: 4 });
    const prop2 = await createTestProperty({ address: 'Straße 2', assigned_weekday: 4 });
    const plan = await createTestPlan({ plan_date: '2026-03-26', status: 'approved' });
    await createTestAssignment(plan.id, worker.id, prop1.id, { assignment_order: 1 });
    await createTestAssignment(plan.id, worker.id, prop2.id, { assignment_order: 2 });
    await createVisitsFromPlan(plan.id);

    const state = await getWorkerFlowState(worker.id, '2026-03-26');
    expect(state.visits).toHaveLength(2);
    expect(state.currentVisit).toBeNull();
    expect(state.nextVisit).toBeTruthy();
    expect(state.nextVisit.address).toBe('Straße 1');
    expect(state.allDone).toBe(false);
  });
});

describeWithDb('accountability bot flow', () => {
  beforeEach(async () => { await cleanDb(); });
  afterEach(async () => { await cleanDb(); });

  it('guides worker through property sequence after check-in', async () => {
    const worker = await createTestWorker({ name: 'Ali Yilmaz', phone_number: '+4917600000001' });
    const prop1 = await createTestProperty({ address: 'Mozartstraße 12', city: 'Pfaffenhofen', assigned_weekday: 4, standard_tasks: 'Treppenhausreinigung' });
    const prop2 = await createTestProperty({ address: 'Beethoven Residenz', city: 'Pfaffenhofen', assigned_weekday: 4, standard_tasks: 'Grünpflege' });

    const plan = await createTestPlan({ plan_date: '2026-03-26', status: 'approved' });
    await createTestAssignment(plan.id, worker.id, prop1.id, { assignment_order: 1 });
    await createTestAssignment(plan.id, worker.id, prop2.id, { assignment_order: 2 });

    // Create visits (simulating what happens on plan approval)
    const { createVisitsFromPlan } = await import('../../src/services/accountabilityFlow.js');
    await createVisitsFromPlan(plan.id);

    // Step 1: Check in — should show first property
    const checkin = await handleIncomingMessage('+4917600000001', 'einchecken');
    expect(checkin.type).toBe('checkin_with_flow');
    expect(checkin.response).toContain('Mozartstraße 12');
    expect(checkin.buttons[0].id).toBe('angekommen');

    // Step 2: Arrive at first property
    const arrive = await handleIncomingMessage('+4917600000001', 'angekommen');
    expect(arrive.type).toBe('arrived');
    expect(arrive.response).toContain('Mozartstraße 12');
    expect(arrive.buttons[0].id).toBe('fertig');

    // Step 3: Complete first property — should show second property
    const complete1 = await handleIncomingMessage('+4917600000001', 'fertig');
    expect(complete1.type).toBe('visit_completed');
    expect(complete1.response).toContain('abgeschlossen');
    expect(complete1.response).toContain('Beethoven Residenz');

    // Step 4: Arrive at second property
    const arrive2 = await handleIncomingMessage('+4917600000001', 'angekommen');
    expect(arrive2.type).toBe('arrived');
    expect(arrive2.response).toContain('Beethoven Residenz');

    // Step 5: Complete second property — should show day summary
    const complete2 = await handleIncomingMessage('+4917600000001', 'fertig');
    expect(complete2.type).toBe('day_complete');
    expect(complete2.response).toContain('Gesamtzeit');
    expect(complete2.response).toContain('Mozartstraße 12');
    expect(complete2.response).toContain('Beethoven Residenz');
  });
});
