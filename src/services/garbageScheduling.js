import { pool } from '../db/pool.js';

// --- Pure functions ---

/**
 * Calculate the "raus" date (1 day before collection).
 * Uses Date(y, m-1, d) to avoid timezone issues.
 *
 * @param {string} collectionDateStr - 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD' one day before
 */
export function calculateRausDates(collectionDateStr) {
  const [year, month, day] = collectionDateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Format a garbage task description.
 *
 * @param {string} trashType - e.g. 'gelb', 'bio'
 * @param {string} taskType - 'raus' or 'rein'
 * @returns {string} e.g. "gelb Tonnen raus"
 */
export function formatGarbageTaskDescription(trashType, taskType) {
  return `${trashType} Tonnen ${taskType}`;
}

// --- DB functions ---

/**
 * Import schedule entries from a parsed PDF into the database.
 * Runs in a transaction: deletes old entries for same property+sourcePdf, then inserts new ones.
 *
 * @param {number} propertyId
 * @param {Array<{trash_type: string, collection_date: string}>} dates
 * @param {string} sourcePdf
 */
export async function importScheduleFromPdf(propertyId, dates, sourcePdf) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete old entries for this property + source PDF
    await client.query(
      'DELETE FROM garbage_schedules WHERE property_id = $1 AND source_pdf = $2',
      [propertyId, sourcePdf]
    );

    // Insert new entries with ON CONFLICT to handle duplicates
    for (const entry of dates) {
      await client.query(
        `INSERT INTO garbage_schedules (property_id, trash_type, collection_date, source_pdf)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (property_id, trash_type, collection_date) DO UPDATE
         SET source_pdf = EXCLUDED.source_pdf`,
        [propertyId, entry.trash_type, entry.collection_date, sourcePdf]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generate garbage tasks for a given date.
 *
 * - Collection dates for TOMORROW -> create "raus" tasks due today
 * - Collection dates for TODAY -> create "rein" tasks due today
 *
 * For each: if a task_assignment already exists for that property+date,
 * append garbage description; otherwise create a new task_assignment.
 *
 * @param {string} dateStr - 'YYYY-MM-DD' (today)
 */
export async function generateGarbageTasks(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const today = new Date(year, month - 1, day);
  const tomorrow = new Date(year, month - 1, day + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  // "raus" tasks: collection is tomorrow, task due today
  const { rows: rausSchedules } = await pool.query(
    `SELECT id, property_id, trash_type, collection_date
     FROM garbage_schedules
     WHERE collection_date = $1`,
    [tomorrowStr]
  );

  for (const schedule of rausSchedules) {
    await createGarbageTask(schedule, 'raus', dateStr);
  }

  // "rein" tasks: collection is today, task due today
  const { rows: reinSchedules } = await pool.query(
    `SELECT id, property_id, trash_type, collection_date
     FROM garbage_schedules
     WHERE collection_date = $1`,
    [dateStr]
  );

  for (const schedule of reinSchedules) {
    await createGarbageTask(schedule, 'rein', dateStr);
  }
}

/**
 * Create a single garbage task, linking to or creating a task_assignment.
 */
async function createGarbageTask(schedule, taskType, dueDate) {
  // Check if garbage_task already exists
  const { rowCount: exists } = await pool.query(
    `SELECT 1 FROM garbage_tasks
     WHERE garbage_schedule_id = $1 AND task_type = $2`,
    [schedule.id, taskType]
  );

  if (exists > 0) return; // Skip if already exists

  const description = formatGarbageTaskDescription(schedule.trash_type, taskType);

  // Check if a task_assignment already exists for this property + date
  const { rows: existingAssignments } = await pool.query(
    `SELECT id, task_description FROM task_assignments
     WHERE property_id = $1 AND date = $2`,
    [schedule.property_id, dueDate]
  );

  let taskAssignmentId;

  if (existingAssignments.length > 0) {
    // Append garbage description to existing task
    const assignment = existingAssignments[0];
    const newDescription = assignment.task_description
      ? `${assignment.task_description}, ${description}`
      : description;

    await pool.query(
      `UPDATE task_assignments SET task_description = $1, updated_at = NOW()
       WHERE id = $2`,
      [newDescription, assignment.id]
    );
    taskAssignmentId = assignment.id;
  } else {
    // Create new task_assignment
    const { rows } = await pool.query(
      `INSERT INTO task_assignments (property_id, date, task_description, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [schedule.property_id, dueDate, description]
    );
    taskAssignmentId = rows[0].id;
  }

  // Create garbage_task record
  await pool.query(
    `INSERT INTO garbage_tasks (garbage_schedule_id, task_type, due_date, task_assignment_id, status)
     VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (garbage_schedule_id, task_type) DO NOTHING`,
    [schedule.id, taskType, dueDate, taskAssignmentId]
  );
}

/**
 * Get all garbage schedules for a property.
 *
 * @param {number} propertyId
 * @returns {Promise<Array>}
 */
export async function getScheduleForProperty(propertyId) {
  const { rows } = await pool.query(
    `SELECT id, property_id, trash_type, collection_date, source_pdf, created_at
     FROM garbage_schedules
     WHERE property_id = $1
     ORDER BY collection_date`,
    [propertyId]
  );
  return rows;
}

/**
 * Delete garbage schedules for a property, optionally filtered by source PDF.
 *
 * @param {number} propertyId
 * @param {string} [sourcePdf]
 */
export async function deleteScheduleForProperty(propertyId, sourcePdf) {
  if (sourcePdf) {
    await pool.query(
      'DELETE FROM garbage_schedules WHERE property_id = $1 AND source_pdf = $2',
      [propertyId, sourcePdf]
    );
  } else {
    await pool.query(
      'DELETE FROM garbage_schedules WHERE property_id = $1',
      [propertyId]
    );
  }
}
