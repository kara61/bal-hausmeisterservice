import { pool } from '../../../../src/db/pool.js';
import { checkAuth } from '../../../_utils/auth.js';
import { withErrorHandler } from '../../../_utils/handler.js';
import { notifyTeamTaskUpdate } from '../../../../src/services/taskNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });

  const result = await pool.query(
    `UPDATE task_assignments SET team_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [team_id, req.query.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

  const task = result.rows[0];
  await notifyTeamTaskUpdate(team_id, task, 'assigned');
  res.json(task);
});
