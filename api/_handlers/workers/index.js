import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT * FROM workers WHERE is_active = true ORDER BY name'
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role } = req.body;

    if (!name || !phone_number) {
      return res.status(400).json({ error: 'name and phone_number are required' });
    }

    if (!['fulltime', 'minijob'].includes(worker_type)) {
      return res.status(400).json({ error: 'worker_type must be fulltime or minijob' });
    }

    const role = worker_role || 'field';
    if (!['field', 'cleaning', 'office'].includes(role)) {
      return res.status(400).json({ error: 'worker_role must be field, cleaning, or office' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, phone_number, worker_type, hourly_rate || null, monthly_salary || null, registration_date || null, vacation_entitlement || 0, role]
      );
      const response = { ...result.rows[0] };
      const nameDup = await pool.query(
        'SELECT id FROM workers WHERE LOWER(name) = LOWER($1) AND id != $2 AND is_active = true',
        [name, result.rows[0].id]
      );
      if (nameDup.rows.length > 0) {
        response._warning = 'Ein anderer Mitarbeiter hat den gleichen Namen';
      }
      return res.status(201).json(response);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Phone number already exists' });
      throw err;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
