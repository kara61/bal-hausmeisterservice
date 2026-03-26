import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { importScheduleFromPdf } from '../../../src/services/garbageScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { property_id, dates, source_pdf } = req.body;

  if (!property_id || !dates || !source_pdf) {
    return res.status(400).json({ error: 'property_id, dates, and source_pdf are required' });
  }

  await importScheduleFromPdf(property_id, dates, source_pdf);
  res.json({ imported: true, property_id, dates_count: dates.length });
});
