/**
 * Pure helper functions for the Command Center Dashboard.
 * No DB access — transforms raw data into shapes the frontend needs.
 */

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
