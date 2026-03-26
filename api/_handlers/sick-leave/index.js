import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { worker_id, status } = req.query;
  let query = `
    SELECT sl.*, w.name AS worker_name
    FROM sick_leave sl
    JOIN workers w ON sl.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (worker_id) {
    params.push(parseInt(worker_id));
    query += ` AND sl.worker_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND sl.status = $${params.length}`;
  }

  query += ' ORDER BY sl.start_date DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});
