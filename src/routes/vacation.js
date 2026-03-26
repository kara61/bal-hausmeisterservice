import { Router } from 'express';
import { getVacationBalance, ensureVacationBalance } from '../services/vacation.js';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const result = await pool.query(`
    SELECT vb.*, w.name AS worker_name
    FROM vacation_balances vb
    JOIN workers w ON vb.worker_id = w.id
    WHERE vb.year = $1 AND w.is_active = true
    ORDER BY w.name
  `, [year]);

  const balances = result.rows.map(row => ({
    ...row,
    remaining: row.entitlement_days - row.used_days,
  }));
  res.json(balances);
});

router.post('/', async (req, res) => {
  const { worker_id, year, entitlement_days } = req.body;
  await ensureVacationBalance(worker_id, year, entitlement_days);
  const balance = await getVacationBalance(worker_id, year);
  res.status(201).json(balance);
});

export default router;
