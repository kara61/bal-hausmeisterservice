import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { listTimesheets } from '../../../src/services/timesheetGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const month = parseInt(req.query.month);
  const year = parseInt(req.query.year);
  if (!month || !year) return res.status(400).json({ error: 'month and year query params required' });

  const timesheets = await listTimesheets(month, year);
  res.json(timesheets);
});
