import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('SELECT * FROM monthly_reports ORDER BY year DESC, month DESC');
  res.json(result.rows);
});
