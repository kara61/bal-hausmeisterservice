import { carryOverPlanTasks, redistributeSickWorkers } from '../../../src/services/planGeneration.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Carry over unfinished plan tasks from yesterday
    const carried = await carryOverPlanTasks(yesterday, today);

    // Redistribute if sick workers detected
    const redistribution = await redistributeSickWorkers(today);

    res.json({
      ok: true,
      date: today,
      carried_over: carried.length,
      redistributed: redistribution.reassigned,
    });
  } catch (err) {
    console.error('Morning cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
