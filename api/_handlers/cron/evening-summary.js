// api/_handlers/cron/evening-summary.js
import { sendEveningSummary } from '../../../src/services/eveningSummary.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    await sendEveningSummary(today);
    res.json({ ok: true, date: today });
  } catch (err) {
    console.error('Evening summary cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
