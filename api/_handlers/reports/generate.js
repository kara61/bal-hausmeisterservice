import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { generateMonthlyReport } from '../../../src/services/pdfReport.js';
import { notifyHalilReportReady } from '../../../src/services/notifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const report = await generateMonthlyReport(parseInt(month), parseInt(year));
  await notifyHalilReportReady(parseInt(month), parseInt(year));
  res.json({ message: 'Report generated', filename: report.filename });
});
