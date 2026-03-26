import { pool } from '../db/pool.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export async function sendPlanAssignments(planId) {
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

  const { rows: [plan] } = await pool.query(
    'SELECT plan_date FROM daily_plans WHERE id = $1',
    [planId]
  );
  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const dayLabel = `${DAY_NAMES[weekday]}, ${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;

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
    const lines = worker.properties.map((p, i) =>
      `${i + 1}. ${p.address}, ${p.city} — ${p.standard_tasks}`
    );
    const message = `Deine Aufgaben fuer heute (${dayLabel}):\n\n${lines.join('\n')}\n\nDruecke "Einchecken" wenn du loslegst.`;

    await sendWhatsAppMessage(worker.phone, message);
    sent++;
  }

  return { sent };
}

export async function notifyHalilPlanGaps(planId) {
  const { rows: [plan] } = await pool.query(
    'SELECT * FROM daily_plans WHERE id = $1',
    [planId]
  );
  if (!plan) return;

  const dateStr = plan.plan_date instanceof Date
    ? plan.plan_date.toISOString().split('T')[0]
    : plan.plan_date;
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  const assignedPropertyIds = (await pool.query(
    'SELECT property_id FROM plan_assignments WHERE daily_plan_id = $1',
    [planId]
  )).rows.map(r => r.property_id);

  const { rows: unassigned } = await pool.query(
    `SELECT address, city FROM properties
     WHERE assigned_weekday = $1 AND is_active = true
       AND id != ALL($2::int[])`,
    [weekday, assignedPropertyIds.length > 0 ? assignedPropertyIds : [0]]
  );

  if (unassigned.length > 0) {
    const list = unassigned.map(p => `- ${p.address}, ${p.city}`).join('\n');
    await sendWhatsAppMessage(
      config.halilWhatsappNumber,
      `Tagesplan ${dateStr}: ${unassigned.length} Objekte ohne Zuordnung:\n${list}\n\nBitte im Dashboard zuweisen.`
    );
  }
}
