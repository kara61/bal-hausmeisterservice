import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getPlanWithAssignments } from '../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'GET') {
    const plan = await getPlanWithAssignments(parseInt(id, 10));
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    return res.json(plan);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
