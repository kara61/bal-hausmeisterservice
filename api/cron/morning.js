import { carryOverTasks, generateDailyTasks } from '../../src/services/taskScheduling.js';
import { sendDailyTaskLists } from '../../src/services/taskNotifications.js';

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Carry over unfinished tasks
    await carryOverTasks(yesterday, today);

    // Generate daily tasks (includes garbage tasks)
    await generateDailyTasks(today);

    // Send task lists to workers
    await sendDailyTaskLists(today);

    res.json({ ok: true, date: today });
  } catch (err) {
    console.error('Morning cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
