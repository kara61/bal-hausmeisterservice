import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const result = await pool.query('SELECT * FROM monthly_reports WHERE id = $1', [req.query.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

  const report = result.rows[0];
  if (!report.pdf_path) return res.status(404).json({ error: 'PDF not generated yet' });

  // pdf_path is now a Supabase public URL — redirect to it
  res.redirect(report.pdf_path);
});
