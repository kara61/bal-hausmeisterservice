import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getVacationBalance, ensureVacationBalance } from '../../../src/services/vacation.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
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
    return res.json(balances);
  }

  if (req.method === 'POST') {
    const { worker_id, year, entitlement_days } = req.body || {};
    if (!worker_id || !year || !entitlement_days
        || !Number.isFinite(Number(worker_id))
        || !Number.isFinite(Number(year))
        || !Number.isFinite(Number(entitlement_days))) {
      return res.status(400).json({ error: 'worker_id, year, and entitlement_days are required and must be numeric' });
    }
    await ensureVacationBalance(worker_id, year, entitlement_days);
    const balance = await getVacationBalance(worker_id, year);
    return res.status(201).json(balance);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
