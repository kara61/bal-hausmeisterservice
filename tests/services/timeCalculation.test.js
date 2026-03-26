import { describe, it, expect } from 'vitest';
import {
  calculateDailyHours,
  calculateMonthlyHours,
  calculateHarcirah,
  splitOfficialAndUnofficial,
} from '../../src/services/timeCalculation.js';

describe('calculateDailyHours', () => {
  it('calculates hours between check-in and check-out', () => {
    const checkIn = new Date('2026-01-05T06:00:00');
    const checkOut = new Date('2026-01-05T14:30:00');
    expect(calculateDailyHours(checkIn, checkOut)).toBe(8.5);
  });

  it('returns 0 if check-out is missing', () => {
    const checkIn = new Date('2026-01-05T06:00:00');
    expect(calculateDailyHours(checkIn, null)).toBe(0);
  });
});

describe('calculateHarcirah', () => {
  it('returns 14 EUR if daily hours exceed 8.5', () => {
    expect(calculateHarcirah(9.0)).toBe(14);
  });

  it('returns 14 EUR if daily hours equal 8.5', () => {
    expect(calculateHarcirah(8.5)).toBe(14);
  });

  it('returns 0 if daily hours are below 8.5', () => {
    expect(calculateHarcirah(8.0)).toBe(0);
  });
});

describe('calculateMonthlyHours', () => {
  it('sums daily hours for all entries in a month', () => {
    const entries = [
      { check_in: new Date('2026-01-05T06:00:00'), check_out: new Date('2026-01-05T14:00:00') },
      { check_in: new Date('2026-01-06T06:00:00'), check_out: new Date('2026-01-06T15:00:00') },
    ];
    expect(calculateMonthlyHours(entries)).toBe(17);
  });

  it('skips entries with missing check-out', () => {
    const entries = [
      { check_in: new Date('2026-01-05T06:00:00'), check_out: new Date('2026-01-05T14:00:00') },
      { check_in: new Date('2026-01-06T06:00:00'), check_out: null },
    ];
    expect(calculateMonthlyHours(entries)).toBe(8);
  });
});

describe('splitOfficialAndUnofficial', () => {
  it('caps official hours at monthly max for fulltime (173.2)', () => {
    const result = splitOfficialAndUnofficial(180, 'fulltime');
    expect(result.official).toBe(173.2);
    expect(result.unofficial).toBeCloseTo(6.8);
  });

  it('returns actual hours as official if below cap', () => {
    const result = splitOfficialAndUnofficial(160, 'fulltime');
    expect(result.official).toBe(160);
    expect(result.unofficial).toBe(0);
  });

  it('caps minijob hours based on custom monthly max', () => {
    const result = splitOfficialAndUnofficial(50, 'minijob', 42.86);
    expect(result.official).toBe(42.86);
    expect(result.unofficial).toBeCloseTo(7.14);
  });
});
