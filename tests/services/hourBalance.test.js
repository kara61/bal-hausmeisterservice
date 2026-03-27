import { describe, it, expect, beforeEach } from 'vitest';
import { calculateSurplusHours, MINIJOB_MAX_MONTHLY, recordPayout } from '../../src/services/hourBalance.js';
import { describeWithDb, cleanDb, createTestWorker, createTestHourBalance } from '../helpers.js';

describe('calculateSurplusHours', () => {
  it('returns 0 for empty entries', () => {
    expect(calculateSurplusHours([], 'fulltime')).toBe(0);
  });

  it('returns 0 when hours are under fulltime cap', () => {
    // 20 days * 8h = 160h, cap is 173.2h
    const entries = Array.from({ length: 20 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T16:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'fulltime')).toBe(0);
  });

  it('returns surplus when hours exceed fulltime cap', () => {
    // 22 days * 9h = 198h, cap is 173.2h, surplus = 24.8h
    const entries = Array.from({ length: 22 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T07:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T16:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'fulltime')).toBe(24.8);
  });

  it('returns surplus for minijob based on custom cap', () => {
    // 10 days * 5h = 50h, minijob cap = 40h, surplus = 10h
    const entries = Array.from({ length: 10 }, (_, i) => ({
      check_in: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00Z`,
      check_out: `2026-01-${String(i + 1).padStart(2, '0')}T14:00:00Z`,
    }));
    expect(calculateSurplusHours(entries, 'minijob', 40)).toBe(10);
  });
});

describe('BUG-003: MINIJOB_MAX_MONTHLY constant', () => {
  it('exports the legal minijob ceiling as 538 EUR', () => {
    expect(MINIJOB_MAX_MONTHLY).toBe(538);
  });

  it('caps minijob hours using 538 not the old 520 value', () => {
    // With old monthly_salary=520 and hourly_rate=13:
    //   old: 520/13 = 40h cap
    //   new: min(520,538)/13 = 40h (same because 520 < 538)
    // But with monthly_salary=600 (hypothetical over-limit):
    //   old: 600/13 = 46.15h cap (wrong, too generous)
    //   new: min(600,538)/13 = 41.38h cap (correct, clamped)
    // Test the constant is applied by checking it equals 538
    expect(MINIJOB_MAX_MONTHLY).toBe(538);
    // The actual clamping is tested via syncMonthForAll in integration tests
  });
});

describeWithDb('BUG-004: recordPayout rejects overpayment', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('allows payout within surplus balance', async () => {
    const worker = await createTestWorker({ name: 'Payout Worker', worker_type: 'fulltime' });
    await createTestHourBalance(worker.id, { year: 2026, month: 1, surplus_hours: 10, payout_hours: 0 });

    const result = await recordPayout(worker.id, 2026, 1, 5, 'partial payout');
    expect(Number(result.payout_hours)).toBe(5);
  });

  it('rejects payout that exceeds surplus', async () => {
    const worker = await createTestWorker({ name: 'Over Worker', worker_type: 'fulltime' });
    await createTestHourBalance(worker.id, { year: 2026, month: 1, surplus_hours: 5, payout_hours: 0 });

    await expect(recordPayout(worker.id, 2026, 1, 10, 'too much'))
      .rejects.toThrow(/exceeds available balance/);
  });

  it('rejects payout when cumulative payouts exceed surplus', async () => {
    const worker = await createTestWorker({ name: 'Cumul Worker', worker_type: 'fulltime' });
    await createTestHourBalance(worker.id, { year: 2026, month: 2, surplus_hours: 10, payout_hours: 7 });

    // Available = 10 - 7 = 3h, trying to pay out 5h
    await expect(recordPayout(worker.id, 2026, 2, 5, 'over limit'))
      .rejects.toThrow(/exceeds available balance/);
  });

  it('rejects payout when no hour_balance row exists', async () => {
    const worker = await createTestWorker({ name: 'No Balance Worker', worker_type: 'fulltime' });

    await expect(recordPayout(worker.id, 2026, 3, 5, 'no row'))
      .rejects.toThrow(/exceeds available balance/);
  });
});
