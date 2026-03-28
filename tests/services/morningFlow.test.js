import { it, expect, beforeEach, vi } from 'vitest';
import { describeWithDb, cleanDb, createTestWorker, createTestProperty, createTestPlan, createTestAssignment, createTestPropertyTask } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendWhatsAppListMessage: vi.fn().mockResolvedValue({}),
}));

import { sendWhatsAppButtons } from '../../src/services/whatsapp.js';
import { sendMorningAssignments, sendMorningReminders, sendCheckinReminders } from '../../src/services/morningFlow.js';

describeWithDb('morningFlow', () => {
  beforeEach(async () => { await cleanDb(); });

  it('sends task list with MORNING_BUTTONS to workers with approved plan', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const property = await createTestProperty({ address: 'Teststr 1', city: 'Hannover' });
    const plan = await createTestPlan({ status: 'approved' });
    await createTestAssignment(plan.id, worker.id, property.id, { task_name: 'Treppenhausreinigung' });

    const result = await sendMorningAssignments(plan.plan_date);

    expect(result.sent).toBe(1);
    expect(sendWhatsAppButtons).toHaveBeenCalledWith(
      '+4917600000001',
      expect.stringContaining('Teststr 1'),
      expect.arrayContaining([
        expect.objectContaining({ id: 'alles_klar' }),
        expect.objectContaining({ id: 'kann_heute_nicht' }),
      ])
    );
  });

  it('does not send to workers with no assignments', async () => {
    await createTestWorker({ phone_number: '+4917600000002' });
    const plan = await createTestPlan({ status: 'approved' });

    const result = await sendMorningAssignments(plan.plan_date);

    expect(result.sent).toBe(0);
  });

  it('sends reminder to workers who have not acknowledged by 06:45', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const property = await createTestProperty({ address: 'Teststr 1', city: 'Hannover' });
    const plan = await createTestPlan({ status: 'approved' });
    await createTestAssignment(plan.id, worker.id, property.id, { task_name: 'Reinigung' });

    const result = await sendMorningReminders(plan.plan_date);

    expect(result.reminded).toBe(1);
    expect(result.halilAlerted).toBe(1);
  });

  it('sends check-in reminder to acknowledged-but-not-checked-in workers', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const property = await createTestProperty({ address: 'Teststr 1', city: 'Hannover' });
    const plan = await createTestPlan({ status: 'approved' });
    await createTestAssignment(plan.id, worker.id, property.id, { task_name: 'Reinigung' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ($1, 'acknowledged', NOW())`,
      ['+4917600000001']
    );

    const result = await sendCheckinReminders(plan.plan_date);

    expect(result.reminded).toBe(1);
  });

  it('does not remind workers who are already checked in', async () => {
    const worker = await createTestWorker({ phone_number: '+4917600000001' });
    const property = await createTestProperty({ address: 'Teststr 1', city: 'Hannover' });
    const plan = await createTestPlan({ status: 'approved' });
    await createTestAssignment(plan.id, worker.id, property.id, { task_name: 'Reinigung' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ($1, 'checked_in', NOW())`,
      ['+4917600000001']
    );

    const result = await sendCheckinReminders(plan.plan_date);

    expect(result.reminded).toBe(0);
  });
});
