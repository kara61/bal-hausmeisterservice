// api/_handlers/cron/auto-approve.js
import { pool } from '../../../src/db/pool.js';
import { approvePlan } from '../../../src/services/planGeneration.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tomorrow = req.query?.date || new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const { rows } = await pool.query(
      `SELECT id FROM daily_plans WHERE plan_date = $1 AND status = 'draft'`,
      [tomorrow]
    );

    let approved = 0;
    for (const plan of rows) {
      await approvePlan(plan.id, 'auto_approve');
      approved++;
    }

    res.json({ ok: true, date: tomorrow, auto_approved: approved });
  } catch (err) {
    console.error('Auto-approve cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
