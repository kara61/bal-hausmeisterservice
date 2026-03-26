import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM properties WHERE is_active = true ORDER BY city, address'
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

router.post('/', async (req, res) => {
  const { address, city, standard_tasks, assigned_weekday } = req.body;

  if (!address || !city) {
    return res.status(400).json({ error: 'address and city are required' });
  }

  const result = await pool.query(
    `INSERT INTO properties (address, city, standard_tasks, assigned_weekday)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [address, city, standard_tasks || '', assigned_weekday ?? null]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const fields = ['address', 'city', 'standard_tasks', 'assigned_weekday'];
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
    `UPDATE properties SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query(
    'UPDATE properties SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Property not found' });
  res.json(result.rows[0]);
});

export default router;
