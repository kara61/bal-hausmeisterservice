import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  const { id } = req.query;

  if (req.method === 'GET') {
    const result = await pool.query('SELECT * FROM workers WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'PUT') {
    const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement', 'registration_date'];
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

    // Check for duplicate phone number
    if (req.body.phone_number) {
      const dup = await pool.query(
        'SELECT id FROM workers WHERE phone_number = $1 AND id != $2',
        [req.body.phone_number, id]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Phone number already exists' });
      }
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE workers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query(
      'UPDATE workers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    return res.json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
