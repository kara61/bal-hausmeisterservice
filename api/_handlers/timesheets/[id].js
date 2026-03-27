import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { pool } from '../../../src/db/pool.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../../src/config.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  const id = req.query.id;

  if (req.method === 'GET') {
    // Download redirect
    const { rows: [ts] } = await pool.query(
      'SELECT pdf_path FROM worker_timesheets WHERE id = $1', [id]
    );
    if (!ts || !ts.pdf_path) return res.status(404).json({ error: 'Timesheet not found' });
    return res.redirect(ts.pdf_path);
  }

  if (req.method === 'DELETE') {
    const { rows: [ts] } = await pool.query(
      'SELECT pdf_path FROM worker_timesheets WHERE id = $1', [id]
    );
    if (!ts) return res.status(404).json({ error: 'Timesheet not found' });

    // Remove from Supabase Storage
    if (ts.pdf_path) {
      const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
      const pathMatch = ts.pdf_path.match(/\/photos\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from('photos').remove([pathMatch[1]]);
      }
    }

    await pool.query('DELETE FROM worker_timesheets WHERE id = $1', [id]);
    return res.json({ message: 'Deleted' });
  }

  res.status(405).json({ error: 'Method not allowed' });
});
