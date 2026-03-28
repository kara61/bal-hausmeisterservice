const KEYWORD_MAP = [
  { keywords: ['krank', 'bin krank', 'kann nicht kommen', 'bin erkältet'], action: 'sick' },
  { keywords: ['auschecken', 'feierabend', 'fertig'], action: 'checkout' },
  { keywords: ['hilfe', 'help', '?'], action: 'help' },
  { keywords: ['reset', 'neustart'], action: 'reset' },
  { keywords: ['status'], action: 'status' },
];

/**
 * Match user text input to a known keyword action.
 * Returns action string ('sick', 'checkout', 'help', 'reset', 'status') or null.
 */
export function matchKeyword(text) {
  if (!text || typeof text !== 'string') return null;
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return null;

  for (const entry of KEYWORD_MAP) {
    for (const keyword of entry.keywords) {
      if (normalized === keyword) return entry.action;
    }
  }
  return null;
}
