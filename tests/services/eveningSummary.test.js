import { it, expect, beforeEach, vi } from 'vitest';
import { describeWithDb, cleanDb, createTestWorker, createTestProperty, createTestPlan, createTestAssignment, createTestVisit } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendWhatsAppListMessage: vi.fn().mockResolvedValue({}),
}));

import { sendWhatsAppMessage } from '../../src/services/whatsapp.js';
import { buildDaySummary, sendEveningSummary } from '../../src/services/eveningSummary.js';

describeWithDb('eveningSummary', () => {
  beforeEach(async () => { await cleanDb(); });

  it('buildDaySummary returns formatted summary with worker stats', async () => {
    const worker = await createTestWorker({ name: 'Max Mustermann', phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    await createTestVisit({
      plan_assignment_id: assignment.id,
      worker_id: worker.id,
      property_id: prop.id,
      visit_date: plan.plan_date,
      status: 'completed',
    });
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out)
       VALUES ($1, $2, NOW() - INTERVAL '8 hours', NOW())`,
      [worker.id, plan.plan_date]
    );

    const summary = await buildDaySummary(plan.plan_date);

    expect(summary).toContain('Max Mustermann');
    expect(summary).toContain('1/1');
    expect(summary).toContain('Gesamt:');
  });

  it('sendEveningSummary sends to Halil', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    await createTestVisit({
      plan_assignment_id: assignment.id,
      worker_id: worker.id,
      property_id: prop.id,
      visit_date: plan.plan_date,
      status: 'completed',
    });
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out)
       VALUES ($1, $2, NOW() - INTERVAL '8 hours', NOW())`,
      [worker.id, plan.plan_date]
    );

    await sendEveningSummary(plan.plan_date);

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Tagesuebersicht')
    );
  });
});
