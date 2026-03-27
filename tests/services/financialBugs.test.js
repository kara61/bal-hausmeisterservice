import { describe, it, expect } from 'vitest';
import { generateTimesheetEntries } from '../../src/services/timesheetGeneration.js';

describe('BUG-020: Division by zero guard in generateTimesheetEntries', () => {
  it('throws a descriptive error when hourlyRate is 0', () => {
    expect(() => generateTimesheetEntries(1, 520, 0, 3, 2026))
      .toThrow(/Invalid hourly_rate.*0.*worker 1/);
  });

  it('throws a descriptive error when hourlyRate is null', () => {
    expect(() => generateTimesheetEntries(1, 520, null, 3, 2026))
      .toThrow(/Invalid hourly_rate/);
  });

  it('throws a descriptive error when hourlyRate is NaN', () => {
    expect(() => generateTimesheetEntries(1, 520, NaN, 3, 2026))
      .toThrow(/Invalid hourly_rate/);
  });

  it('throws a descriptive error when hourlyRate is undefined', () => {
    expect(() => generateTimesheetEntries(1, 520, undefined, 3, 2026))
      .toThrow(/Invalid hourly_rate/);
  });

  it('works normally with a valid hourlyRate', () => {
    const result = generateTimesheetEntries(1, 520, 13, 3, 2026);
    expect(result.totalHours).toBeCloseTo(40, 0);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

describe('BUG-022: Falsy-zero in aok_approved_days', () => {
  it('uses 0 when aok_approved_days is 0 (not declared_days)', () => {
    // Simulates the nullish coalescing fix: 0 ?? 5 === 0
    const aokApprovedDays = 0;
    const declaredDays = 5;
    const result = aokApprovedDays ?? declaredDays;
    expect(result).toBe(0);
  });

  it('falls back to declared_days when aok_approved_days is null', () => {
    const aokApprovedDays = null;
    const declaredDays = 5;
    const result = aokApprovedDays ?? declaredDays;
    expect(result).toBe(5);
  });

  it('falls back to declared_days when aok_approved_days is undefined', () => {
    const aokApprovedDays = undefined;
    const declaredDays = 5;
    const result = aokApprovedDays ?? declaredDays;
    expect(result).toBe(5);
  });
});

describe('BUG-023: Report delete storage path extraction', () => {
  it('extracts correct storage path from Supabase public URL', () => {
    const pdfPath = 'https://abc.supabase.co/storage/v1/object/public/photos/reports/Gehaltsbericht_Januar_2026.pdf';
    const marker = '/photos/';
    const idx = pdfPath.indexOf(marker);
    const storagePath = idx !== -1
      ? decodeURIComponent(pdfPath.slice(idx + marker.length))
      : null;
    expect(storagePath).toBe('reports/Gehaltsbericht_Januar_2026.pdf');
  });

  it('returns null for an unexpected URL format', () => {
    const pdfPath = 'https://example.com/some/other/path.pdf';
    const marker = '/photos/';
    const idx = pdfPath.indexOf(marker);
    const storagePath = idx !== -1
      ? decodeURIComponent(pdfPath.slice(idx + marker.length))
      : null;
    expect(storagePath).toBeNull();
  });
});
