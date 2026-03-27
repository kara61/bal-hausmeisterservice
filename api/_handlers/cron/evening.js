import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { notifyHalilPlanReady } from '../../../src/services/planNotifications.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Generate plan for tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const plan = await generateDraftPlan(tomorrow);

    // TODO: Check auto_approve setting — for now, always notify Halil
    await notifyHalilPlanReady(plan.id);

    res.json({ ok: true, date: tomorrow, plan_id: plan.id });
  } catch (err) {
    console.error('Evening cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
