import { pool } from '../../../src/db/pool.js';
import { detectMissingCheckouts, flagMissingCheckout } from '../../../src/services/anomaly.js';
import { sendWhatsAppMessage } from '../../../src/services/whatsapp.js';
import { config } from '../../../src/config.js';
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { notifyHalilPlanGaps } from '../../../src/services/planNotifications.js';

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

    // Generate draft plan for tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const plan = await generateDraftPlan(tomorrow);
    await notifyHalilPlanGaps(plan.id);

    res.json({ ok: true, flagged: missing.length, plan_date: tomorrow, plan_id: plan.id });
  } catch (err) {
    console.error('Nightly cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
