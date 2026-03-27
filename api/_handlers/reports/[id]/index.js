import { createClient } from '@supabase/supabase-js';
import { pool } from '../../../../src/db/pool.js';
import { config } from '../../../../src/config.js';
import { checkAuth } from '../../../_utils/auth.js';
import { withErrorHandler } from '../../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'PUT') {
    const { status } = req.body;
    if (!['draft', 'reviewed', 'sent'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE monthly_reports SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.query.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    return res.json(result.rows[0]);
  }

  if (req.method === 'DELETE') {
    const result = await pool.query('SELECT * FROM monthly_reports WHERE id = $1', [req.query.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

    const report = result.rows[0];

    // Delete PDF from Supabase Storage if it exists
    if (report.pdf_path) {
      const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const storagePath = `reports/Gehaltsbericht_${String(report.month).padStart(2, '0')}_${report.year}.pdf`;
      await supabase.storage.from('photos').remove([storagePath]);
    }

    await pool.query('DELETE FROM monthly_reports WHERE id = $1', [req.query.id]);
    return res.json({ message: 'Report deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
