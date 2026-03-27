import { pool } from '../db/pool.js';

/**
 * Aggregates daily analytics rows into per-worker performance summaries.
 * @param {Array} rows - Rows from analytics_daily joined with workers
 * @returns {Array} Per-worker summary objects
 */
export function computeWorkerDailyStats(rows) {
  if (rows.length === 0) return [];

  const byWorker = new Map();
  for (const r of rows) {
    if (!byWorker.has(r.worker_id)) {
      byWorker.set(r.worker_id, {
        workerId: r.worker_id,
        name: r.worker_name,
        totalCompleted: 0,
        totalScheduled: 0,
        totalDurationMinutes: 0,
        daysWorked: 0,
        photosSubmitted: 0,
        photosRequired: 0,
        totalOvertimeMinutes: 0,
        sickDays: 0,
      });
    }
    const w = byWorker.get(r.worker_id);
    w.totalCompleted += r.properties_completed;
    w.totalScheduled += r.properties_scheduled;
    w.totalDurationMinutes += r.total_duration_minutes;
    w.photosSubmitted += r.photos_submitted;
    w.photosRequired += r.photos_required;
    w.totalOvertimeMinutes += r.overtime_minutes;
    if (r.sick_leave_declared) {
      w.sickDays++;
    } else if (r.check_in_time) {
      w.daysWorked++;
    }
  }

  return [...byWorker.values()].map(w => ({
    ...w,
    avgDurationMinutes: w.daysWorked > 0 ? Math.round(w.totalDurationMinutes / w.daysWorked) : 0,
    photoCompliance: w.photosRequired > 0 ? Math.round((w.photosSubmitted / w.photosRequired) * 10000) / 100 : 100,
  }));
}

/**
 * Formats property monthly rows into frontend-ready objects.
 * @param {Array} rows - Rows from analytics_property_monthly joined with properties/workers
 * @returns {Array} Formatted property stats
 */
export function computePropertyMonthlyStats(rows) {
  return rows.map(r => ({
    propertyId: r.property_id,
    address: r.address,
    city: r.city,
    month: r.month,
    avgDurationMinutes: r.avg_duration_minutes,
    completionRate: parseFloat(r.completion_rate),
    visitCount: r.visit_count,
    postponementCount: r.postponement_count,
    topWorker: r.top_worker_name || null,
  }));
}

/**
 * Computes high-level operations overview from aggregated daily data.
 * @param {Array} dailyRows - Aggregated rows with totals per day
 * @param {number} sickCount - Total sick leave declarations in period
 * @returns {object} Operations summary
 */
export function computeOperationsOverview(dailyRows, sickCount) {
  if (dailyRows.length === 0) {
    return { totalCompleted: 0, totalScheduled: 0, planAdherence: 0, avgWorkersPerDay: 0, totalOvertimeMinutes: 0, sickLeaveCount: sickCount, daysTracked: 0 };
  }

  let totalCompleted = 0;
  let totalScheduled = 0;
  let totalWorkers = 0;
  let totalOvertime = 0;

  for (const r of dailyRows) {
    totalCompleted += r.total_completed;
    totalScheduled += r.total_scheduled;
    totalWorkers += r.workers_active;
    totalOvertime += r.total_overtime;
  }

  return {
    totalCompleted,
    totalScheduled,
    planAdherence: totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 10000) / 100 : 0,
    avgWorkersPerDay: Math.round((totalWorkers / dailyRows.length) * 100) / 100,
    totalOvertimeMinutes: totalOvertime,
    sickLeaveCount: sickCount,
    daysTracked: dailyRows.length,
  };
}

/**
 * Computes cost insights per worker.
 * @param {Array} rows - Worker rows with total durations and rates
 * @param {number} standardHoursPerMonth - Standard monthly hours (e.g. 160)
 * @returns {Array} Per-worker cost breakdown
 */
export function computeCostInsights(rows, standardHoursPerMonth) {
  return rows.map(r => {
    const totalHours = r.total_duration_minutes / 60;
    const overtimeHours = r.overtime_minutes / 60;
    const regularHours = totalHours - overtimeHours;
    const regularCost = regularHours * r.hourly_rate;
    const overtimeCost = overtimeHours * r.hourly_rate;
    const totalCost = regularCost + overtimeCost;

    return {
      workerId: r.worker_id,
      name: r.worker_name,
      totalHours,
      overtimeHours,
      regularCost,
      overtimeCost,
      totalCost,
      costPerProperty: r.properties_completed > 0 ? Math.round((totalCost / r.properties_completed) * 100) / 100 : 0,
      utilization: Math.round((totalHours / standardHoursPerMonth) * 100),
    };
  });
}

/**
 * Computes and upserts daily analytics for a given date.
 * Called by the nightly cron for yesterday's data.
 * Idempotent — deletes existing rows then re-inserts.
 * @param {string} dateStr - YYYY-MM-DD
 */
export async function computeDailyAnalyticsForDate(dateStr) {
  const { rows: plans } = await pool.query(
    `SELECT id FROM daily_plans WHERE plan_date = $1`,
    [dateStr]
  );
  if (plans.length === 0) return;

  const planId = plans[0].id;

  const { rows: workerStats } = await pool.query(
    `SELECT
       pa.worker_id,
       COUNT(*) FILTER (WHERE pa.status = 'completed') AS properties_completed,
       COUNT(*) AS properties_scheduled,
       te.check_in AS check_in_time,
       te.check_out AS check_out_time,
       COALESCE(EXTRACT(EPOCH FROM (te.check_out - te.check_in)) / 60, 0)::int AS total_duration_minutes,
       COALESCE(photo_stats.submitted, 0) AS photos_submitted,
       COALESCE(photo_stats.required, 0) AS photos_required
     FROM plan_assignments pa
     LEFT JOIN time_entries te ON te.worker_id = pa.worker_id AND te.date = $2
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM property_visit_photos pvp WHERE pvp.property_visit_id = pv.id)) AS submitted,
         COUNT(*) FILTER (WHERE pv.photo_required = true) AS required
       FROM property_visits pv
       WHERE pv.worker_id = pa.worker_id AND pv.visit_date = $2
     ) photo_stats ON true
     WHERE pa.daily_plan_id = $1
     GROUP BY pa.worker_id, te.check_in, te.check_out, photo_stats.submitted, photo_stats.required`,
    [planId, dateStr]
  );

  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1 AND start_date + declared_days > $1::date
     AND status IN ('pending', 'approved')`,
    [dateStr]
  );
  const sickWorkerIds = new Set(sickWorkers.map(s => s.worker_id));

  await pool.query(`DELETE FROM analytics_daily WHERE date = $1`, [dateStr]);

  for (const ws of workerStats) {
    const overtimeMinutes = Math.max(0, ws.total_duration_minutes - 480);

    await pool.query(
      `INSERT INTO analytics_daily (date, worker_id, properties_completed, properties_scheduled, total_duration_minutes, photos_submitted, photos_required, tasks_completed, tasks_postponed, overtime_minutes, check_in_time, check_out_time, sick_leave_declared)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $3, 0, $8, $9, $10, $11)`,
      [dateStr, ws.worker_id, ws.properties_completed, ws.properties_scheduled, ws.total_duration_minutes, ws.photos_submitted, ws.photos_required, overtimeMinutes, ws.check_in_time, ws.check_out_time, sickWorkerIds.has(ws.worker_id)]
    );
  }

  for (const swId of sickWorkerIds) {
    if (!workerStats.some(ws => ws.worker_id === swId)) {
      await pool.query(
        `INSERT INTO analytics_daily (date, worker_id, sick_leave_declared) VALUES ($1, $2, true)`,
        [dateStr, swId]
      );
    }
  }
}

/**
 * Fetches worker analytics for a date range, pre-aggregated.
 */
export async function getWorkerAnalytics(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT ad.*, w.name AS worker_name
     FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.worker_role = 'field'
     ORDER BY ad.worker_id, ad.date`,
    [fromDate, toDate]
  );
  return computeWorkerDailyStats(rows);
}

/**
 * Fetches property analytics for a given month.
 */
export async function getPropertyAnalytics(monthStr) {
  const { rows } = await pool.query(
    `SELECT apm.*, p.address, p.city, w.name AS top_worker_name
     FROM analytics_property_monthly apm
     JOIN properties p ON p.id = apm.property_id
     LEFT JOIN workers w ON w.id = apm.top_worker_id
     WHERE apm.month = $1
     ORDER BY p.address`,
    [monthStr]
  );
  return computePropertyMonthlyStats(rows);
}

/**
 * Fetches operations overview for a date range.
 */
export async function getOperationsAnalytics(fromDate, toDate) {
  const { rows: dailyRows } = await pool.query(
    `SELECT
       ad.date,
       SUM(ad.properties_completed)::int AS total_completed,
       SUM(ad.properties_scheduled)::int AS total_scheduled,
       COUNT(DISTINCT ad.worker_id) FILTER (WHERE ad.check_in_time IS NOT NULL) AS workers_active,
       SUM(ad.overtime_minutes)::int AS total_overtime
     FROM analytics_daily ad
     WHERE ad.date >= $1 AND ad.date <= $2
     GROUP BY ad.date
     ORDER BY ad.date`,
    [fromDate, toDate]
  );

  const { rows: [{ count: sickCount }] } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM analytics_daily
     WHERE date >= $1 AND date <= $2 AND sick_leave_declared = true`,
    [fromDate, toDate]
  );

  return computeOperationsOverview(dailyRows, sickCount);
}

/**
 * Fetches cost analytics for a date range.
 */
export async function getCostAnalytics(fromDate, toDate) {
  const { rows } = await pool.query(
    `SELECT
       ad.worker_id, w.name AS worker_name, w.hourly_rate,
       SUM(ad.total_duration_minutes)::int AS total_duration_minutes,
       SUM(ad.overtime_minutes)::int AS overtime_minutes,
       SUM(ad.properties_completed)::int AS properties_completed
     FROM analytics_daily ad
     JOIN workers w ON w.id = ad.worker_id
     WHERE ad.date >= $1 AND ad.date <= $2 AND w.worker_role = 'field'
     GROUP BY ad.worker_id, w.name, w.hourly_rate
     ORDER BY w.name`,
    [fromDate, toDate]
  );
  return computeCostInsights(rows, 160);
}

/**
 * Computes and upserts monthly property analytics for a given month.
 * @param {string} monthStr - YYYY-MM-01 (first of month)
 */
export async function computePropertyMonthlyForMonth(monthStr) {
  await pool.query(`DELETE FROM analytics_property_monthly WHERE month = $1`, [monthStr]);

  await pool.query(
    `INSERT INTO analytics_property_monthly (month, property_id, avg_duration_minutes, completion_rate, visit_count, postponement_count, top_worker_id)
     SELECT
       $1::date AS month,
       pv.property_id,
       AVG(pv.duration_minutes)::int AS avg_duration_minutes,
       CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE pv.status = 'completed')::numeric / COUNT(*) * 100, 2) ELSE 0 END AS completion_rate,
       COUNT(*) AS visit_count,
       COUNT(*) FILTER (WHERE pv.status NOT IN ('completed', 'assigned')) AS postponement_count,
       (SELECT pv2.worker_id FROM property_visits pv2
        WHERE pv2.property_id = pv.property_id
        AND pv2.visit_date >= $1::date AND pv2.visit_date < ($1::date + INTERVAL '1 month')
        GROUP BY pv2.worker_id ORDER BY COUNT(*) DESC LIMIT 1) AS top_worker_id
     FROM property_visits pv
     WHERE pv.visit_date >= $1::date AND pv.visit_date < ($1::date + INTERVAL '1 month')
     GROUP BY pv.property_id`,
    [monthStr]
  );
}
