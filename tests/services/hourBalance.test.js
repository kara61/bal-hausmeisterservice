import { describe, it, expect } from 'vitest';
import { calculateSurplusHours } from '../../src/services/hourBalance.js';

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
