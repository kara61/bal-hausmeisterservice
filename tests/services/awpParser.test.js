import { describe, it, expect } from 'vitest';
import { parseCollectionDates, extractAddressFromPdf } from '../../src/services/awpParser.js';

describe('parseCollectionDates', () => {
  it('should parse dates with trash type context for multiple types', () => {
    const text = `
Restmüll / grau
Di 07.01.  Mo 20.01.  Di 04.02.

Biomüll / braun
Mi 08.01.  Fr 24.01.  Mi 05.02.
    `;

    const results = parseCollectionDates(text, 2025);

    expect(results).toEqual([
      { trash_type: 'restmuell', collection_date: '2025-01-07' },
      { trash_type: 'restmuell', collection_date: '2025-01-20' },
      { trash_type: 'restmuell', collection_date: '2025-02-04' },
      { trash_type: 'bio', collection_date: '2025-01-08' },
      { trash_type: 'bio', collection_date: '2025-01-24' },
      { trash_type: 'bio', collection_date: '2025-02-05' },
    ]);
  });

  it('should parse dates without day abbreviation', () => {
    const text = `
Papier / grün
03.03.  17.03.  31.03.
    `;

    const results = parseCollectionDates(text, 2025);

    expect(results).toEqual([
      { trash_type: 'papier', collection_date: '2025-03-03' },
      { trash_type: 'papier', collection_date: '2025-03-17' },
      { trash_type: 'papier', collection_date: '2025-03-31' },
    ]);
  });

  it('should skip invalid dates', () => {
    const text = `
Gelber Sack
32.01.  15.13.  29.02.  10.04.
    `;

    const results = parseCollectionDates(text, 2025);

    // 32.01 invalid day, 15.13 invalid month, 29.02 valid (leap year check uses 2024 internally)
    expect(results).toContainEqual({ trash_type: 'gelb', collection_date: '2025-02-29' });
    expect(results).toContainEqual({ trash_type: 'gelb', collection_date: '2025-04-10' });
    expect(results).not.toContainEqual(expect.objectContaining({ collection_date: '2025-01-32' }));
    expect(results).not.toContainEqual(expect.objectContaining({ collection_date: '2025-13-15' }));
  });

  it('should default to restmuell if no context found', () => {
    const text = `Di 14.01.  Mo 27.01.`;

    const results = parseCollectionDates(text, 2025);

    expect(results).toEqual([
      { trash_type: 'restmuell', collection_date: '2025-01-14' },
      { trash_type: 'restmuell', collection_date: '2025-01-27' },
    ]);
  });

  it('should return empty array for empty text', () => {
    expect(parseCollectionDates('', 2025)).toEqual([]);
    expect(parseCollectionDates('   ', 2025)).toEqual([]);
    expect(parseCollectionDates(null, 2025)).toEqual([]);
  });
});

describe('extractAddressFromPdf', () => {
  it('should extract a street address', () => {
    const text = 'Abfuhrkalender für Musterstraße 12 in Hannover';
    const result = extractAddressFromPdf(text);
    expect(result).toBe('Musterstraße 12');
  });

  it('should extract address with Str. suffix', () => {
    const text = 'Kalender für Hauptstr. 45b gültig ab 2025';
    const result = extractAddressFromPdf(text);
    expect(result).toBe('Hauptstr. 45b');
  });

  it('should return null when no address is found', () => {
    const text = 'Keine Adresse hier vorhanden';
    const result = extractAddressFromPdf(text);
    expect(result).toBeNull();
  });
});
