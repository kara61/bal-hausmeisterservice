import { generateDraftPlan, approvePlan, getPlanWithAssignments } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getTimeEntry, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-02'; // Monday

export default async function scenario1(report, { workers }) {
  report.startScenario('Scenario 1: Normal Day (Mon Feb 2)');

  // Step 1: Generate plan
  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for 2026-02-02', plan && plan.id, `plan_id: ${plan?.id}`);
  report.check('Plan status is draft', plan?.status === 'draft', `status: ${plan?.status}`);

  // Step 2: Check assignments — Monday properties: Simstraße 1, Simstraße 2 (both field)
  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has 2 assignments (Mon has 2 properties)', assignments.length === 2, `got: ${assignments.length}`);

  const fieldAssignments = assignments.filter(a => a.worker_name?.startsWith('Sim'));
  report.check('Assignments given to sim workers', fieldAssignments.length === 2, `sim workers: ${fieldAssignments.length}`);

  // Step 3: Approve plan
  await approvePlan(plan.id, 'halil');
  const approved = await getPlanWithAssignments(plan.id);
  report.check('Plan approved', approved.status === 'approved', `status: ${approved.status}`);

  // Step 4: Create visits
  const visits = await createVisitsFromPlan(plan.id);
  report.check('Property visits created', visits.length >= 2, `visits: ${visits.length}`);

  // Step 5: Simulate worker day — use first assignment's worker
  const worker = workers['Sim Ali'];
  const workerAssignments = assignments.filter(a => a.worker_id === worker.id);

  if (workerAssignments.length > 0) {
    // Check in
    const timeEntry = await simulateCheckIn(worker.id, DATE, '07:00');
    report.check('Sim Ali checked in at 07:00', timeEntry && timeEntry.check_in, `entry_id: ${timeEntry?.id}`);

    // Visit each assignment
    const workerVisits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.id);
    for (let i = 0; i < workerVisits.length; i++) {
      const v = workerVisits[i];
      const arriveTime = `07:${15 + i * 60}`;
      const completeTime = `${8 + i}:${45 + i * 10}`;
      await simulateArrival(v.id, DATE, arriveTime);
      await simulateCompletion(v.id, DATE, completeTime);
    }

    const completedVisits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.id && v.status === 'completed');
    report.check('All visits completed', completedVisits.length === workerVisits.length, `completed: ${completedVisits.length}/${workerVisits.length}`);

    // Check out
    await simulateCheckOut(worker.id, DATE, '15:00');
    const finalEntry = await getTimeEntry(worker.id, DATE);
    report.check('Sim Ali checked out at 15:00', finalEntry?.check_out, `check_out: ${finalEntry?.check_out}`);
  } else {
    report.check('Sim Ali has assignments', false, 'No assignments found for Sim Ali');
  }

  // Step 6: Also simulate second worker if they have assignments
  for (const a of assignments) {
    if (a.worker_id !== worker.id) {
      await simulateCheckIn(a.worker_id, DATE, '07:00');
      const v = (await getVisitsForPlan(plan.id)).find(v => v.worker_id === a.worker_id);
      if (v) {
        await simulateArrival(v.id, DATE, '07:30');
        await simulateCompletion(v.id, DATE, '09:00');
      }
      await simulateCheckOut(a.worker_id, DATE, '15:00');
    }
  }

  // Step 7: Analytics
  await computeDailyAnalyticsForDate(DATE);
  const analytics = await getAnalyticsForDate(DATE);
  report.check('Analytics computed for Feb 2', analytics.length > 0, `rows: ${analytics.length}`);

  const aliAnalytics = analytics.find(a => a.worker_name === 'Sim Ali');
  if (aliAnalytics) {
    report.check('Analytics: properties completed > 0', aliAnalytics.properties_completed > 0, `completed: ${aliAnalytics.properties_completed}`);
  }

  return plan;
}
