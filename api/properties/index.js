import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { address, city, standard_tasks, assigned_weekday } = req.body;

    if (!address || !city) {
      return res.status(400).json({ error: 'address and city are required' });
    }

    const result = await pool.query(
      `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [address, city, standard_tasks || '', assigned_weekday ?? null]
    );
    return res.status(201).json(result.rows[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
