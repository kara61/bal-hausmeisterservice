import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan, approvePlan, carryOverPlanTasks } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan } from '../helpers.js';

const FROM_DATE = '2026-02-05'; // Thursday (has incomplete task)
const TO_DATE = '2026-02-06';   // Friday

export default async function scenario5(report, { workers }) {
  report.startScenario('Scenario 5: Carry-Over (Thu→Fri, Feb 5→6)');

  const carried = await carryOverPlanTasks(FROM_DATE, TO_DATE);
  report.check('Carry-over executed', Array.isArray(carried), `carried: ${carried?.length}`);
  report.check('At least 1 task carried over', carried.length > 0, `count: ${carried.length}`);

  const { rows: originals } = await pool.query(
    `SELECT pa.*, p.address FROM plan_assignments pa
     JOIN properties p ON p.id = pa.property_id
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     WHERE dp.plan_date = $1 AND pa.status = 'carried_over'`,
    [FROM_DATE]
  );
  report.check('Original assignment marked carried_over', originals.length > 0, `count: ${originals.length}`);

  const plan = await generateDraftPlan(TO_DATE);
  report.check('Friday plan generated', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Friday has assignments', assignments.length > 0, `count: ${assignments.length}`);

  const fridayRegular = assignments.find(a => a.property_address === 'Simstraße 6');
  report.check('Simstraße 6 in Friday plan (regular)', !!fridayRegular, `found: ${!!fridayRegular}`);

  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  const workerIds = [...new Set(assignments.map(a => a.worker_id))];
  for (const wId of workerIds) {
    await simulateCheckIn(wId, TO_DATE, '07:00');
    const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === wId);
    for (let i = 0; i < visits.length; i++) {
      await simulateArrival(visits[i].id, TO_DATE, `07:${15 + i * 45}`);
      await simulateCompletion(visits[i].id, TO_DATE, `${8 + i}:30`);
    }
    await simulateCheckOut(wId, TO_DATE, '15:00');
  }

  const allVisits = await getVisitsForPlan(plan.id);
  const allCompleted = allVisits.every(v => v.status === 'completed');
  report.check('All Friday visits completed', allCompleted, `completed: ${allVisits.filter(v => v.status === 'completed').length}/${allVisits.length}`);

  await computeDailyAnalyticsForDate(TO_DATE);

  return plan;
}
