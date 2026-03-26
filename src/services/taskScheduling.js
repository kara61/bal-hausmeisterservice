import { pool } from '../db/pool.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// --- Pure functions ---

export function getWeekday(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getDay();
}

export function shouldCarryOver(task) {
  return task.status === 'pending' || task.status === 'in_progress';
}

export function formatTaskList(tasks, dateStr) {
  const weekday = getWeekday(dateStr);
  const [, month, day] = dateStr.split('-').map(Number);
  const dayLabel = `${DAY_NAMES[weekday]} ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;

  if (!tasks || tasks.length === 0) {
    return `${dayLabel} — keine Aufgaben zugewiesen.`;
  }

  const header = `Deine Aufgaben fuer ${dayLabel}:`;
  const lines = tasks.map((t, i) => `${i + 1}. ${t.address}, ${t.city} — ${t.task_description}`);
  return `${header}\n${lines.join('\n')}`;
}

// --- DB functions ---

export async function generateDailyTasks(dateStr) {
  const weekday = getWeekday(dateStr);

  const { rows: properties } = await pool.query(
    `SELECT id, standard_tasks FROM properties
     WHERE assigned_weekday = $1 AND is_active = true`,
    [weekday]
  );

  const created = [];
  for (const prop of properties) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM task_assignments WHERE property_id = $1 AND date = $2`,
      [prop.id, dateStr]
    );
    if (rowCount === 0) {
      const { rows } = await pool.query(
        `INSERT INTO task_assignments (property_id, date, task_description, status)
         VALUES ($1, $2, $3, 'pending') RETURNING *`,
        [prop.id, dateStr, prop.standard_tasks]
      );
      created.push(rows[0]);
    }
  }
  return created;
}

export async function carryOverTasks(fromDate, toDate) {
  const { rows: incomplete } = await pool.query(
    `SELECT * FROM task_assignments
     WHERE date = $1 AND status IN ('pending', 'in_progress')`,
    [fromDate]
  );

  const carried = [];
  for (const task of incomplete) {
    await pool.query(
      `UPDATE task_assignments SET status = 'carried_over', updated_at = NOW()
       WHERE id = $1`,
      [task.id]
    );

    const { rowCount } = await pool.query(
      `SELECT 1 FROM task_assignments WHERE property_id = $1 AND date = $2`,
      [task.property_id, toDate]
    );
    if (rowCount === 0) {
      const { rows } = await pool.query(
        `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
        [task.property_id, task.team_id, toDate, task.task_description]
      );
      carried.push(rows[0]);
    }
  }
  return carried;
}

export async function postponeTask(taskId, reason, newDate) {
  const { rows } = await pool.query(
    `UPDATE task_assignments
     SET status = 'postponed', postpone_reason = $2, postponed_to = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [taskId, reason, newDate]
  );
  const task = rows[0];

  const { rowCount } = await pool.query(
    `SELECT 1 FROM task_assignments WHERE property_id = $1 AND date = $2`,
    [task.property_id, newDate]
  );
  if (rowCount === 0) {
    await pool.query(
      `INSERT INTO task_assignments (property_id, team_id, date, task_description, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [task.property_id, task.team_id, newDate, task.task_description]
    );
  }

  return task;
}

export async function getTasksForTeam(teamId, dateStr) {
  const { rows } = await pool.query(
    `SELECT ta.*, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.team_id = $1 AND ta.date = $2
     ORDER BY ta.id`,
    [teamId, dateStr]
  );
  return rows;
}

export async function getDailyOverview(dateStr) {
  const { rows } = await pool.query(
    `SELECT ta.*, p.address, p.city, t.name AS team_name,
       (SELECT json_agg(json_build_object('worker_id', tm.worker_id))
        FROM team_members tm WHERE tm.team_id = t.id) AS team_members
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     LEFT JOIN teams t ON t.id = ta.team_id
     WHERE ta.date = $1
     ORDER BY ta.id`,
    [dateStr]
  );
  return rows;
}
