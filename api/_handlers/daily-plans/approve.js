import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { approvePlan } from '../../../src/services/planGeneration.js';
import { sendPlanAssignments } from '../../../src/services/planNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Plan ID is required' });

  const plan = await approvePlan(parseInt(id, 10), 'halil');
  const { sent } = await sendPlanAssignments(plan.id);

  return res.json({ ...plan, messages_sent: sent });
});
