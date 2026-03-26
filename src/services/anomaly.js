import { pool } from '../db/pool.js';

export async function detectMissingCheckouts(date) {
  const result = await pool.query(
    `SELECT te.*, w.name AS worker_name, w.phone_number
     FROM time_entries te
     JOIN workers w ON te.worker_id = w.id
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND te.check_out IS NULL AND te.resolved = false`,
    [date]
  );
  return result.rows;
}

export async function detectLongShifts(date, thresholdHours) {
  const result = await pool.query(
    `SELECT te.*, w.name AS worker_name, w.phone_number,
       ROUND(EXTRACT(EPOCH FROM (te.check_out - te.check_in)) / 3600) AS hours
     FROM time_entries te
     JOIN workers w ON te.worker_id = w.id
     WHERE te.date = $1 AND te.check_in IS NOT NULL AND te.check_out IS NOT NULL
       AND EXTRACT(EPOCH FROM (te.check_out - te.check_in)) / 3600 > $2`,
    [date, thresholdHours]
  );
  return result.rows.map(r => ({ ...r, hours: Number(r.hours) }));
}

export async function flagMissingCheckout(entryId) {
  await pool.query(
    `UPDATE time_entries SET is_flagged = true, flag_reason = 'Vergessen auszuchecken', updated_at = NOW() WHERE id = $1`,
    [entryId]
  );
}

export async function getAnomaliesForDate(date) {
  const missing = await detectMissingCheckouts(date);
  const longShifts = await detectLongShifts(date, 12);
  return { missingCheckouts: missing, longShifts };
}
