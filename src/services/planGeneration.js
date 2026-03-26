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

// --- DB functions ---

export async function generateDraftPlan(dateStr) {
  // Check if plan already exists
  const { rows: existing } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [dateStr]
  );
  if (existing.length > 0) return existing[0];

  // Create draft plan
  const { rows: [plan] } = await pool.query(
    `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
    [dateStr]
  );

  // Get weekday for the date
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  // Get active properties for this weekday
  const { rows: properties } = await pool.query(
    `SELECT id, standard_tasks FROM properties
     WHERE assigned_weekday = $1 AND is_active = true`,
    [weekday]
  );

  // Get active workers with preferences
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            COALESCE(wp.preferred_properties, '{}') AS preferred_properties
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true`
  );

  // Get sick workers for this date
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND start_date + (declared_days || ' days')::INTERVAL > $1::DATE
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = sickWorkers.map(s => s.worker_id);

  // Get workers on vacation for this date
  const { rows: vacationWorkers } = await pool.query(
    `SELECT worker_id FROM vacation_balances
     WHERE start_date <= $1 AND end_date >= $1`,
    [dateStr]
  );
  const vacationIds = vacationWorkers.map(v => v.worker_id);

  const available = getAvailableWorkers(workers, sickIds, vacationIds);

  // Get existing team assignments for this date to follow default patterns
  const { rows: teamAssignments } = await pool.query(
    `SELECT DISTINCT tm.worker_id, ta.property_id
     FROM task_assignments ta
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE ta.date = $1`,
    [dateStr]
  );

  // Build default worker→property map from team assignments
  const defaultMap = new Map();
  for (const ta of teamAssignments) {
    if (!defaultMap.has(ta.property_id)) {
      defaultMap.set(ta.property_id, []);
    }
    defaultMap.get(ta.property_id).push(ta.worker_id);
  }

  // Track assignment counts per worker
  const assignmentCounts = new Map();
  const availableIds = new Set(available.map(w => w.id));

  let order = 1;
  for (const prop of properties) {
    // Try default workers first
    const defaultWorkers = defaultMap.get(prop.id) || [];
    let assignedWorkerId = null;

    for (const wid of defaultWorkers) {
      if (availableIds.has(wid)) {
        const count = assignmentCounts.get(wid) || 0;
        const worker = available.find(w => w.id === wid);
        if (count < worker.max_properties) {
          assignedWorkerId = wid;
          break;
        }
      }
    }

    // If no default worker available, find the best alternative
    if (!assignedWorkerId) {
      const withCounts = available.map(w => ({
        ...w,
        assignment_count: assignmentCounts.get(w.id) || 0,
      }));

      // Get property history
      const { rows: history } = await pool.query(
        `SELECT DISTINCT worker_id FROM plan_assignments
         WHERE property_id = $1 AND status = 'completed'`,
        [prop.id]
      );
      const propertyHistory = history.map(h => h.worker_id);

      const best = findBestWorkerForProperty(withCounts, prop.id, propertyHistory);
      if (best) assignedWorkerId = best.id;
    }

    if (assignedWorkerId) {
      await pool.query(
        `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order, source)
         VALUES ($1, $2, $3, $4, 'auto')`,
        [plan.id, assignedWorkerId, prop.id, order]
      );
      assignmentCounts.set(assignedWorkerId, (assignmentCounts.get(assignedWorkerId) || 0) + 1);
      order++;
    }
  }

  return plan;
}

export async function getPlanWithAssignments(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return null;

  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city, p.standard_tasks
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  // Get unassigned properties (gap detection)
  const planDate = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;
  const [year, month, day] = planDate.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const assignedPropertyIds = assignments.map(a => a.property_id);

  const { rows: unassigned } = await pool.query(
    `SELECT id, address, city, standard_tasks FROM properties
     WHERE assigned_weekday = $1 AND is_active = true
       AND id != ALL($2::int[])`,
    [weekday, assignedPropertyIds.length > 0 ? assignedPropertyIds : [0]]
  );

  return { ...plan, assignments, unassigned_properties: unassigned };
}

export async function getPlanByDate(dateStr) {
  const { rows } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [dateStr]
  );
  if (rows.length === 0) return null;
  return getPlanWithAssignments(rows[0].id);
}

export async function redistributeSickWorkers(dateStr) {
  const plan = await getPlanByDate(dateStr);
  if (!plan || plan.status === 'approved') return { reassigned: 0 };

  // Get sick workers for this date
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND start_date + (declared_days || ' days')::INTERVAL > $1::DATE
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = new Set(sickWorkers.map(s => s.worker_id));
  if (sickIds.size === 0) return { reassigned: 0 };

  // Find assignments for sick workers
  const { rows: sickAssignments } = await pool.query(
    `SELECT pa.* FROM plan_assignments pa
     WHERE pa.daily_plan_id = $1 AND pa.worker_id = ANY($2::int[])`,
    [plan.id, [...sickIds]]
  );
  if (sickAssignments.length === 0) return { reassigned: 0 };

  // Get available workers with preferences and current assignment counts
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            (SELECT COUNT(*) FROM plan_assignments pa2
             WHERE pa2.daily_plan_id = $1 AND pa2.worker_id = w.id) AS assignment_count
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.id != ALL($2::int[])`,
    [plan.id, [...sickIds]]
  );

  let reassigned = 0;
  for (const assignment of sickAssignments) {
    // Get property history
    const { rows: history } = await pool.query(
      `SELECT DISTINCT worker_id FROM plan_assignments
       WHERE property_id = $1 AND status = 'completed'`,
      [assignment.property_id]
    );
    const propertyHistory = history.map(h => h.worker_id);

    const withCounts = workers.map(w => ({
      ...w,
      assignment_count: Number(w.assignment_count),
    }));

    const best = findBestWorkerForProperty(withCounts, assignment.property_id, propertyHistory);
    if (best) {
      await pool.query(
        `UPDATE plan_assignments SET worker_id = $1, source = 'auto'
         WHERE id = $2`,
        [best.id, assignment.id]
      );
      // Increment the count for the worker we just assigned
      const w = workers.find(w => w.id === best.id);
      if (w) w.assignment_count = Number(w.assignment_count) + 1;
      reassigned++;
    }
  }

  return { reassigned, total_sick_assignments: sickAssignments.length };
}

export async function approvePlan(planId, approvedBy) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) throw new Error('Plan not found');
  if (plan.status === 'approved') throw new Error('Plan is already approved');

  const { rows: [updated] } = await pool.query(
    `UPDATE daily_plans SET status = 'approved', approved_at = NOW(), approved_by = $2
     WHERE id = $1 RETURNING *`,
    [planId, approvedBy]
  );
  return updated;
}

export async function reassignPlanAssignment(assignmentId, newWorkerId) {
  const { rows: [updated] } = await pool.query(
    `UPDATE plan_assignments SET worker_id = $1, source = 'manual'
     WHERE id = $2 RETURNING *`,
    [newWorkerId, assignmentId]
  );
  if (!updated) throw new Error('Assignment not found');
  return updated;
}
