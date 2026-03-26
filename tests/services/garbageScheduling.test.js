import { describe, it, expect } from 'vitest';
import { calculateRausDates, formatGarbageTaskDescription } from '../../src/services/garbageScheduling.js';

describe('calculateRausDates', () => {
  it('should return 1 day before for a normal day', () => {
    expect(calculateRausDates('2025-03-15')).toBe('2025-03-14');
  });

  it('should handle month boundary', () => {
    expect(calculateRausDates('2025-03-01')).toBe('2025-02-28');
  });

  it('should handle year boundary', () => {
    expect(calculateRausDates('2025-01-01')).toBe('2024-12-31');
  });
});

describe('formatGarbageTaskDescription', () => {
  it('should format raus task', () => {
    expect(formatGarbageTaskDescription('gelb', 'raus')).toBe('gelb Tonnen raus');
  });

  it('should format rein task', () => {
    expect(formatGarbageTaskDescription('bio', 'rein')).toBe('bio Tonnen rein');
  });

  it('should work with different trash types', () => {
    expect(formatGarbageTaskDescription('restmuell', 'raus')).toBe('restmuell Tonnen raus');
    expect(formatGarbageTaskDescription('papier', 'rein')).toBe('papier Tonnen rein');
  });
});
