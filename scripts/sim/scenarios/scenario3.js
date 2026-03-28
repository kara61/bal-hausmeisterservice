import { pool } from '../../../src/db/pool.js';
import { generateDraftPlan, approvePlan, redistributeSickWorkers } from '../../../src/services/planGeneration.js';
import { createVisitsFromPlan } from '../../../src/services/accountabilityFlow.js';
import { computeDailyAnalyticsForDate } from '../../../src/services/analytics.js';
import { simulateCheckIn, simulateCheckOut, simulateArrival, simulateCompletion, getAssignmentsForPlan, getVisitsForPlan, getAnalyticsForDate } from '../helpers.js';

const DATE = '2026-02-04'; // Wednesday

export default async function scenario3(report, { workers }) {
  report.startScenario('Scenario 3: Sick Call + Redistribution (Wed Feb 4)');

  const plan = await generateDraftPlan(DATE);
  report.check('Plan generated for Wed Feb 4', plan && plan.id);

  const assignmentsBefore = await getAssignmentsForPlan(plan.id);
  report.check('Plan has assignment(s)', assignmentsBefore.length > 0, `count: ${assignmentsBefore.length}`);

  const fieldAssignment = assignmentsBefore.find(a => a.property_address === 'Simstraße 4');
  const sickWorkerName = fieldAssignment?.worker_name;
  const sickWorkerId = fieldAssignment?.worker_id;
  report.check('Field worker assigned to Simstraße 4', !!sickWorkerName, `worker: ${sickWorkerName}`);

  await approvePlan(plan.id, 'halil');

  await pool.query(
    `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
     VALUES ($1, $2, 1, 'pending')`,
    [sickWorkerId, DATE]
  );
  report.check(`${sickWorkerName} reported sick`, true);

  const result = await redistributeSickWorkers(DATE);
  report.check('Redistribution ran', result.reassigned >= 0, `reassigned: ${result.reassigned}`);

  const assignmentsAfter = await getAssignmentsForPlan(plan.id);
  const reassigned = assignmentsAfter.find(a => a.property_address === 'Simstraße 4');
  report.check(
    'Simstraße 4 reassigned to different worker',
    reassigned && reassigned.worker_id !== sickWorkerId,
    `now: ${reassigned?.worker_name} (was: ${sickWorkerName})`
  );
  report.check(
    'Source changed to substitution',
    reassigned?.source === 'substitution',
    `source: ${reassigned?.source}`
  );

  if (reassigned) {
    await createVisitsFromPlan(plan.id);
    await simulateCheckIn(reassigned.worker_id, DATE, '07:00');
    const visits = (await getVisitsForPlan(plan.id)).filter(v => v.worker_id === reassigned.worker_id);
    for (const v of visits) {
      await simulateArrival(v.id, DATE, '07:30');
      await simulateCompletion(v.id, DATE, '10:00');
    }
    await simulateCheckOut(reassigned.worker_id, DATE, '15:00');
  }

  const { rows: sickEntries } = await pool.query(
    `SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2`,
    [sickWorkerId, DATE]
  );
  report.check(`${sickWorkerName} has no time entry (was sick)`, sickEntries.length === 0, `entries: ${sickEntries.length}`);

  await computeDailyAnalyticsForDate(DATE);

  return plan;
}
