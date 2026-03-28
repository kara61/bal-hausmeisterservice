import { carryOverPlanTasks, redistributeSickWorkers } from '../../../src/services/planGeneration.js';
import { sendMorningAssignments } from '../../../src/services/morningFlow.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = req.query?.date || new Date().toISOString().split('T')[0];
    const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86400000).toISOString().split('T')[0];

    const carried = await carryOverPlanTasks(yesterday, today);
    const redistribution = await redistributeSickWorkers(today);
    const assignments = await sendMorningAssignments(today);

    res.json({
      ok: true,
      date: today,
      carried_over: carried.length,
      redistributed: redistribution.reassigned,
      assignments_sent: assignments.sent,
    });
  } catch (err) {
    console.error('Morning cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
