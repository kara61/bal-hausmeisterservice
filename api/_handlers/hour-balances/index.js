import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getWorkerBalances } from '../../../src/services/hourBalance.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const balances = await getWorkerBalances();
  return res.json(balances);
});
