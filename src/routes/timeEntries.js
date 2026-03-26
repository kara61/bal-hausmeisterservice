import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
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

router.get('/flagged', async (req, res) => {
  const result = await pool.query(`
    SELECT te.*, w.name AS worker_name
    FROM time_entries te
    JOIN workers w ON te.worker_id = w.id
    WHERE te.is_flagged = true AND te.resolved = false
    ORDER BY te.date DESC
  `);
  res.json(result.rows);
});

router.put('/:id', async (req, res) => {
  const { check_in, check_out, resolved } = req.body;
  const updates = [];
  const values = [];
  let idx = 1;

  if (check_in !== undefined) { updates.push(`check_in = $${idx++}`); values.push(check_in); }
  if (check_out !== undefined) { updates.push(`check_out = $${idx++}`); values.push(check_out); }
  if (resolved !== undefined) {
    updates.push(`resolved = $${idx++}`); values.push(resolved);
    if (resolved) { updates.push(`is_flagged = false`); }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  values.push(req.params.id);

  const result = await pool.query(
    `UPDATE time_entries SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
  res.json(result.rows[0]);
});

export default router;
