import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { month, year, worker_id } = req.query;
  let query = `
    SELECT te.*, w.name AS worker_name, w.worker_type
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    params.push(parseInt(month), parseInt(year));
    query += ` AND EXTRACT(MONTH FROM te.date) = $${params.length - 1} AND EXTRACT(YEAR FROM te.date) = $${params.length}`;
  }
  if (worker_id) {
    params.push(parseInt(worker_id));
    query += ` AND te.worker_id = $${params.length}`;
  }

  query += ' ORDER BY te.date ASC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});
