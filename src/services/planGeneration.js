import { pool } from '../db/pool.js';
import { shouldTaskRunOnDate } from './taskScheduling.js';

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

  // Step 1: Find tasks that need to run today
  const { rows: propertyTaskRows } = await pool.query(
    `SELECT p.id AS property_id, p.assigned_weekday,
            pt.id AS task_id, pt.task_name, pt.worker_role,
            pt.schedule_type, pt.schedule_day, pt.biweekly_start_date
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`
  );

  // Filter by schedule
  const todaysTasks = [];
  for (const row of propertyTaskRows) {
    const property = { assigned_weekday: row.assigned_weekday };
    const task = {
      schedule_type: row.schedule_type,
      schedule_day: row.schedule_day,
      biweekly_start_date: row.biweekly_start_date,
    };
    if (shouldTaskRunOnDate(task, property, dateStr)) {
      todaysTasks.push(row);
    }
  }

  if (todaysTasks.length === 0) return plan;

  // Group tasks by property
  const tasksByProperty = new Map();
  for (const t of todaysTasks) {
    if (!tasksByProperty.has(t.property_id)) {
      tasksByProperty.set(t.property_id, []);
    }
    tasksByProperty.get(t.property_id).push(t);
  }

  // Step 2: Find available workers, grouped by role
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND (declared_days = 0 OR start_date + (declared_days || ' days')::INTERVAL > $1::DATE)
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = sickWorkers.map(s => s.worker_id);

  // vacation_balances only tracks yearly entitlement/used counts, not date ranges.
  // TODO: add a vacation_periods table with start_date/end_date to support exclusion.
  const vacationIds = [];

  const { rows: allWorkers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number, w.worker_role,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.worker_role IN ('field', 'cleaning')`
  );

  const available = getAvailableWorkers(allWorkers, sickIds, vacationIds);

  // Track property count per worker (for max_properties_per_day)
  const propertyCountPerWorker = new Map();

  let order = 1;
  for (const [propertyId, tasks] of tasksByProperty) {
    // Determine which roles are needed at this property
    const neededRoles = [...new Set(tasks.map(t => t.worker_role))];

    // For each role, find 2 best workers
    const assignedWorkersByRole = new Map();
    for (const role of neededRoles) {
      const roleWorkers = available.filter(w => w.worker_role === role);

      // Get property history for this role
      const { rows: history } = await pool.query(
        `SELECT DISTINCT worker_id FROM plan_assignments
         WHERE property_id = $1 AND status IN ('completed', 'done')`,
        [propertyId]
      );
      const propertyHistory = history.map(h => h.worker_id);

      // Pick up to 2 workers
      const picked = [];
      for (let i = 0; i < 2; i++) {
        const withCounts = roleWorkers
          .filter(w => !picked.includes(w.id))
          .map(w => ({
            ...w,
            assignment_count: propertyCountPerWorker.get(w.id) || 0,
          }));

        const best = findBestWorkerForProperty(withCounts, propertyId, propertyHistory);
        if (best) {
          picked.push(best.id);
          propertyCountPerWorker.set(best.id, (propertyCountPerWorker.get(best.id) || 0) + 1);
        }
      }

      assignedWorkersByRole.set(role, picked);
    }

    // Create plan_assignment rows: one per worker × task
    for (const task of tasks) {
      const workerIds = assignedWorkersByRole.get(task.worker_role) || [];
      for (const workerId of workerIds) {
        await pool.query(
          `INSERT INTO plan_assignments
           (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role)
           VALUES ($1, $2, $3, $4, 'auto', 'pending', $5, $6)`,
          [plan.id, workerId, propertyId, order, task.task_name, task.worker_role]
        );
        order++;
      }
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
            p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  // Get unassigned properties: properties with tasks today but no assignments
  const planDate = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;

  const assignedPropertyIds = [...new Set(assignments.map(a => a.property_id))];

  const { rows: allActiveProperties } = await pool.query(
    `SELECT DISTINCT p.id, p.address, p.city
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`,
  );

  // Filter to properties that have tasks running today but aren't assigned
  const { rows: allPropertyTasks } = await pool.query(
    `SELECT p.id AS property_id, p.assigned_weekday,
            pt.schedule_type, pt.schedule_day, pt.biweekly_start_date
     FROM properties p
     JOIN property_tasks pt ON pt.property_id = p.id
     WHERE p.is_active = true AND pt.is_active = true`
  );

  const propertiesWithTasksToday = new Set();
  for (const row of allPropertyTasks) {
    const property = { assigned_weekday: row.assigned_weekday };
    const task = { schedule_type: row.schedule_type, schedule_day: row.schedule_day, biweekly_start_date: row.biweekly_start_date };
    if (shouldTaskRunOnDate(task, property, planDate)) {
      propertiesWithTasksToday.add(row.property_id);
    }
  }

  const unassigned = allActiveProperties.filter(
    p => propertiesWithTasksToday.has(p.id) && !assignedPropertyIds.includes(p.id)
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
  if (!plan) return { reassigned: 0, details: [] };

  // Get sick workers for this date
  const { rows: sickWorkers } = await pool.query(
    `SELECT worker_id FROM sick_leave
     WHERE start_date <= $1
       AND (declared_days = 0 OR start_date + (declared_days || ' days')::INTERVAL > $1::DATE)
       AND status != 'rejected'`,
    [dateStr]
  );
  const sickIds = new Set(sickWorkers.map(s => s.worker_id));
  if (sickIds.size === 0) return { reassigned: 0, details: [] };

  // Find assignments for sick workers
  const { rows: sickAssignments } = await pool.query(
    `SELECT pa.* FROM plan_assignments pa
     WHERE pa.daily_plan_id = $1 AND pa.worker_id = ANY($2::int[])`,
    [plan.id, [...sickIds]]
  );
  if (sickAssignments.length === 0) return { reassigned: 0, details: [] };

  // Get the roles of sick workers so we can find replacements with matching roles
  const { rows: sickWorkerDetails } = await pool.query(
    `SELECT id, worker_role FROM workers WHERE id = ANY($1::int[])`,
    [[...sickIds]]
  );
  const sickWorkerRoleMap = new Map(sickWorkerDetails.map(w => [w.id, w.worker_role]));
  const neededRoles = [...new Set(sickWorkerDetails.map(w => w.worker_role))];

  // Get available workers with preferences and current assignment counts (BUG-015: match role dynamically)
  const { rows: workers } = await pool.query(
    `SELECT w.id, w.name, w.phone_number, w.worker_role,
            COALESCE(wp.is_flex_worker, false) AS is_flex,
            COALESCE(wp.max_properties_per_day, 4) AS max_properties,
            (SELECT COUNT(*) FROM plan_assignments pa2
             WHERE pa2.daily_plan_id = $1 AND pa2.worker_id = w.id) AS assignment_count
     FROM workers w
     LEFT JOIN worker_preferences wp ON wp.worker_id = w.id
     WHERE w.is_active = true AND w.worker_role = ANY($2::text[]) AND w.id != ALL($3::int[])`,
    [plan.id, neededRoles, [...sickIds]]
  );

  let reassigned = 0;
  const details = [];
  for (const assignment of sickAssignments) {
    // Get property history
    const { rows: history } = await pool.query(
      `SELECT DISTINCT worker_id FROM plan_assignments
       WHERE property_id = $1 AND status = 'completed'`,
      [assignment.property_id]
    );
    const propertyHistory = history.map(h => h.worker_id);

    // BUG-015: filter replacement workers to same role as the sick worker
    const sickRole = sickWorkerRoleMap.get(assignment.worker_id) || 'field';
    const roleWorkers = workers.filter(w => w.worker_role === sickRole);
    const withCounts = roleWorkers.map(w => ({
      ...w,
      assignment_count: Number(w.assignment_count),
    }));

    const best = findBestWorkerForProperty(withCounts, assignment.property_id, propertyHistory);
    if (best) {
      // Get original worker name before overwriting
      const { rows: [orig] } = await pool.query(
        'SELECT w.name FROM workers w WHERE w.id = $1', [assignment.worker_id]
      );

      await pool.query(
        `UPDATE plan_assignments SET worker_id = $1, source = 'substitution'
         WHERE id = $2`,
        [best.id, assignment.id]
      );
      // Increment the count for the worker we just assigned
      const w = workers.find(w => w.id === best.id);
      if (w) w.assignment_count = Number(w.assignment_count) + 1;
      reassigned++;
      details.push({
        assignmentId: assignment.id,
        propertyId: assignment.property_id,
        newWorkerId: best.id,
        newWorkerName: best.name,
        newWorkerPhone: best.phone_number,
        originalWorkerName: orig?.name || 'Unbekannt',
      });
    }
  }

  return { reassigned, total_sick_assignments: sickAssignments.length, details };
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

export async function carryOverPlanTasks(fromDate, toDate) {
  // Find incomplete assignments from the source date
  const { rows: incomplete } = await pool.query(
    `SELECT pa.* FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     WHERE dp.plan_date = $1 AND pa.status IN ('pending', 'in_progress')`,
    [fromDate]
  );

  if (incomplete.length === 0) return [];

  // Ensure a plan exists for the target date
  let { rows: [targetPlan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [toDate]
  );
  if (!targetPlan) {
    const { rows: [newPlan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
      [toDate]
    );
    targetPlan = newPlan;
  }

  // BUG-016: start numbering carried-over assignments after existing max
  const { rows: [{ max_order }] } = await pool.query(
    `SELECT COALESCE(MAX(assignment_order), 0) AS max_order FROM plan_assignments WHERE daily_plan_id = $1`,
    [targetPlan.id]
  );
  let nextOrder = max_order + 1;

  const carried = [];
  for (const assignment of incomplete) {
    // Mark original as carried_over
    await pool.query(
      `UPDATE plan_assignments SET status = 'carried_over' WHERE id = $1`,
      [assignment.id]
    );

    // Create new assignment on target date
    const { rows: [newAssignment] } = await pool.query(
      `INSERT INTO plan_assignments
       (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role, carried_from_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8) RETURNING *`,
      [targetPlan.id, assignment.worker_id, assignment.property_id,
       nextOrder++, assignment.source,
       assignment.task_name, assignment.worker_role, assignment.id]
    );
    carried.push(newAssignment);
  }

  return carried;
}

export async function postponePlanTask(assignmentId, reason, newDate) {
  // Update original
  const { rows: [updated] } = await pool.query(
    `UPDATE plan_assignments
     SET status = 'postponed', postpone_reason = $2, postponed_to = $3
     WHERE id = $1 RETURNING *`,
    [assignmentId, reason, newDate]
  );
  if (!updated) throw new Error('Assignment not found');

  // Ensure a plan exists for the new date
  let { rows: [targetPlan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE plan_date = $1',
    [newDate]
  );
  if (!targetPlan) {
    const { rows: [newPlan] } = await pool.query(
      `INSERT INTO daily_plans (plan_date, status) VALUES ($1, 'draft') RETURNING *`,
      [newDate]
    );
    targetPlan = newPlan;
  }

  // Create postponed copy on new date
  await pool.query(
    `INSERT INTO plan_assignments
     (daily_plan_id, worker_id, property_id, assignment_order, source, status, task_name, worker_role, carried_from_id)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
    [targetPlan.id, updated.worker_id, updated.property_id,
     updated.assignment_order, updated.source,
     updated.task_name, updated.worker_role, updated.id]
  );

  return updated;
}
