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

import { handleIncomingMessageV2 } from '../../src/services/botV2.js';

describeWithDb('botV2 — handleIncomingMessageV2', () => {
  beforeEach(async () => { await cleanDb(); });

  it('rejects unregistered phone numbers', async () => {
    const result = await handleIncomingMessageV2('+4900000000000', 'hello');
    expect(result.response).toContain('nicht registriert');
  });

  it('handles alles_klar button — sets acknowledged state', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessageV2('+4917612345678', 'alles_klar');
    expect(result.type).toBe('acknowledged');
    expect(result.response).toContain('Einchecken');

    const { rows } = await pool.query(
      `SELECT state FROM conversation_state WHERE phone_number = '+4917612345678'`
    );
    expect(rows[0].state).toBe('acknowledged');
  });

  it('handles einchecken — creates time entry and sets checked_in', async () => {
    const worker = await createTestWorker({ phone_number: '+4917612345678' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ('+4917612345678', 'acknowledged', NOW())`
    );

    const result = await handleIncomingMessageV2('+4917612345678', 'einchecken');
    expect(result.type).toBe('checkin');
    expect(result.response).toContain('Eingecheckt');

    const { rows } = await pool.query(
      `SELECT state FROM conversation_state WHERE phone_number = '+4917612345678'`
    );
    expect(rows[0].state).toBe('checked_in');
  });

  it('handles einchecken from null state (direct check-in)', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessageV2('+4917612345678', 'einchecken');
    expect(result.type).toBe('checkin');
  });

  it('handles kann_heute_nicht — starts sick flow', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessageV2('+4917612345678', 'kann_heute_nicht');
    expect(result.type).toBe('sick_prompt');
    expect(result.response).toContain('Wie lange');
  });

  it('handles sick day count after sick prompt', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ('+4917612345678', 'awaiting_sick_days', NOW())`
    );
    const result = await handleIncomingMessageV2('+4917612345678', 'sick_1');
    expect(result.type).toBe('sick_recorded');
    expect(result.response).toContain('1 Tage');
  });

  it('handles auschecken keyword when checked_in — starts checkout review', async () => {
    const worker = await createTestWorker({ phone_number: '+4917612345678' });
    const prop = await createTestProperty();
    const plan = await createTestPlan({ status: 'approved' });
    const assignment = await createTestAssignment(plan.id, worker.id, prop.id);
    await createTestVisit({ plan_assignment_id: assignment.id, worker_id: worker.id, property_id: prop.id, visit_date: plan.plan_date });
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, $2, NOW())`,
      [worker.id, plan.plan_date]
    );
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ('+4917612345678', 'checked_in', NOW())`
    );

    const result = await handleIncomingMessageV2('+4917612345678', 'auschecken');
    expect(result.type).toBe('checkout_review');
    expect(result.response).toContain('Alle erledigt');
  });

  it('handles keyword "krank" — starts sick flow', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessageV2('+4917612345678', 'bin krank');
    expect(result.type).toBe('sick_prompt');
  });

  it('handles keyword "hilfe" — shows current state info', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessageV2('+4917612345678', 'hilfe');
    expect(result.type).toBe('help');
  });

  it('handles keyword "reset" — clears state', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ('+4917612345678', 'checkout_incomplete', NOW())`
    );
    const result = await handleIncomingMessageV2('+4917612345678', 'reset');
    expect(result.type).toBe('reset');

    const { rows } = await pool.query(
      `SELECT state FROM conversation_state WHERE phone_number = '+4917612345678'`
    );
    expect(rows.length).toBe(0);
  });

  it('repeats current prompt for unrecognized input during a flow', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await pool.query(
      `INSERT INTO conversation_state (phone_number, state, updated_at) VALUES ('+4917612345678', 'acknowledged', NOW())`
    );
    const result = await handleIncomingMessageV2('+4917612345678', 'blah blah');
    expect(result.response).toContain('Einchecken');
  });
});
