// api/_handlers/cron/morning-remind.js
import { sendMorningReminders } from '../../../src/services/morningFlow.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await sendMorningReminders(today);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Morning remind cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
