import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { carryOverTasks } from '../../src/services/taskScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from_date, to_date } = req.body;
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date are required' });
  }
  const carried = await carryOverTasks(from_date, to_date);
  res.status(201).json(carried);
});
