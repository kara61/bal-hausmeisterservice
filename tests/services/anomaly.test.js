import { it, expect, beforeEach } from 'vitest';
import { detectMissingCheckouts, detectLongShifts } from '../../src/services/anomaly.js';
import { pool } from '../../src/db/pool.js';
import { cleanDb, createTestWorker, describeWithDb } from '../helpers.js';

describeWithDb('detectMissingCheckouts', () => {
  beforeEach(async () => { await cleanDb(); });

  it('finds entries with check-in but no check-out for a given date', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z')`,
      [worker.id]
    );
    const missing = await detectMissingCheckouts('2026-01-05');
    expect(missing).toHaveLength(1);
    expect(missing[0].worker_id).toBe(worker.id);
  });

  it('does not flag entries that have both check-in and check-out', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z', '2026-01-05T14:00:00Z')`,
      [worker.id]
    );
    const missing = await detectMissingCheckouts('2026-01-05');
    expect(missing).toHaveLength(0);
  });
});

describeWithDb('detectLongShifts', () => {
  beforeEach(async () => { await cleanDb(); });

  it('flags shifts longer than threshold', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T05:00:00Z', '2026-01-05T18:00:00Z')`,
      [worker.id]
    );
    const long = await detectLongShifts('2026-01-05', 12);
    expect(long).toHaveLength(1);
    expect(long[0].hours).toBe(13);
  });

  it('does not flag normal shifts', async () => {
    const worker = await createTestWorker();
    await pool.query(
      `INSERT INTO time_entries (worker_id, date, check_in, check_out) VALUES ($1, '2026-01-05', '2026-01-05T06:00:00Z', '2026-01-05T14:00:00Z')`,
      [worker.id]
    );
    const long = await detectLongShifts('2026-01-05', 12);
    expect(long).toHaveLength(0);
  });
});
