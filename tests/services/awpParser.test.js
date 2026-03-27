import { describe, it, expect } from 'vitest';
import { parseCollectionDates, extractAddressFromPdf } from '../../src/services/awpParser.js';

describe('parseCollectionDates (text fallback)', () => {
  it('should parse dates from text and default to restmuell', () => {
    const text = `
Di 07.01.  Mo 20.01.  Di 04.02.
Mi 08.01.  Fr 24.01.  Mi 05.02.
    `;

    const results = parseCollectionDates(text, 2025);

    expect(results).toEqual([
      { trash_type: 'restmuell', collection_date: '2025-01-07' },
      { trash_type: 'restmuell', collection_date: '2025-01-20' },
      { trash_type: 'restmuell', collection_date: '2025-02-04' },
      { trash_type: 'restmuell', collection_date: '2025-01-08' },
      { trash_type: 'restmuell', collection_date: '2025-01-24' },
      { trash_type: 'restmuell', collection_date: '2025-02-05' },
    ]);
  });

  it('should parse dates without day abbreviation', () => {
    const text = `03.03.  17.03.  31.03.`;

    const results = parseCollectionDates(text, 2025);

    expect(results).toEqual([
      { trash_type: 'restmuell', collection_date: '2025-03-03' },
      { trash_type: 'restmuell', collection_date: '2025-03-17' },
      { trash_type: 'restmuell', collection_date: '2025-03-31' },
    ]);
  });

  it('should skip invalid dates', () => {
    const text = `32.01.  15.13.  29.02.  10.04.`;

    // 2025 is not a leap year, so 29.02 is invalid
    const results = parseCollectionDates(text, 2025);

    expect(results).toContainEqual({ trash_type: 'restmuell', collection_date: '2025-04-10' });
    expect(results).not.toContainEqual(expect.objectContaining({ collection_date: '2025-02-29' }));
    expect(results).not.toContainEqual(expect.objectContaining({ collection_date: '2025-01-32' }));
    expect(results).not.toContainEqual(expect.objectContaining({ collection_date: '2025-13-15' }));

    // 2024 IS a leap year, so 29.02 should be valid
    const leapResults = parseCollectionDates(text, 2024);
    expect(leapResults).toContainEqual({ trash_type: 'restmuell', collection_date: '2024-02-29' });
  });

  it('should default to restmuell for all text-parsed dates', () => {
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
