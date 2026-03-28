// api/_handlers/cron/checkin-remind.js
import { sendCheckinReminders } from '../../../src/services/morningFlow.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await sendCheckinReminders(today);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Checkin remind cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
