import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    const { rows: tasks } = await pool.query(
      'SELECT * FROM property_tasks WHERE property_id = $1 AND is_active = true ORDER BY id',
      [id]
    );
    return res.json({ ...result.rows[0], tasks });
  }

  if (req.method === 'PUT') {
    const fields = ['address', 'city', 'standard_tasks', 'assigned_weekday', 'photo_required'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0 && !req.body.tasks) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    let property;
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(id);
      const result = await pool.query(
        `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
      property = result.rows[0];
    } else {
      const result = await pool.query('SELECT * FROM properties WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
      property = result.rows[0];
    }

    // Sync tasks if provided
    if (req.body.tasks && Array.isArray(req.body.tasks)) {
      const incomingTasks = req.body.tasks;
      const incomingIds = incomingTasks.filter(t => t.id).map(t => t.id);

      // Deactivate tasks not in the incoming list
      if (incomingIds.length > 0) {
        await pool.query(
          `UPDATE property_tasks SET is_active = false
           WHERE property_id = $1 AND is_active = true AND id != ALL($2)`,
          [id, incomingIds]
        );
      } else {
        await pool.query(
          `UPDATE property_tasks SET is_active = false
           WHERE property_id = $1 AND is_active = true`,
          [id]
        );
      }

      // Update existing and insert new
      for (const t of incomingTasks) {
        if (!t.task_name || !t.task_name.trim()) continue;

        if (t.id) {
          // Update existing task
          await pool.query(
            `UPDATE property_tasks
             SET task_name = $1, worker_role = $2, schedule_type = $3,
                 schedule_day = $4, biweekly_start_date = $5, is_active = true
             WHERE id = $6 AND property_id = $7`,
            [
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
              t.id,
              id,
            ]
          );
        } else {
          // Insert new task
          await pool.query(
            `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              t.task_name.trim(),
              t.worker_role || 'field',
              t.schedule_type || 'property_default',
              t.schedule_day ?? null,
              t.biweekly_start_date || null,
            ]
          );
        }
      }
    }

    // Return property with current tasks
    const { rows: tasks } = await pool.query(
      'SELECT * FROM property_tasks WHERE property_id = $1 AND is_active = true ORDER BY id',
      [id]
    );
    return res.json({ ...property, tasks });
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'UPDATE properties SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
    return res.json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
