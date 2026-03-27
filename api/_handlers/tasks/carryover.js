import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { carryOverTasks } from '../../../src/services/taskScheduling.js';

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { from_date, to_date } = req.body;
  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date and to_date are required' });
  }
  if (!isValidDate(from_date) || !isValidDate(to_date)) {
    return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
  }
  const carried = await carryOverTasks(from_date, to_date);
  res.status(201).json(carried);
});
