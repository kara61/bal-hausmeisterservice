import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const days = parseInt(req.query.days, 10) || 7;
  const { rows } = await pool.query(
    `SELECT gs.*, p.address, p.city
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date >= CURRENT_DATE
       AND gs.collection_date < CURRENT_DATE + $1 * INTERVAL '1 day'
     ORDER BY gs.collection_date, p.address`,
    [days]
  );
  res.json(rows);
});
