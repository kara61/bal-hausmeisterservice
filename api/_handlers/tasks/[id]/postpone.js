import { checkAuth } from '../../../_utils/auth.js';
import { withErrorHandler } from '../../../_utils/handler.js';
import { postponeTask } from '../../../../src/services/taskScheduling.js';

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str).getTime());
}

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { reason, new_date } = req.body;
  if (!reason || !new_date) {
    return res.status(400).json({ error: 'reason and new_date are required' });
  }
  if (!isValidDate(new_date)) {
    return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
  }
  const task = await postponeTask(req.query.id, reason, new_date);
  res.json(task);
});
