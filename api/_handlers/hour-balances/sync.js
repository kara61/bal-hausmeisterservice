import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: 'year and month are required' });

  const yearInt = parseInt(year, 10);
  const monthInt = parseInt(month, 10);
  const results = await syncMonthForAll(yearInt, monthInt);
  return res.json(results);
});
