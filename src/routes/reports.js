import { Router } from 'express';
import { pool } from '../db/pool.js';
import { generateMonthlyReport } from '../services/pdfReport.js';
import { notifyHalilReportReady } from '../services/notifications.js';

const router = Router();

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM monthly_reports ORDER BY year DESC, month DESC');
  res.json(result.rows);
});

router.post('/generate', async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const report = await generateMonthlyReport(parseInt(month), parseInt(year));
  await notifyHalilReportReady(parseInt(month), parseInt(year));
  res.json({ message: 'Report generated', filename: report.filename });
});

router.get('/:id/download', async (req, res) => {
  const result = await pool.query('SELECT * FROM monthly_reports WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

  const report = result.rows[0];
  if (!report.pdf_path) return res.status(404).json({ error: 'PDF not generated yet' });

  res.download(report.pdf_path);
});

router.put('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'reviewed', 'sent'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const result = await pool.query(
    'UPDATE monthly_reports SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
  res.json(result.rows[0]);
});

export default router;
