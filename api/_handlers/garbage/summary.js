import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { rows } = await pool.query(
    `SELECT
       gs.property_id,
       p.address,
       p.city,
       COUNT(*)::int AS total_dates,
       array_agg(DISTINCT gs.trash_type) AS trash_types,
       MIN(gs.collection_date) AS earliest_date,
       MAX(gs.collection_date) AS latest_date,
       array_agg(DISTINCT gs.source_pdf) AS source_pdfs
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     GROUP BY gs.property_id, p.address, p.city
     ORDER BY p.address`
  );
  res.json(rows);
});
