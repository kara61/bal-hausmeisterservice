import { pool } from '../db/pool.js';

// --- Pure functions ---

export function getAvailableWorkers(workers, sickWorkerIds, vacationWorkerIds) {
  const excludeSet = new Set([...sickWorkerIds, ...vacationWorkerIds]);
  return workers.filter(w => !excludeSet.has(w.id));
}

export function findBestWorkerForProperty(available, propertyId, propertyHistory) {
  if (available.length === 0) return null;

  // Filter out workers at max capacity
  const withCapacity = available.filter(w =>
    !w.max_properties || w.assignment_count < w.max_properties
  );
  if (withCapacity.length === 0) return null;

  // Prefer flex workers who have serviced this property before
  const historySet = new Set(propertyHistory);
  const withHistory = withCapacity.filter(w => historySet.has(w.id));

  if (withHistory.length > 0) {
    withHistory.sort((a, b) => a.assignment_count - b.assignment_count);
    return withHistory[0];
  }

  // Among flex workers, pick fewest assignments
  const flexWorkers = withCapacity.filter(w => w.is_flex);
  if (flexWorkers.length > 0) {
    flexWorkers.sort((a, b) => a.assignment_count - b.assignment_count);
    return flexWorkers[0];
  }

  // Fallback: any worker with fewest assignments
  withCapacity.sort((a, b) => a.assignment_count - b.assignment_count);
  return withCapacity[0];
}
