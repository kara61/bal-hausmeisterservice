// api/_handlers/cron/evening-plan.js
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { notifyHalilPlanReady } from '../../../src/services/planNotifications.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tomorrow = req.query?.date || new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const plan = await generateDraftPlan(tomorrow);
    await notifyHalilPlanReady(plan.id);
    res.json({ ok: true, date: tomorrow, plan_id: plan.id });
  } catch (err) {
    console.error('Evening plan cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
