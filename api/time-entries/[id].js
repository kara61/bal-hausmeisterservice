import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { check_in, check_out, resolved } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (check_in !== undefined) { updates.push(`check_in = $${idx++}`); values.push(check_in); }
  if (check_out !== undefined) { updates.push(`check_out = $${idx++}`); values.push(check_out); }
  if (resolved !== undefined) {
    updates.push(`resolved = $${idx++}`); values.push(resolved);
    if (resolved) { updates.push(`is_flagged = false`); }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  values.push(id);

  const result = await pool.query(
    `UPDATE time_entries SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(result.rows[0]);
});
