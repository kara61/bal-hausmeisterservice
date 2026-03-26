import { Router } from 'express';
import { pool } from '../db/pool.js';
import { adjustSickLeave } from '../services/sickLeave.js';

const router = Router();

router.get('/', async (req, res) => {
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

router.put('/:id', async (req, res) => {
  const result = await adjustSickLeave(parseInt(req.params.id), req.body);
  res.json(result);
});

export default router;
