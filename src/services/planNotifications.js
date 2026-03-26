import { pool } from '../db/pool.js';
import { sendWhatsAppMessage, sendWhatsAppButtons } from './whatsapp.js';
import { config } from '../config.js';
import { createVisitsFromPlan } from './accountabilityFlow.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return `${DAY_NAMES[weekday]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

function formatAssignmentLine(index, assignment) {
  return `${index}. ${assignment.address}, ${assignment.city} — ${assignment.standard_tasks}`;
}

export async function sendPlanAssignments(planId) {
  // Include original_worker_name for substitutions via a self-join trick:
  // When source='substitution', we look up who had this assignment before via sick_leave
  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city, p.standard_tasks
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  if (assignments.length === 0) return { sent: 0 };

  // For substitution assignments, find original worker names from sick_leave
  const { rows: [plan] } = await pool.query(
    'SELECT plan_date FROM daily_plans WHERE id = $1',
    [planId]
  );
  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;

  const dayLabel = formatDateLabel(dateStr);

  // Create property visits for the accountability flow
  await createVisitsFromPlan(planId);

  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_id)) {
      byWorker.set(a.worker_id, {
        phone: a.worker_phone,
        name: a.worker_name,
        properties: [],
      });
    }
    byWorker.get(a.worker_id).properties.push(a);
  }

  let sent = 0;
  for (const [, worker] of byWorker) {
    const lines = worker.properties.map((p, i) => formatAssignmentLine(i + 1, p));
    const message = `Deine Aufgaben fuer heute (${dayLabel}):\n\n${lines.join('\n')}\n\nDruecke "Einchecken" wenn du loslegst.`;

    await sendWhatsAppButtons(worker.phone, message, [{ id: 'einchecken', title: 'Einchecken' }]);
    sent++;
  }

  return { sent };
}

export async function notifyHalilPlanReady(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return;

  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;

  // Get assignments grouped by worker
  const { rows: assignments } = await pool.query(
    `SELECT pa.worker_id, w.name AS worker_name, p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY w.name, pa.assignment_order`,
    [planId]
  );

  // Check for unassigned properties
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const assignedPropertyIds = assignments.map(a => a.property_id || 0);

  const { rows: unassigned } = await pool.query(
    `SELECT address, city FROM properties
     WHERE assigned_weekday = $1 AND is_active = true
       AND id != ALL($2::int[])`,
    [weekday, assignedPropertyIds.length > 0 ? [...new Set(assignments.map(a => a.property_id || 0))] : [0]]
  );

  // Build plan summary message
  const dayLabel = formatDateLabel(dateStr);
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_name)) byWorker.set(a.worker_name, []);
    byWorker.get(a.worker_name).push(`${a.address}, ${a.city}`);
  }

  let msg = `Tagesplan fuer ${dayLabel}:\n\n`;
  for (const [name, props] of byWorker) {
    msg += `${name}:\n${props.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n\n`;
  }

  if (unassigned.length > 0) {
    msg += `⚠ ${unassigned.length} Objekte ohne Zuordnung:\n`;
    msg += unassigned.map(p => `  - ${p.address}, ${p.city}`).join('\n');
    msg += '\n\n';
  }

  msg += `${assignments.length} Aufgaben, ${byWorker.size} Mitarbeiter`;

  await sendWhatsAppButtons(
    config.halilWhatsappNumber,
    msg,
    [
      { id: `plan_approve_${planId}`, title: 'Genehmigen' },
      { id: `plan_edit_${planId}`, title: 'Bearbeiten' },
    ]
  );
}

/**
 * Send immediate notification to workers who received extra properties
 * due to a sick worker redistribution.
 */
export async function notifyWorkersOfRedistribution(details) {
  // Group by new worker
  const byWorker = new Map();
  for (const d of details) {
    if (!byWorker.has(d.newWorkerId)) {
      byWorker.set(d.newWorkerId, { phone: d.newWorkerPhone, name: d.newWorkerName, properties: [] });
    }
  }

  // Fetch property details for each reassignment
  for (const d of details) {
    const { rows: [prop] } = await pool.query(
      'SELECT address, city, standard_tasks FROM properties WHERE id = $1',
      [d.propertyId]
    );
    if (prop) {
      byWorker.get(d.newWorkerId).properties.push(prop);
    }
  }

  for (const [, worker] of byWorker) {
    const lines = worker.properties.map((p, i) =>
      `${i + 1}. ${p.address}, ${p.city} — ${p.standard_tasks}`
    );
    const msg = `Zusaetzliche Aufgaben fuer heute:\n\n${lines.join('\n')}\n\nDruecke "Angekommen" wenn du vor Ort bist.`;

    await sendWhatsAppButtons(worker.phone, msg, [{ id: 'angekommen', title: 'Angekommen' }]);
  }
}
