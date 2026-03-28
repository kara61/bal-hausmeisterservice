import { pool } from '../../src/db/pool.js';

export async function simulateCheckIn(workerId, dateStr, timeStr) {
  const checkIn = `${dateStr}T${timeStr}:00+01:00`; // CET
  const { rows } = await pool.query(
    `INSERT INTO time_entries (worker_id, date, check_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, date) DO UPDATE SET check_in = $3, updated_at = NOW()
     RETURNING *`,
    [workerId, dateStr, checkIn]
  );
  return rows[0];
}

export async function simulateCheckOut(workerId, dateStr, timeStr) {
  const checkOut = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE time_entries SET check_out = $1, updated_at = NOW()
     WHERE worker_id = $2 AND date = $3 RETURNING *`,
    [checkOut, workerId, dateStr]
  );
  return rows[0];
}

export async function simulateArrival(visitId, dateStr, timeStr) {
  const arrivedAt = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE property_visits SET status = 'in_progress', arrived_at = $1
     WHERE id = $2 RETURNING *`,
    [arrivedAt, visitId]
  );
  return rows[0];
}

export async function simulateCompletion(visitId, dateStr, timeStr) {
  const completedAt = `${dateStr}T${timeStr}:00+01:00`;
  const { rows } = await pool.query(
    `UPDATE property_visits SET status = 'completed', completed_at = $1,
     duration_minutes = EXTRACT(EPOCH FROM ($1::timestamptz - arrived_at)) / 60
     WHERE id = $2 RETURNING *`,
    [completedAt, visitId]
  );
  // Also update plan_assignment
  if (rows[0]) {
    await pool.query(
      `UPDATE plan_assignments SET status = 'completed', completed_at = $1
       WHERE id = $2`,
      [completedAt, rows[0].plan_assignment_id]
    );
  }
  return rows[0];
}

export async function getAssignmentsForPlan(planId) {
  const { rows } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, p.address AS property_address
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.assignment_order`,
    [planId]
  );
  return rows;
}

export async function getVisitsForPlan(planId) {
  const { rows } = await pool.query(
    `SELECT pv.*, w.name AS worker_name, p.address AS property_address
     FROM property_visits pv
     JOIN workers w ON w.id = pv.worker_id
     JOIN properties p ON p.id = pv.property_id
     WHERE pv.plan_assignment_id IN (SELECT id FROM plan_assignments WHERE daily_plan_id = $1)
     ORDER BY pv.id`,
    [planId]
  );
  return rows;
}

export async function getTimeEntry(workerId, dateStr) {
  const { rows } = await pool.query(
    `SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2`,
    [workerId, dateStr]
  );
  return rows[0] || null;
}

export async function getAnalyticsForDate(dateStr) {
  const { rows } = await pool.query(
    `SELECT ad.*, w.name AS worker_name FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date = $1`,
    [dateStr]
  );
  return rows;
}
