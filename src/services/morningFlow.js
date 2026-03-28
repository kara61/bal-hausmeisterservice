import { pool } from '../db/pool.js';
import { sendWhatsAppMessage, sendWhatsAppButtons } from './whatsapp.js';
import { config } from '../config.js';
import { createVisitsFromPlan } from './accountabilityFlow.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const MORNING_BUTTONS = [
  { id: 'alles_klar', title: 'Alles klar' },
  { id: 'kann_heute_nicht', title: 'Kann heute nicht' },
];

const CHECKIN_BUTTONS = [
  { id: 'einchecken', title: 'Einchecken' },
];

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return `${DAY_NAMES[weekday]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
}

/**
 * Send morning assignments to all workers with an approved plan for the given date.
 * Called by the 05:30 morning cron.
 * Creates property_visits if not already created.
 */
export async function sendMorningAssignments(dateStr) {
  const { rows: plans } = await pool.query(
    `SELECT id FROM daily_plans WHERE plan_date = $1 AND status = 'approved'`,
    [dateStr]
  );
  if (plans.length === 0) {
    const { rows: activeWorkers } = await pool.query(
      `SELECT phone_number FROM workers WHERE is_active = true AND worker_role IN ('field', 'cleaning')`
    );
    for (const w of activeWorkers) {
      await sendWhatsAppMessage(w.phone_number, 'Kein Plan fuer heute. Bitte Halil kontaktieren.');
    }
    return { sent: 0, noPlan: true };
  }

  const planId = plans[0].id;

  await createVisitsFromPlan(planId);

  const { rows: assignments } = await pool.query(
    `SELECT pa.*, w.name AS worker_name, w.phone_number AS worker_phone,
            p.address, p.city
     FROM plan_assignments pa
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE pa.daily_plan_id = $1
     ORDER BY pa.worker_id, pa.assignment_order`,
    [planId]
  );

  if (assignments.length === 0) return { sent: 0 };

  const dayLabel = formatDateLabel(dateStr);

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
      const taskList = prop.tasks.filter(Boolean).join(', ');
      lines.push(`${i}. ${prop.address}, ${prop.city}${taskList ? ' — ' + taskList : ''}`);
      i++;
    }

    const message = `Guten Morgen! Deine Objekte heute (${dayLabel}):\n${lines.join('\n')}\n\nAlles klar?`;
    await sendWhatsAppButtons(worker.phone, message, MORNING_BUTTONS);
    sent++;
  }

  return { sent };
}

/**
 * Send reminders to workers who haven't acknowledged their morning message.
 * Called by the 06:45 morning-remind cron.
 */
export async function sendMorningReminders(dateStr) {
  const { rows: assignedWorkers } = await pool.query(
    `SELECT DISTINCT w.id, w.name, w.phone_number
     FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     JOIN workers w ON w.id = pa.worker_id
     WHERE dp.plan_date = $1 AND dp.status = 'approved'`,
    [dateStr]
  );

  let reminded = 0;
  let halilAlerted = 0;
  const unresponsive = [];

  for (const worker of assignedWorkers) {
    const { rows } = await pool.query(
      `SELECT state FROM conversation_state WHERE phone_number = $1`,
      [worker.phone_number]
    );
    const state = rows[0]?.state;

    if (!state) {
      await sendWhatsAppButtons(
        worker.phone_number,
        'Hast du die Nachricht gesehen?',
        MORNING_BUTTONS
      );
      unresponsive.push(worker.name);
      reminded++;
    }
  }

  if (unresponsive.length > 0) {
    const names = unresponsive.join(', ');
    await sendWhatsAppMessage(
      config.halilWhatsappNumber,
      `⚠ ${unresponsive.length} Mitarbeiter nicht reagiert: ${names}`
    );
    halilAlerted = unresponsive.length;
  }

  return { reminded, halilAlerted };
}

/**
 * Send check-in reminders to workers who acknowledged but haven't checked in.
 * Called by the 07:30 checkin-remind cron.
 */
export async function sendCheckinReminders(dateStr) {
  const { rows: assignedWorkers } = await pool.query(
    `SELECT DISTINCT w.id, w.name, w.phone_number
     FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     JOIN workers w ON w.id = pa.worker_id
     WHERE dp.plan_date = $1 AND dp.status = 'approved'`,
    [dateStr]
  );

  let reminded = 0;
  const notCheckedIn = [];

  for (const worker of assignedWorkers) {
    const { rows } = await pool.query(
      `SELECT state FROM conversation_state WHERE phone_number = $1`,
      [worker.phone_number]
    );
    const state = rows[0]?.state;

    if (state === 'acknowledged') {
      await sendWhatsAppButtons(
        worker.phone_number,
        'Du bist noch nicht eingecheckt. Alles ok?',
        CHECKIN_BUTTONS
      );
      notCheckedIn.push(worker.name);
      reminded++;
    }
  }

  if (notCheckedIn.length > 0) {
    await sendWhatsAppMessage(
      config.halilWhatsappNumber,
      `⚠ ${notCheckedIn.length} bestaetigt aber nicht eingecheckt: ${notCheckedIn.join(', ')}`
    );
  }

  return { reminded };
}
