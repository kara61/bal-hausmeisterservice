import { describe, it, expect } from 'vitest';
import { formatPropertyPrompt, formatDaySummary, getNextAssignment } from '../../src/services/accountabilityFlow.js';

describe('formatPropertyPrompt', () => {
  it('formats arrival prompt with address and tasks', () => {
    const assignment = { address: 'Mozartstraße 12', city: 'Pfaffenhofen', standardTasks: 'Treppenhausreinigung, Mülltonnen' };
    const result = formatPropertyPrompt(assignment);
    expect(result).toContain('Mozartstraße 12');
    expect(result).toContain('Treppenhausreinigung');
    expect(result).toContain('Angekommen');
  });
});

describe('formatDaySummary', () => {
  it('formats completed visits with durations', () => {
    const visits = [
      { address: 'Mozartstraße 12', arrived_at: '2026-03-26T07:12:00Z', completed_at: '2026-03-26T08:45:00Z', hasPhoto: true },
      { address: 'Beethoven Residenz', arrived_at: '2026-03-26T09:00:00Z', completed_at: '2026-03-26T11:10:00Z', hasPhoto: false },
    ];
    const result = formatDaySummary(visits);
    expect(result).toContain('Mozartstraße 12');
    expect(result).toContain('1h 33m');
    expect(result).toContain('Foto');
    expect(result).toContain('Beethoven Residenz');
    expect(result).toContain('2h 10m');
    expect(result).toContain('Gesamtzeit');
  });

  it('handles empty visits', () => {
    const result = formatDaySummary([]);
    expect(result).toContain('Keine');
  });
});

describe('getNextAssignment', () => {
  it('returns the first non-completed assignment', () => {
    const assignments = [
      { id: 1, status: 'completed', assignment_order: 1 },
      { id: 2, status: 'assigned', assignment_order: 2 },
      { id: 3, status: 'assigned', assignment_order: 3 },
    ];
    expect(getNextAssignment(assignments)).toEqual(assignments[1]);
  });

  it('returns null when all completed', () => {
    const assignments = [{ id: 1, status: 'completed', assignment_order: 1 }];
    expect(getNextAssignment(assignments)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(getNextAssignment([])).toBeNull();
  });
});
