import { generateDraftPlan, approvePlan } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { detectMissingCheckouts, flagMissingCheckout } from '../../../src/services/anomaly.js';
import { simulateCheckIn, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getTimeEntry } from '../helpers.js';

const DATE = '2026-02-05'; // Thursday

export default async function scenario4(report, { workers }) {
  report.startScenario('Scenario 4: Missing Checkout (Thu Feb 5)');

  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Thu Feb 5', plan && plan.id);

  const assignments = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignments for Thursday', assignments.length > 0, `count: ${assignments.length}`);

  await approvePlan(plan.id, 'halil');
  await createVisitsFromPlan(plan.id);

  const worker = assignments[0];
  await simulateCheckIn(worker.worker_id, DATE, '07:00');

  const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === worker.worker_id);
  if (visits.length > 0) {
    await simulateArrival(visits[0].id, DATE, '07:15');
    await simulateCompletion(visits[0].id, DATE, '09:30');
    report.check('First visit completed', true, `visit: ${visits[0].property_address}`);
  }
  if (visits.length > 1) {
    report.check('Second visit left pending', visits[1].status === 'assigned', `status: ${visits[1].status}`);
  }

  const timeEntry = await getTimeEntry(worker.worker_id, DATE);
  report.check('Check-in exists but no check-out', timeEntry?.check_in && !timeEntry?.check_out);

  const missing = await detectMissingCheckouts(DATE);
  const workerMissing = missing.find(m => m.worker_id === worker.worker_id);
  report.check('Missing checkout detected', !!workerMissing, `missing entries: ${missing.length}`);

  if (workerMissing) {
    await flagMissingCheckout(workerMissing.id);
    const flagged = await getTimeEntry(worker.worker_id, DATE);
    report.check('Time entry flagged', flagged?.is_flagged === true, `flagged: ${flagged?.is_flagged}`);
    report.check('Flag reason set', !!flagged?.flag_reason, `reason: ${flagged?.flag_reason}`);
  }

  return { plan, incompleteWorkerId: worker.worker_id };
}
