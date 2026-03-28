import { getWorkerAnalytics, getOperationsAnalytics, getCostAnalytics } from '../../../src/services/analytics.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';
import { pool } from '../../../src/db/pool.js';

export default async function scenario6(report, { workers }) {
  report.startScenario('Scenario 6: Full Week Summary (Feb 2-6)');

  const workerStats = await getWorkerAnalytics('2026-02-01', '2026-02-28');
  report.check('Worker analytics returned data', workerStats.length > 0, `workers: ${workerStats.length}`);

  const ali = workerStats.find(w => w.name === 'Sim Ali');
  if (ali) {
    report.check('Sim Ali has days worked', ali.daysWorked > 0, `days: ${ali.daysWorked}`);
    report.check('Sim Ali has properties completed', ali.totalCompleted > 0, `completed: ${ali.totalCompleted}`);
    report.check('Sim Ali has sick days (Wed)', ali.sickDays >= 1, `sick: ${ali.sickDays}`);
  }

  const ops = await getOperationsAnalytics('2026-02-01', '2026-02-28');
  report.check('Operations analytics computed', ops.totalScheduled > 0, `scheduled: ${ops.totalScheduled}, completed: ${ops.totalCompleted}`);
  report.check('Plan adherence > 0%', ops.planAdherence > 0, `adherence: ${ops.planAdherence}%`);

  const costs = await getCostAnalytics('2026-02-01', '2026-02-28');
  report.check('Cost analytics returned data', costs.length > 0, `workers: ${costs.length}`);

  const aliCost = costs.find(c => c.name === 'Sim Ali');
  if (aliCost) {
    report.check('Sim Ali cost computed', aliCost.totalHours > 0, `hours: ${aliCost.totalHours}, cost: €${aliCost.regularCost}`);
  }

  const balances = await syncMonthForAll(2026, 2);
  report.check('Hour balances synced for February', balances.length > 0, `workers: ${balances.length}`);

  const aliBalance = balances.find(b => b.worker_id === workers['Sim Ali']?.id);
  if (aliBalance) {
    report.check('Sim Ali has February hour balance', aliBalance.surplus_hours !== undefined, `surplus: ${aliBalance.surplus_hours}h`);
  }

  return { workerStats, ops, costs, balances };
}
