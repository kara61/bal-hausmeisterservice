import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { month, year, worker_id } = req.query;

  if (month || year) {
    const monthInt = parseInt(month, 10);
    const yearInt = parseInt(year, 10);
    if (!month || !year || isNaN(monthInt) || isNaN(yearInt) || monthInt < 1 || monthInt > 12 || yearInt < 1000 || yearInt > 9999) {
      return res.status(400).json({ error: 'month must be 1-12 and year must be a 4-digit number' });
    }
  }

  let query = `
    SELECT te.*, w.name AS worker_name, w.worker_type
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    params.push(parseInt(month, 10), parseInt(year, 10));
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
