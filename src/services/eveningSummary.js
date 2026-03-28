import { pool } from '../db/pool.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export async function buildDaySummary(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  const dayLabel = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')} (${DAY_NAMES[weekday]})`;

  const { rows: workerStats } = await pool.query(
    `SELECT w.id, w.name,
            COUNT(pv.id)::int AS total_visits,
            COUNT(CASE WHEN pv.status = 'completed' THEN 1 END)::int AS completed_visits,
            COUNT(CASE WHEN pv.status = 'incomplete' THEN 1 END)::int AS incomplete_visits
     FROM workers w
     JOIN property_visits pv ON pv.worker_id = w.id AND pv.visit_date = $1
     GROUP BY w.id, w.name
     ORDER BY w.name`,
    [dateStr]
  );

  const { rows: timeEntries } = await pool.query(
    `SELECT te.worker_id, te.check_in, te.check_out
     FROM time_entries te WHERE te.date = $1`,
    [dateStr]
  );
  const timeMap = new Map(timeEntries.map(te => [te.worker_id, te]));

  const { rows: sickWorkers } = await pool.query(
    `SELECT sl.worker_id, w.name, sl.declared_days
     FROM sick_leave sl
     JOIN workers w ON w.id = sl.worker_id
     WHERE sl.start_date = $1`,
    [dateStr]
  );

  const { rows: incompleteDetails } = await pool.query(
    `SELECT pv.worker_id, p.address, pv.incomplete_reason
     FROM property_visits pv
     JOIN properties p ON p.id = pv.property_id
     WHERE pv.visit_date = $1 AND pv.status = 'incomplete'`,
    [dateStr]
  );
  const incompleteByWorker = new Map();
  for (const d of incompleteDetails) {
    if (!incompleteByWorker.has(d.worker_id)) incompleteByWorker.set(d.worker_id, []);
    incompleteByWorker.get(d.worker_id).push(d);
  }

  const { rows: missingPhotos } = await pool.query(
    `SELECT pv.worker_id, COUNT(*)::int AS cnt
     FROM property_visits pv
     JOIN plan_assignments pa ON pa.id = pv.plan_assignment_id
     LEFT JOIN property_visit_photos pvp ON pvp.property_visit_id = pv.id
     WHERE pv.visit_date = $1 AND pa.is_extra_work = true AND pv.status = 'completed' AND pvp.id IS NULL
     GROUP BY pv.worker_id`,
    [dateStr]
  );
  const missingPhotoMap = new Map(missingPhotos.map(mp => [mp.worker_id, mp.cnt]));

  let msg = `Tagesuebersicht ${dayLabel}:\n\n`;

  let totalAll = 0;
  let completedAll = 0;

  for (const ws of workerStats) {
    const te = timeMap.get(ws.id);
    const checkIn = te?.check_in ? new Date(te.check_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
    const checkOut = te?.check_out ? new Date(te.check_out).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';

    let hours = '';
    if (te?.check_in && te?.check_out) {
      const mins = Math.round((new Date(te.check_out) - new Date(te.check_in)) / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      hours = `${h}:${String(m).padStart(2, '0')}h`;
    }

    msg += `${ws.name}: ✓ ${ws.completed_visits}/${ws.total_visits} Objekte | ${checkIn}-${checkOut} (${hours})\n`;

    const incomp = incompleteByWorker.get(ws.id) || [];
    for (const d of incomp) {
      msg += `  ✗ ${d.address} → morgen (${d.incomplete_reason || '–'})\n`;
    }

    const missingCount = missingPhotoMap.get(ws.id) || 0;
    if (missingCount > 0) {
      msg += `  ⚠ ${missingCount} Sonderaufgaben ohne Foto\n`;
    }

    totalAll += ws.total_visits;
    completedAll += ws.completed_visits;
  }

  for (const sw of sickWorkers) {
    const dayText = sw.declared_days > 0 ? `${sw.declared_days} Tag${sw.declared_days > 1 ? 'e' : ''}` : 'unbestimmt';
    msg += `${sw.name}: ✗ krank (${dayText})\n`;
  }

  const pct = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;
  const postponed = totalAll - completedAll;
  msg += `\nGesamt: ${completedAll}/${totalAll} Aufgaben erledigt (${pct}%)`;
  if (postponed > 0) {
    msg += `\n${postponed} Aufgaben auf morgen verschoben`;
  }

  return msg;
}

export async function sendEveningSummary(dateStr) {
  const summary = await buildDaySummary(dateStr);
  await sendWhatsAppMessage(config.halilWhatsappNumber, summary);
  return { sent: true };
}
