import { pool } from '../db/pool.js';
import { sendWhatsAppMessage, sendWhatsAppButtons } from './whatsapp.js';
import { config } from '../config.js';
import { createVisitsFromPlan } from './accountabilityFlow.js';
import { getPlanWithAssignments } from './planGeneration.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return `${DAY_NAMES[weekday]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

function formatAssignmentLine(index, address, city, taskNames) {
  return `${index}. ${address}, ${city} — ${taskNames.join(', ')}`;
}

export async function sendPlanAssignments(planId) {
  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.property_id, pa.assignment_order`,
    [planId]
  );

  if (assignments.length === 0) return { sent: 0 };

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

  // Group by worker, then by property
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_id)) {
      byWorker.set(a.worker_id, { phone: a.worker_phone, name: a.worker_name, properties: new Map() });
    }
    const worker = byWorker.get(a.worker_id);
    if (!worker.properties.has(a.property_id)) {
      worker.properties.set(a.property_id, { address: a.address, city: a.city, tasks: [] });
    }
    worker.properties.get(a.property_id).tasks.push(a.task_name);
  }

  let sent = 0;
  for (const [, worker] of byWorker) {
    const lines = [];
    let i = 1;
    for (const [, prop] of worker.properties) {
      lines.push(formatAssignmentLine(i, prop.address, prop.city, prop.tasks));
      i++;
    }
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

  const { rows: assignments } = await pool.query(
    `SELECT pa.worker_id, w.name AS worker_name, p.address, p.city, pa.task_name
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY w.name, pa.assignment_order`,
    [planId]
  );

  // Group by worker, count tasks
  const byWorker = new Map();
  for (const a of assignments) {
    if (!byWorker.has(a.worker_name)) {
      byWorker.set(a.worker_name, { properties: new Set(), taskCount: 0 });
    }
    const w = byWorker.get(a.worker_name);
    w.properties.add(`${a.address}, ${a.city}`);
    w.taskCount++;
  }

  // Get unassigned from plan
  const full = await getPlanWithAssignments(planId);
  const unassigned = full.unassigned_properties || [];

  const dayLabel = formatDateLabel(dateStr);
  let msg = `Tagesplan fuer ${dayLabel}:\n\n`;
  for (const [name, data] of byWorker) {
    const propList = [...data.properties].join(', ');
    msg += `${name}: ${propList} (${data.taskCount} Aufgaben)\n`;
  }

  if (unassigned.length > 0) {
    msg += `\n⚠ ${unassigned.length} Objekte ohne Zuordnung:\n`;
    msg += unassigned.map(p => `  - ${p.address}, ${p.city}`).join('\n');
    msg += '\n';
  }

  msg += `\n${assignments.length} Aufgaben, ${byWorker.size} Mitarbeiter`;

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
  const byWorker = new Map();
  for (const d of details) {
    if (!byWorker.has(d.newWorkerId)) {
      byWorker.set(d.newWorkerId, { phone: d.newWorkerPhone, name: d.newWorkerName, properties: new Map() });
    }
  }

  for (const d of details) {
    const { rows: [prop] } = await pool.query(
      'SELECT address, city FROM properties WHERE id = $1',
      [d.propertyId]
    );
    if (!prop) continue;

    const worker = byWorker.get(d.newWorkerId);
    if (!worker.properties.has(d.propertyId)) {
      worker.properties.set(d.propertyId, { address: prop.address, city: prop.city, tasks: [] });
    }
    // Get task names for this property from the current assignment
    const { rows: tasks } = await pool.query(
      `SELECT task_name FROM plan_assignments
       WHERE property_id = $1 AND worker_id = $2
       AND daily_plan_id = (SELECT id FROM daily_plans WHERE plan_date = CURRENT_DATE LIMIT 1)`,
      [d.propertyId, d.newWorkerId]
    );
    for (const t of tasks) {
      worker.properties.get(d.propertyId).tasks.push(t.task_name);
    }
  }

  for (const [, worker] of byWorker) {
    const lines = [];
    let i = 1;
    for (const [, prop] of worker.properties) {
      const taskList = prop.tasks.length > 0 ? prop.tasks.join(', ') : 'Alle Aufgaben';
      lines.push(`${i}. ${prop.address}, ${prop.city} — ${taskList}`);
      i++;
    }
    const msg = `Zusaetzliche Aufgaben fuer heute:\n\n${lines.join('\n')}\n\nDruecke "Angekommen" wenn du vor Ort bist.`;
    await sendWhatsAppButtons(worker.phone, msg, [{ id: 'angekommen', title: 'Angekommen' }]);
  }
}
