import { pool } from '../../../../src/db/pool.js';
import { checkAuth } from '../../../_utils/auth.js';
import { withErrorHandler } from '../../../_utils/handler.js';

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'postponed'];

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { status, photo_url } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [status];
  let paramIndex = 2;

  if (status === 'done') {
    updates.push(`completed_at = NOW()`);
  }

  if (photo_url) {
    updates.push(`photo_url = $${paramIndex}`);
    values.push(photo_url);
    paramIndex++;
  }

  values.push(req.query.id);

  const result = await pool.query(
    `UPDATE task_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
  res.json(result.rows[0]);
});
