import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getDailyOverview } from '../../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date query parameter is required' });
  const tasks = await getDailyOverview(date);
  res.json(tasks);
});
