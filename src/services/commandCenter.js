/**
 * Pure helper functions for the Command Center Dashboard.
 * No DB access — transforms raw data into shapes the frontend needs.
 */
import { pool } from '../db/pool.js';

/**
 * Derives a worker's current operational status from their time entry and assignments.
 *
 * @param {object|null} timeEntry - Row from time_entries: { check_in, check_out }
 * @param {Array<{status: string}>} assignments - Array of assignment rows for this worker today
 * @returns {'not_started'|'checked_in'|'working'|'done'}
 */
export function deriveWorkerStatus(timeEntry, assignments) {
  if (!timeEntry || !timeEntry.check_in) return 'not_started';
  if (timeEntry.check_out) return 'done';
  if (assignments.length > 0 && assignments.every(a => a.status === 'completed')) return 'done';
  if (assignments.some(a => a.status === 'started')) return 'working';
  return 'checked_in';
}

/**
 * Aggregates worker and assignment data into a stats summary for the dashboard.
 *
 * @param {Array<{status: string, assignments: Array<{status: string}>}>} workers
 * @param {Array<object>} alerts
 * @param {number} garbageCount
 * @returns {{
 *   workersActive: number,
 *   workersTotal: number,
 *   propertiesCompleted: number,
 *   propertiesInProgress: number,
 *   propertiesRemaining: number,
 *   propertiesTotal: number,
 *   alertCount: number,
 *   garbageCount: number,
 * }}
 */
export function computeStatsSummary(workers, alerts, garbageCount) {
  let propertiesCompleted = 0;
  let propertiesInProgress = 0;
  let propertiesRemaining = 0;

  for (const w of workers) {
    for (const a of w.assignments) {
      if (a.status === 'completed') propertiesCompleted++;
      else if (a.status === 'started') propertiesInProgress++;
      else propertiesRemaining++;
    }
  }

  return {
    workersActive: workers.filter(w => w.status !== 'not_started').length,
    workersTotal: workers.length,
    propertiesCompleted,
    propertiesInProgress,
    propertiesRemaining,
    propertiesTotal: propertiesCompleted + propertiesInProgress + propertiesRemaining,
    alertCount: alerts.length,
    garbageCount,
  };
}

export async function getCommandCenterData(dateStr) {
  // 1. Get today's plan
  const { rows: plans } = await pool.query(
    `SELECT id, plan_date, status, approved_at, approved_by FROM daily_plans WHERE plan_date = $1`,
    [dateStr]
  );
  const plan = plans[0] || null;

  if (!plan) {
    return {
      date: dateStr,
      planStatus: 'none',
      planId: null,
      workers: [],
      stats: computeStatsSummary([], [], 0),
      alerts: await getAlerts(dateStr),
      timeline: [],
    };
  }

  // 2. Run remaining queries in parallel
  const [assignmentRows, timeEntryRows, alertList, garbageCount, timelineRows] = await Promise.all([
    getAssignmentsWithDetails(plan.id),
    getTimeEntries(dateStr),
    getAlerts(dateStr),
    getGarbageCount(dateStr),
    getTimelineEntries(dateStr),
  ]);

  // 3. Group assignments by worker and derive statuses
  const timeEntryMap = new Map(timeEntryRows.map(te => [te.worker_id, te]));
  const workerMap = new Map();

  for (const row of assignmentRows) {
    if (!workerMap.has(row.worker_id)) {
      workerMap.set(row.worker_id, {
        id: row.worker_id,
        name: row.worker_name,
        phone_number: row.phone_number,
        assignments: [],
        timeEntry: timeEntryMap.get(row.worker_id) || null,
      });
    }
    workerMap.get(row.worker_id).assignments.push({
      id: row.assignment_id,
      propertyId: row.property_id,
      address: row.address,
      city: row.city,
      standardTasks: row.standard_tasks,
      assignmentOrder: row.assignment_order,
      source: row.source,
      status: row.assignment_status,
    });
  }

  const workers = [...workerMap.values()].map(w => ({
    ...w,
    status: deriveWorkerStatus(w.timeEntry, w.assignments),
    checkIn: w.timeEntry?.check_in || null,
    checkOut: w.timeEntry?.check_out || null,
    completedCount: w.assignments.filter(a => a.status === 'completed').length,
    totalCount: w.assignments.length,
  }));

  return {
    date: dateStr,
    planStatus: plan.status,
    planId: plan.id,
    approvedAt: plan.approved_at,
    workers,
    stats: computeStatsSummary(workers, alertList, garbageCount),
    alerts: alertList,
    timeline: timelineRows,
  };
}

async function getAssignmentsWithDetails(planId) {
  const { rows } = await pool.query(
    `SELECT
       pa.id AS assignment_id, pa.worker_id, pa.property_id,
       pa.assignment_order, pa.source, pa.status AS assignment_status,
       w.name AS worker_name, w.phone_number,
       p.address, p.city, p.standard_tasks
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );
  return rows;
}

async function getTimeEntries(dateStr) {
  const { rows } = await pool.query(
    `SELECT worker_id, check_in, check_out, is_flagged, flag_reason
     FROM time_entries WHERE date = $1`,
    [dateStr]
  );
  return rows;
}

async function getAlerts(dateStr) {
  const alerts = [];

  // Flagged time entries (unresolved)
  const { rows: flagged } = await pool.query(
    `SELECT te.id, te.worker_id, te.flag_reason, w.name AS worker_name
     FROM time_entries te JOIN workers w ON w.id = te.worker_id
     WHERE te.is_flagged = true AND te.resolved = false
     ORDER BY te.date DESC LIMIT 10`
  );
  for (const f of flagged) {
    alerts.push({ type: 'flagged_entry', id: f.id, workerId: f.worker_id, workerName: f.worker_name, reason: f.flag_reason });
  }

  // Pending sick leave
  const { rows: sick } = await pool.query(
    `SELECT sl.id, sl.worker_id, sl.start_date, sl.end_date, w.name AS worker_name
     FROM sick_leave sl JOIN workers w ON w.id = sl.worker_id
     WHERE sl.status = 'pending'
     ORDER BY sl.start_date LIMIT 10`
  );
  for (const s of sick) {
    alerts.push({ type: 'sick_leave', id: s.id, workerId: s.worker_id, workerName: s.worker_name, startDate: s.start_date, endDate: s.end_date });
  }

  // Unassigned properties in today's plan
  const { rows: gaps } = await pool.query(
    `SELECT p.id, p.address, p.city
     FROM properties p
     WHERE p.is_active = true AND p.assigned_weekday = EXTRACT(DOW FROM $1::date)
     AND p.id NOT IN (
       SELECT pa.property_id FROM plan_assignments pa
       JOIN daily_plans dp ON dp.id = pa.daily_plan_id
       WHERE dp.plan_date = $1
     )`,
    [dateStr]
  );
  for (const g of gaps) {
    alerts.push({ type: 'plan_gap', propertyId: g.id, address: g.address, city: g.city });
  }

  return alerts;
}

async function getGarbageCount(dateStr) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM garbage_tasks WHERE collection_date = $1`,
      [dateStr]
    );
    return rows[0]?.count || 0;
  } catch {
    return 0;
  }
}

async function getTimelineEntries(dateStr) {
  const { rows } = await pool.query(
    `SELECT te.worker_id, w.name AS worker_name, te.check_in, te.check_out
     FROM time_entries te JOIN workers w ON w.id = te.worker_id
     WHERE te.date = $1 AND te.check_in IS NOT NULL
     ORDER BY te.check_in`,
    [dateStr]
  );
  return rows;
}
