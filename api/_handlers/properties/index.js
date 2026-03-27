import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { rows: properties } = await pool.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
    );
    const { rows: tasks } = await pool.query(
      `SELECT * FROM property_tasks WHERE property_id = ANY($1) AND is_active = true ORDER BY id`,
      [properties.map(p => p.id)]
    );
    const tasksByProperty = {};
    for (const t of tasks) {
      if (!tasksByProperty[t.property_id]) tasksByProperty[t.property_id] = [];
      tasksByProperty[t.property_id].push(t);
    }
    const result = properties.map(p => ({
      ...p,
      tasks: tasksByProperty[p.id] || [],
    }));
    return res.json(result);
  }

  if (req.method === 'POST') {
    const { address, city, standard_tasks, assigned_weekday, tasks } = req.body;

    if (!address || !city) {
      return res.status(400).json({ error: 'address and city are required' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [address, city, standard_tasks || '', assigned_weekday ?? null]
      );
      const property = result.rows[0];

      // Insert tasks if provided
      const insertedTasks = [];
      if (tasks && Array.isArray(tasks)) {
        for (const t of tasks) {
          if (!t.task_name || !t.task_name.trim()) continue;
          const { rows } = await pool.query(
            `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [
              property.id,
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
            ]
          );
          insertedTasks.push(rows[0]);
        }
      }

      return res.status(201).json({ ...property, tasks: insertedTasks });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Property with this address already exists' });
      }
      throw err;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
