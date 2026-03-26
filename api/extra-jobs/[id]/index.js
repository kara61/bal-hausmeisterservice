import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'PUT') {
    const fields = ['description', 'address', 'team_id', 'date', 'time_in', 'time_out', 'status'];
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

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(req.query.id);

    const result = await pool.query(
      `UPDATE extra_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'DELETE FROM extra_jobs WHERE id = $1 RETURNING *',
      [req.query.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    return res.json({ message: 'Extra job deleted', job: result.rows[0] });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
