import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { setInitialBalance } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { worker_id, year, surplus_hours, note } = req.body;
  if (!worker_id || !year || surplus_hours === undefined) {
    return res.status(400).json({ error: 'worker_id, year, and surplus_hours are required' });
  }

  const result = await setInitialBalance(worker_id, year, surplus_hours, note);
  return res.json(result);
});
