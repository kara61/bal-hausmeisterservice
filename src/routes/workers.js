import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM workers WHERE is_active = true ORDER BY name'
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM workers WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const { name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement } = req.body;

  if (!['fulltime', 'minijob'].includes(worker_type)) {
    return res.status(400).json({ error: 'worker_type must be fulltime or minijob' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, phone_number, worker_type, hourly_rate, monthly_salary || null, registration_date, vacation_entitlement || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Phone number already exists' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const fields = ['name', 'phone_number', 'worker_type', 'hourly_rate', 'monthly_salary', 'vacation_entitlement'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(req.body[field]);
      paramIndex++;
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE workers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    'UPDATE workers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
  res.json(result.rows[0]);
});

export default router;
