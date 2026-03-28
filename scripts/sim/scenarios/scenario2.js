import { generateDraftPlan, approvePlan } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-03'; // Tuesday

export default async function scenario2(report, { workers }) {
  report.startScenario('Scenario 2: Multiple Workers, Multiple Roles (Tue Feb 3)');

  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Tue Feb 3', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignment(s) for Tuesday', assignments.length > 0, `assignments: ${assignments.length}`);

  const cleaningAssignment = assignments.find(a => a.property_address === 'Simstraße 3');
  if (cleaningAssignment) {
    report.check(
      'Cleaning property assigned to cleaning worker',
      cleaningAssignment.worker_name === 'Sim Marwa',
      `assigned to: ${cleaningAssignment.worker_name}`
    );
  } else {
    report.check('Simstraße 3 in plan', false, 'Not found in assignments');
  }

  const fieldWorkerNames = ['Sim Ali', 'Sim Mehmet', 'Sim Yusuf'];
  const fieldAssigned = assignments.filter(a => fieldWorkerNames.includes(a.worker_name));
  report.check('No field workers assigned on cleaning-only day', fieldAssigned.length === 0, `field workers: ${fieldAssigned.length}`);

  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  const marwa = workers['Sim Marwa'];
  await simulateCheckIn(marwa.id, DATE, '07:00');
  const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === marwa.id);
  for (const v of visits) {
    await simulateArrival(v.id, DATE, '07:20');
    await simulateCompletion(v.id, DATE, '10:00');
  }
  await simulateCheckOut(marwa.id, DATE, '15:00');

  await computeDailyAnalyticsForDate(DATE);
  const analytics = await getAnalyticsForDate(DATE);
  report.check('Analytics computed', analytics.length > 0, `rows: ${analytics.length}`);

  return plan;
}
