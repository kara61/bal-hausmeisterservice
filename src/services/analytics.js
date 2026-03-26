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
