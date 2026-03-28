import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan } from '../../../src/services/planGeneration.js';
import { syncMonthForAll } from '../../../src/services/hourBalance.js';
import { getAssignmentsForPlan } from '../helpers.js';
import { simulateCheckIn, simulateCheckOut } from '../helpers.js';

export default async function scenario7(report, { workers }) {
  report.startScenario('Scenario 7: Edge Cases');

  // --- Edge Case 1: Empty day (Saturday) ---
  const saturdayPlan = await generateDraftPlan('2026-02-07');
  report.check('Saturday plan generated (no error)', !!saturdayPlan);
  const satAssignments = await getAssignmentsForPlan(saturdayPlan.id);
  report.check('Saturday has 0 assignments', satAssignments.length === 0, `assignments: ${satAssignments.length}`);

  // --- Edge Case 2: Duplicate plan generation ---
  const mondayPlanAgain = await generateDraftPlan('2026-02-02');
  const { rows: mondayPlans } = await pool.query(
    `SELECT * FROM daily_plans WHERE plan_date = '2026-02-02'`
  );
  report.check('Duplicate plan call returns existing (no duplicate)', mondayPlans.length === 1, `plans: ${mondayPlans.length}`);

  // --- Edge Case 3: Minijob limit ---
  const leyla = workers['Sim Leyla'];
  for (let day = 9; day <= 20; day++) {
    const d = `2026-02-${String(day).padStart(2, '0')}`;
    await simulateCheckIn(leyla.id, d, '08:00');
    await simulateCheckOut(leyla.id, d, '12:00'); // 4 hours/day × 12 days = 48 hours
  }

  const balances = await syncMonthForAll(2026, 2);
  // syncMonthForAll only processes field/cleaning roles — joker (Leyla) is excluded by design.
  // Verify she's correctly excluded and that her time entries exist but no balance is created.
  const leylaBalance = balances.find(b => b.worker_id === leyla.id);
  report.check('Sim Leyla (joker) excluded from hour balances (by design)', leylaBalance === undefined, `found: ${leylaBalance !== undefined}`);

  // Verify her time entries were created though
  const { rows: leylaEntries } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM time_entries WHERE worker_id = $1`,
    [leyla.id]
  );
  report.check('Sim Leyla has time entries (12 days)', parseInt(leylaEntries[0].cnt) === 12, `entries: ${leylaEntries[0].cnt}`);

  // --- Edge Case 4: Worker with no assignments ---
  const { rows: yusufAnalytics } = await pool.query(
    `SELECT * FROM analytics_daily WHERE worker_id = $1 AND date = '2026-02-03'`,
    [workers['Sim Yusuf'].id]
  );
  report.check('Sim Yusuf has no analytics for Tue (no assignment)', yusufAnalytics.length === 0, `rows: ${yusufAnalytics.length}`);
}
