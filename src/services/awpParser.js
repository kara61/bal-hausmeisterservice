import { createRequire } from 'module';

let _pdfParse;
function getPdfParse() {
  if (!_pdfParse) {
    const require = createRequire(import.meta.url);
    _pdfParse = require('pdf-parse');
  }
  return _pdfParse;
}

const TRASH_TYPE_KEYWORDS = {
  restmuell: ['restmüll', 'restmuell', 'grau', 'restabfall'],
  bio: ['biomüll', 'biomuell', 'braun', 'bio'],
  papier: ['papier', 'grün', 'gruen', 'karton'],
  gelb: ['gelb', 'yellow', 'sack', 'gelber'],
};

/**
 * Detect trash type from a line of text.
 * Returns the trash_type string or null if no match.
 */
function detectTrashType(line) {
  const lower = line.toLowerCase();
  for (const [type, keywords] of Object.entries(TRASH_TYPE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return type;
      }
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
 * Parse AWP PDF text to extract collection dates.
 *
 * @param {string} text - Raw text from PDF
 * @param {number} year - The year for the schedule
 * @returns {Array<{trash_type: string, collection_date: string}>}
 */
export function parseCollectionDates(text, year) {
  if (!text || !text.trim()) return [];

  const results = [];
  let currentType = 'restmuell';
  const lines = text.split('\n');

  // Date pattern: optional day abbreviation + DD.MM. (with optional trailing year)
  const dateRegex = /(?:[A-Za-zäöü]{2}\s+)?(\d{1,2})\.(\d{1,2})\./g;

  for (const line of lines) {
    // Check if this line sets a new trash type context
    const detected = detectTrashType(line);
    if (detected) {
      currentType = detected;
    }

    // Extract all dates from this line
    let match;
    dateRegex.lastIndex = 0;
    while ((match = dateRegex.exec(line)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);

      if (!isValidDate(month, day, year)) continue;

      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      results.push({
        trash_type: currentType,
        collection_date: dateStr,
      });
    }
  }

  return results;
}

/**
 * Parse an AWP PDF buffer to extract collection dates.
 *
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {number} year - The year for the schedule
 * @returns {Promise<Array<{trash_type: string, collection_date: string}>>}
 */
export async function parseAwpPdf(pdfBuffer, year) {
  const data = await getPdfParse()(pdfBuffer);
  return parseCollectionDates(data.text, year);
}

/**
 * Extract a German street address from PDF text.
 *
 * Looks for patterns like "Straßenname 123", "Musterstr. 45", "Am Wald 7a"
 *
 * @param {string} text - Raw text from PDF
 * @returns {string|null} The found address or null
 */
export function extractAddressFromPdf(text) {
  if (!text) return null;

  // Match German street address patterns:
  // - Word(s) + "straße/strasse/str." + optional space + house number
  // - Word(s) + house number (at least one letter word before the number)
  const patterns = [
    // "Musterstraße 12" or "Musterstrasse 12" or "Musterstr. 12"
    /[A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.)\s*\d+[a-zA-Z]?/,
    // "Am Waldweg 7" or "Lange Gasse 42a"
    /(?:[A-ZÄÖÜ][a-zäöüß]+\s+){1,3}(?:Weg|Gasse|Platz|Ring|Allee|Damm|Ufer|Chaussee|Pfad)\s+\d+[a-zA-Z]?/,
    // Generic: "Wordword 123" where word starts with uppercase
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
