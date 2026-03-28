import { it, expect, beforeEach, vi } from 'vitest';
import { describeWithDb, cleanDb, createTestWorker, createTestProperty, createTestPlan, createTestAssignment, createTestVisit } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendWhatsAppListMessage: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/services/photoStorage.js', () => ({
  savePhotoFromTwilio: vi.fn().mockResolvedValue('https://example.com/photo.jpg'),
}));

import {
  startCheckoutReview,
  handleAlleDone,
  handleNichtAlle,
  handleIncompleteSelection,
  handleIncompleteReason,
  handleMoreIncomplete,
  handleCheckoutPhoto,
} from '../../src/services/checkoutFlow.js';

describeWithDb('checkoutFlow', () => {
  beforeEach(async () => { await cleanDb(); });

  it('startCheckoutReview returns property count and CHECKOUT_CONFIRM_BUTTONS', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    await createTestVisit({ plan_assignment_id: assignment.id, worker_id: worker.id, property_id: prop.id, visit_date: plan.plan_date });

    const result = await startCheckoutReview(worker);

    expect(result.response).toContain('1 Objekte');
    expect(result.buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'alle_erledigt' }),
        expect.objectContaining({ id: 'nicht_alle' }),
      ])
    );
  });

  it('handleAlleDone marks all visits completed and records checkout', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    await createTestVisit({ plan_assignment_id: assignment.id, worker_id: worker.id, property_id: prop.id, visit_date: plan.plan_date });
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, NOW())`,
      [worker.id, plan.plan_date]
    );

    const result = await handleAlleDone(worker);

    expect(result.response).toContain('Ausgecheckt');
    expect(result.response).toContain('1/1');

    const { rows } = await pool.query(
      `SELECT check_out FROM time_entries WHERE worker_id = $1`,
      [worker.id]
    );
    expect(rows[0].check_out).not.toBeNull();
  });

  it('handleNichtAlle returns property list for selection', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty({ address: 'Lindenweg 8', city: 'Hannover' });
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    await createTestVisit({ plan_assignment_id: assignment.id, worker_id: worker.id, property_id: prop.id, visit_date: plan.plan_date });

    const result = await handleNichtAlle(worker);

    expect(result.type).toBe('incomplete_list');
    expect(result.listItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: expect.stringContaining('Lindenweg 8') }),
      ])
    );
  });

  it('handleIncompleteReason records reason and asks for more', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id, { task_name: 'Reinigung' });
    const visit = await createTestVisit({ plan_assignment_id: assignment.id, worker_id: worker.id, property_id: prop.id, visit_date: plan.plan_date });

    const result = await handleIncompleteReason(worker, visit.id, 'Keine Zeit');

    expect(result.response).toContain('Noch ein Objekt nicht geschafft');

    const { rows } = await pool.query(
      `SELECT incomplete_reason, status FROM property_visits WHERE id = $1`,
      [visit.id]
    );
    expect(rows[0].incomplete_reason).toBe('Keine Zeit');
    expect(rows[0].status).toBe('incomplete');
  });
});
