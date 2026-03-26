import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { reassignPlanAssignment } from '../../../src/services/planGeneration.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'PUT') {
    const { worker_id } = req.body;
    if (!worker_id) return res.status(400).json({ error: 'worker_id is required' });

    const assignment = await reassignPlanAssignment(parseInt(id, 10), worker_id);
    return res.json(assignment);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
