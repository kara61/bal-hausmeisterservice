import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { generateDraftPlan } from '../../../src/services/planGeneration.js';

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT dp.*,
         (SELECT COUNT(*) FROM plan_assignments WHERE daily_plan_id = dp.id) AS assignment_count
       FROM daily_plans dp
       ORDER BY dp.plan_date DESC
       LIMIT 30`
    );
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });

    const plan = await generateDraftPlan(date);
    return res.status(201).json(plan);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
