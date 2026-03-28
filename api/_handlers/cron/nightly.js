import { pool } from '../../../src/db/pool.js';
import { detectMissingCheckouts, flagMissingCheckout } from '../../../src/services/anomaly.js';
import { sendWhatsAppMessage } from '../../../src/services/whatsapp.js';
import { config } from '../../../src/config.js';
import { computeDailyAnalyticsForDate, computePropertyMonthlyForMonth } from '../../../src/services/analytics.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Flag missing checkouts
    const missing = await detectMissingCheckouts(yesterday);
    for (const entry of missing) {
      await flagMissingCheckout(entry.id);
    }

    // Notify Halil
    if (missing.length > 0) {
      const names = missing.map(e => e.worker_name).join(', ');
      await sendWhatsAppMessage(
        config.halilWhatsappNumber,
        `${missing.length} fehlende Auschecken gestern: ${names}. Bitte im Dashboard korrigieren.`
      );
    }

    // Clean up stale conversation states (older than 24 hours)
    await pool.query(
      `DELETE FROM conversation_state WHERE updated_at < NOW() - INTERVAL '24 hours'`
    );

    // Plan generation moved to evening-plan cron (20:00 CET)

    // Compute analytics for yesterday
    await computeDailyAnalyticsForDate(yesterday);

    // On first of month, compute previous month's property analytics
    const today = new Date();
    if (today.getDate() === 1) {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const monthStr = prevMonth.toISOString().split('T')[0];
      await computePropertyMonthlyForMonth(monthStr);
    }

    res.json({ ok: true, flagged: missing.length, analytics_computed: yesterday });
  } catch (err) {
    console.error('Nightly cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
