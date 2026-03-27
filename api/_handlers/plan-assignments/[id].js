import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { reassignPlanAssignment } from '../../../src/services/planGeneration.js';
import { pool } from '../../../src/db/pool.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const { id } = req.query;

  if (req.method === 'PUT') {
    const { worker_id, status } = req.body;

    // Status update
    if (status) {
      const { rows: [updated] } = await pool.query(
        `UPDATE plan_assignments SET status = $1, completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE completed_at END
         WHERE id = $2 RETURNING *`,
        [status, parseInt(id, 10)]
      );
      if (!updated) return res.status(404).json({ error: 'Assignment not found' });
      return res.json(updated);
    }

    // Worker reassignment
    if (worker_id) {
      const assignment = await reassignPlanAssignment(parseInt(id, 10), worker_id);
      return res.json(assignment);
    }

    return res.status(400).json({ error: 'worker_id or status is required' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
