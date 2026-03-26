import { it, expect, beforeEach } from 'vitest';
import { adjustSickLeave } from '../../src/services/sickLeave.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker, describeWithDb } from '../helpers.js';

describeWithDb('adjustSickLeave', () => {
  let worker;

  beforeEach(async () => {
    await cleanDb();
    worker = await createTestWorker({ vacation_entitlement: 26 });
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, $2, $3, 0)',
      [worker.id, new Date().getFullYear(), 26]
    );
  });

  it('logs all days as sick when AOK approves all declared days', async () => {
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );
    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 5 });
    expect(result.aok_approved_days).toBe(5);
    expect(result.vacation_deducted_days).toBe(0);
    expect(result.unpaid_days).toBe(0);
    expect(result.status).toBe('approved');
  });

  it('deducts remaining days from vacation when AOK approves fewer', async () => {
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );
    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 3 });
    expect(result.aok_approved_days).toBe(3);
    expect(result.vacation_deducted_days).toBe(2);
    expect(result.unpaid_days).toBe(0);

    const vac = await pool.query(
      'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
      [worker.id, new Date().getFullYear()]
    );
    expect(vac.rows[0].used_days).toBe(2);
  });

  it('marks excess days as unpaid when vacation is exhausted', async () => {
    await pool.query(
      'UPDATE vacation_balances SET used_days = 25 WHERE worker_id = $1',
      [worker.id]
    );
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );
    const result = await adjustSickLeave(sickLeave.rows[0].id, { aok_approved_days: 2 });
    expect(result.aok_approved_days).toBe(2);
    expect(result.vacation_deducted_days).toBe(1);
    expect(result.unpaid_days).toBe(2);
  });

  it('allows Halil to override with custom values', async () => {
    const sickLeave = await pool.query(
      `INSERT INTO sick_leave (worker_id, start_date, declared_days, status) VALUES ($1, '2026-01-10', 5, 'pending') RETURNING *`,
      [worker.id]
    );
    const result = await adjustSickLeave(sickLeave.rows[0].id, {
      aok_approved_days: 3,
      vacation_deducted_days: 1,
      unpaid_days: 1,
      status: 'overridden',
    });
    expect(result.aok_approved_days).toBe(3);
    expect(result.vacation_deducted_days).toBe(1);
    expect(result.unpaid_days).toBe(1);
    expect(result.status).toBe('overridden');
  });
});
