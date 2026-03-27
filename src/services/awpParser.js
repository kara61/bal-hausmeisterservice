/**
 * AWP Garbage PDF Parser
 *
 * AWP PDFs use 4 columns of dates, each column representing a trash type.
 * Columns are identified by the X-position of date text items:
 *   Column 1 (X≈80):  Restmüll (residual waste)
 *   Column 2 (X≈184): Bio (organic waste)
 *   Column 3 (X≈289): Papier (paper/cardboard)
 *   Column 4 (X≈394): Gelber Sack (yellow bag/packaging)
 *
 * Uses pdfjs-dist to extract text positions from the PDF.
 */

// Column center X-positions and their trash types (left to right)
const COLUMNS = [
  { center: 80,  type: 'restmuell', tolerance: 30 },
  { center: 184, type: 'bio',       tolerance: 30 },
  { center: 289, type: 'papier',    tolerance: 30 },
  { center: 394, type: 'gelb',      tolerance: 30 },
];

// Date pattern: DD.MM.YYYY or DD.MM.
const DATE_REGEX = /^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/;

/**
 * Match an X-position to a trash type column.
 */
function getTrashTypeForX(x) {
  for (const col of COLUMNS) {
    if (Math.abs(x - col.center) <= col.tolerance) {
      return col.type;
    }
  }
  return null;
}

/**
 * Validate that a date (month, day) is real.
 */
function isValidDate(month, day, year = 2024) {
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

/**
 * Parse an AWP PDF buffer using pdfjs-dist to extract dates with X-positions,
 * then map each date to a trash type based on its column.
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} year - The year for the schedule (used as fallback if PDF dates lack year)
 * @returns {Promise<Array<{trash_type: string, collection_date: string}>>}
 */
export async function parseAwpPdf(pdfBuffer, year) {
  // Polyfill DOM APIs required by pdfjs-dist in serverless environments
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init) {
        const v = init || [1, 0, 0, 1, 0, 0];
        this.a = v[0]; this.b = v[1]; this.c = v[2];
        this.d = v[3]; this.e = v[4]; this.f = v[5];
      }
    };
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
    };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {};
  }

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(pdfBuffer.buffer || pdfBuffer);
  const doc = await getDocument({ data }).promise;
  const results = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items) {
      const str = item.str.trim();
      if (!str) continue;

      const match = str.match(DATE_REGEX);
      if (!match) continue;

      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const dateYear = match[3] ? parseInt(match[3], 10) : year;

      if (!isValidDate(month, day, dateYear)) continue;

      const x = item.transform[4];
      const trashType = getTrashTypeForX(x);
      if (!trashType) continue;

      const dateStr = `${dateYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      results.push({
        trash_type: trashType,
        collection_date: dateStr,
      });
    }
  }

  return results;
}

/**
 * Parse AWP PDF text to extract collection dates (legacy text-based fallback).
 * Used by tests that pass plain text strings.
 *
 * @param {string} text - Raw text from PDF
 * @param {number} year - The year for the schedule
 * @returns {Array<{trash_type: string, collection_date: string}>}
 */
export function parseCollectionDates(text, year) {
  if (!text || !text.trim()) return [];

  const results = [];
  const dateRegex = /(?:[A-Za-zäöü]{2}\s+)?(\d{1,2})\.(\d{1,2})\./g;
  const lines = text.split('\n');

  for (const line of lines) {
    let match;
    dateRegex.lastIndex = 0;
    while ((match = dateRegex.exec(line)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);

      if (!isValidDate(month, day, year)) continue;

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      results.push({
        trash_type: 'restmuell',
        collection_date: dateStr,
      });
    }
  }

  return results;
}

/**
 * Extract a German street address from PDF text.
 *
 * @param {string} text - Raw text from PDF
 * @returns {string|null} The found address or null
 */
export function extractAddressFromPdf(text) {
  if (!text) return null;

  const patterns = [
    /[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.)\s*\d+[a-zA-Z]?/,
    /(?:[A-ZÄÖÜ][a-zäöüß]+\s+){1,3}(?:Weg|Gasse|Platz|Ring|Allee|Damm|Ufer|Chaussee|Pfad)\s+\d+[a-zA-Z]?/,
    /[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*\s+\d+[a-zA-Z]?(?=\s|,|$)/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return null;
}
