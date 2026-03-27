import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { worker_id, is_field_worker } = req.body;
  if (!worker_id || typeof is_field_worker !== 'boolean') {
    return res.status(400).json({ error: 'worker_id and is_field_worker (boolean) are required' });
  }

  // Check if this would remove the last field worker
  if (!is_field_worker) {
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM workers WHERE is_active = true AND is_field_worker = true AND id != $1`,
      [worker_id]
    );
    if (count === 0) {
      return res.json({
        _warning: 'last_field_worker',
        message: 'Dies ist der letzte Aussendienstmitarbeiter. Tagesplaene koennen nicht mehr erstellt werden.',
      });
    }

    // Remove future plan assignments for this worker
    await pool.query(
      `DELETE FROM plan_assignments
       WHERE worker_id = $1 AND daily_plan_id IN (
         SELECT id FROM daily_plans WHERE plan_date > CURRENT_DATE
       ) AND status != 'completed'`,
      [worker_id]
    );
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE workers SET is_field_worker = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *`,
    [is_field_worker, worker_id]
  );

  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  return res.json(updated);
});
