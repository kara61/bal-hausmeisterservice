import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { worker_id, role, force } = req.body;
  if (!worker_id || !['field', 'cleaning', 'office', 'joker'].includes(role)) {
    return res.status(400).json({ error: 'worker_id and role (field/cleaning/office) are required' });
  }

  let warnings = [];

  if (role !== 'field') {
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM workers WHERE is_active = true AND worker_role = 'field' AND id != $1`,
      [worker_id]
    );
    if (count === 0) {
      warnings.push('last_field_worker');
    }

    const { rows: [{ count: futureCount }] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM plan_assignments pa
       JOIN daily_plans dp ON dp.id = pa.daily_plan_id
       WHERE pa.worker_id = $1 AND dp.plan_date > CURRENT_DATE AND pa.status != 'completed'`,
      [worker_id]
    );
    if (futureCount > 0) {
      warnings.push('future_assignments');
    }

    if (warnings.length > 0 && !force) {
      return res.json({ _warnings: warnings, future_assignment_count: futureCount });
    }

    if (futureCount > 0) {
      await pool.query(
        `DELETE FROM plan_assignments
         WHERE worker_id = $1 AND daily_plan_id IN (
           SELECT id FROM daily_plans WHERE plan_date > CURRENT_DATE
         ) AND status != 'completed'`,
        [worker_id]
      );
    }
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE workers SET worker_role = $1, updated_at = NOW() WHERE id = $2 AND is_active = true RETURNING *`,
    [role, worker_id]
  );

  if (!updated) {
    return res.status(404).json({ error: 'Worker not found' });
  }

  return res.json(updated);
});
