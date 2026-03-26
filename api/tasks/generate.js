import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { generateDailyTasks } from '../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });
  const created = await generateDailyTasks(date);
  res.status(201).json(created);
});
