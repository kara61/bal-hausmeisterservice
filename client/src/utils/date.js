/**
 * Return today's date as 'YYYY-MM-DD' using local timezone.
 * Avoids the CET/UTC mismatch caused by toISOString().
 */
export function todayLocal() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}
