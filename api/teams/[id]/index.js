import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING *', [req.query.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
  res.json(result.rows[0]);
});
