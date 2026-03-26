import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query(`
    SELECT te.*, w.name AS worker_name
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE te.is_flagged = true AND te.resolved = false
    ORDER BY te.date DESC
  `);
  res.json(result.rows);
});
