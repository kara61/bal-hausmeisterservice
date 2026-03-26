import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateVacationEntitlement,
  getVacationBalance,
  ensureVacationBalance,
} from '../../src/services/vacation.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker, describeWithDb } from '../helpers.js';

describe('calculateVacationEntitlement', () => {
  it('returns 2 days per full month worked in the year', () => {
    expect(calculateVacationEntitlement('2026-01-01', 2026)).toBe(24);
  });

  it('returns 1 day for a month started mid-month', () => {
    expect(calculateVacationEntitlement('2026-01-15', 2026)).toBe(23);
  });

  it('returns 0 for future start date', () => {
    expect(calculateVacationEntitlement('2027-06-01', 2026)).toBe(0);
  });

  it('returns full year (24 days) for worker who started before the year', () => {
    expect(calculateVacationEntitlement('2023-05-01', 2026)).toBe(24);
  });
});

describeWithDb('getVacationBalance', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns balance for a worker', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 27 });
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, 2026, 27, 5)',
      [worker.id]
    );
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.entitlement_days).toBe(27);
    expect(balance.used_days).toBe(5);
    expect(balance.remaining).toBe(22);
  });
});

describeWithDb('ensureVacationBalance', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a vacation balance record if none exists', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 26 });
    await ensureVacationBalance(worker.id, 2026, 26);
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.entitlement_days).toBe(26);
    expect(balance.used_days).toBe(0);
  });

  it('does not overwrite existing balance', async () => {
    const worker = await createTestWorker({ vacation_entitlement: 26 });
    await pool.query(
      'INSERT INTO vacation_balances (worker_id, year, entitlement_days, used_days) VALUES ($1, 2026, 26, 10)',
      [worker.id]
    );
    await ensureVacationBalance(worker.id, 2026, 26);
    const balance = await getVacationBalance(worker.id, 2026);
    expect(balance.used_days).toBe(10);
  });
});
