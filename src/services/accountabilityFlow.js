import { pool } from '../db/pool.js';
import { savePhotoFromTwilio } from './photoStorage.js';

export function formatPropertyPrompt(assignment) {
  return [
    `📍 ${assignment.address}, ${assignment.city}`,
    assignment.standardTasks ? `• ${assignment.standardTasks.split(',').map(s => s.trim()).join('\n• ')}` : '',
    '',
    'Druecke "Angekommen" wenn du vor Ort bist.',
  ].filter(Boolean).join('\n');
}

export function formatDaySummary(visits) {
  if (visits.length === 0) {
    return 'Keine Objekte heute besucht.';
  }

  let totalMinutes = 0;
  const lines = visits.map(v => {
    const mins = Math.round((new Date(v.completed_at) - new Date(v.arrived_at)) / 60000);
    totalMinutes += mins;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const duration = hours > 0 ? `${hours}h ${remMins}m` : `${remMins}m`;
    const photo = v.hasPhoto ? 'Foto' : 'Kein Foto';
    return `✅ ${v.address} — ${duration} — ${photo}`;
  });

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const totalStr = totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`;

  return [
    'Dein Tag:',
    ...lines,
    '',
    `Gesamtzeit: ${totalStr}`,
    'Gute Arbeit!',
  ].join('\n');
}

export function getNextAssignment(assignments) {
  return assignments.find(a => a.status !== 'completed') || null;
}

/**
 * Create property_visits rows from a plan's assignments.
 * Called when plan is approved. Copies photo_required from properties table.
 */
export async function createVisitsFromPlan(planId) {
  const { rows } = await pool.query(
    `INSERT INTO property_visits (plan_assignment_id, worker_id, property_id, visit_date, photo_required, status)
     SELECT pa.id, pa.worker_id, pa.property_id, dp.plan_date, COALESCE(p.photo_required, false), 'assigned'
     FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     AND NOT EXISTS (
       SELECT 1 FROM property_visits pv WHERE pv.plan_assignment_id = pa.id
     )
     RETURNING *`,
    [planId]
  );
  return rows;
}

/**
 * Mark a visit as arrived (worker is at the property).
 */
export async function markArrived(visitId) {
  const { rows } = await pool.query(
    `UPDATE property_visits
     SET arrived_at = NOW(), status = 'in_progress'
     WHERE id = $1 RETURNING *`,
    [visitId]
  );
  return rows[0];
}

/**
 * Mark a visit as completed. Calculates duration from arrived_at.
 */
export async function markCompleted(visitId) {
  const { rows } = await pool.query(
    `UPDATE property_visits
     SET completed_at = NOW(),
         status = 'completed',
         duration_minutes = EXTRACT(EPOCH FROM (NOW() - arrived_at))::int / 60
     WHERE id = $1 RETURNING *`,
    [visitId]
  );

  // Also update the plan_assignment status
  if (rows[0]?.plan_assignment_id) {
    await pool.query(
      `UPDATE plan_assignments SET status = 'completed' WHERE id = $1`,
      [rows[0].plan_assignment_id]
    );
  }

  return rows[0];
}

/**
 * Save a photo for a property visit.
 */
export async function saveVisitPhoto(visitId, mediaUrl, mediaContentType) {
  const photoUrl = await savePhotoFromTwilio(mediaUrl, mediaContentType);
  const { rows } = await pool.query(
    `INSERT INTO property_visit_photos (property_visit_id, photo_url)
     VALUES ($1, $2) RETURNING *`,
    [visitId, photoUrl]
  );
  return rows[0];
}

/**
 * Get all visits for a worker on a given date, with property details.
 */
export async function getWorkerVisitsForDate(workerId, dateStr) {
  const { rows } = await pool.query(
    `SELECT pv.*, p.address, p.city, p.standard_tasks,
            (SELECT COUNT(*)::int FROM property_visit_photos pvp WHERE pvp.property_visit_id = pv.id) AS photo_count
     FROM property_visits pv
     JOIN properties p ON p.id = pv.property_id
     WHERE pv.worker_id = $1 AND pv.visit_date = $2
     ORDER BY pv.id`,
    [workerId, dateStr]
  );
  return rows;
}

/**
 * Get the current flow state for a worker: which visit is in_progress,
 * which is next, and whether all are done.
 */
export async function getWorkerFlowState(workerId, dateStr) {
  const visits = await getWorkerVisitsForDate(workerId, dateStr);
  const currentVisit = visits.find(v => v.status === 'in_progress') || null;
  const nextVisit = visits.find(v => v.status === 'assigned') || null;
  const allDone = visits.length > 0 && visits.every(v => v.status === 'completed');

  return { visits, currentVisit, nextVisit, allDone };
}
