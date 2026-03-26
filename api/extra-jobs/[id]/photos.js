import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { photo_url } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url is required' });

  const result = await pool.query(
    `UPDATE extra_jobs SET photo_urls = array_append(photo_urls, $1), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [photo_url, req.query.id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
  res.json(result.rows[0]);
});
