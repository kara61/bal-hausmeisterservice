import { pool } from '../db/pool.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { notifyHalilPostponedTask } from './taskNotifications.js';
import { savePhotoFromTwilio } from './photoStorage.js';
import { postponeTask } from './taskScheduling.js';
import {
  formatPropertyPrompt,
  formatDaySummary,
  getWorkerFlowState,
  markArrived,
  markCompleted,
  saveVisitPhoto,
} from './accountabilityFlow.js';
import { approvePlan, redistributeSickWorkers } from './planGeneration.js';
import { notifyWorkersOfRedistribution } from './planNotifications.js';
import { config } from '../config.js';

// --- Conversation state helpers (DB-backed) ---

async function getState(phone) {
  const { rows } = await pool.query(
    'SELECT state FROM conversation_state WHERE phone_number = $1',
    [phone]
  );
  return rows[0]?.state || null;
}

async function setState(phone, state) {
  await pool.query(
    `INSERT INTO conversation_state (phone_number, state, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone_number) DO UPDATE SET state = $2, updated_at = NOW()`,
    [phone, state]
  );
}

async function clearState(phone) {
  await pool.query(
    'DELETE FROM conversation_state WHERE phone_number = $1',
    [phone]
  );
}

// --- Button definitions ---

const MAIN_MENU_BUTTONS = [
  { id: 'einchecken', title: 'Einchecken' },
  { id: 'auschecken', title: 'Auschecken' },
  { id: 'krank_melden', title: 'Krank melden' },
];

const TASK_BUTTONS = [
  { id: 'erledigt', title: 'Erledigt' },
  { id: 'nicht_moeglich', title: 'Nicht moeglich' },
  { id: 'auschecken', title: 'Auschecken' },
];

const SICK_DAY_BUTTONS = [
  { id: 'sick_1', title: '1 Tag' },
  { id: 'sick_2', title: '2 Tage' },
  { id: 'sick_3', title: '3+ Tage' },
];

const POSTPONE_BUTTONS = [
  { id: 'postpone_zugang', title: 'Kein Zugang' },
  { id: 'postpone_material', title: 'Material fehlt' },
  { id: 'postpone_sonstiges', title: 'Sonstiges' },
];

const PHOTO_BUTTONS = [
  { id: 'weiter', title: 'Weiter' },
];

const ARRIVAL_BUTTONS = [
  { id: 'angekommen', title: 'Angekommen' },
];

const COMPLETION_BUTTONS = [
  { id: 'fertig', title: 'Fertig' },
];

// --- Main handler ---

export async function handleIncomingMessage(phoneNumber, messageBody, media = {}) {
  const phone = phoneNumber.replace('whatsapp:', '');

  const workerResult = await pool.query(
    'SELECT * FROM workers WHERE phone_number = $1 AND is_active = true',
    [phone]
  );

  if (workerResult.rows.length === 0) {
    return {
      type: 'unregistered',
      response: 'Diese Nummer ist nicht registriert. Bitte kontaktiere Halil.',
    };
  }

  const worker = workerResult.rows[0];
  const text = messageBody.trim();

  const state = await getState(phone);
  if (state === 'awaiting_sick_days') {
    return handleSickDayCount(worker, text);
  }

  // Handle photo state
  if (state && state.startsWith('awaiting_photo_')) {
    const taskId = parseInt(state.replace('awaiting_photo_', ''), 10);
    await clearState(phone);

    if (media && media.numMedia > 0 && media.mediaUrl) {
      const photoUrl = await savePhotoFromTwilio(media.mediaUrl, media.mediaContentType);
      await pool.query(
        'UPDATE task_assignments SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [photoUrl, taskId]
      );
      return {
        type: 'photo_saved',
        response: 'Foto gespeichert!',
        buttons: TASK_BUTTONS,
      };
    }

    if (text.toLowerCase() === 'weiter') {
      return {
        type: 'photo_skipped',
        response: 'OK, weiter gehts!',
        buttons: TASK_BUTTONS,
      };
    }

    return {
      type: 'photo_skipped',
      response: 'Kein Foto erkannt. Weiter gehts!',
      buttons: TASK_BUTTONS,
    };
  }

  // Handle postpone reason state
  if (state && state.startsWith('awaiting_postpone_reason_')) {
    return handlePostponeReason(worker, text);
  }

  // Handle accountability flow: at property (waiting for photo or "fertig")
  if (state && state.startsWith('at_property_')) {
    const visitId = parseInt(state.replace('at_property_', ''), 10);

    // Worker sent a photo while at property
    if (media && media.numMedia > 0 && media.mediaUrl) {
      await saveVisitPhoto(visitId, media.mediaUrl, media.mediaContentType);
      return {
        type: 'visit_photo_saved',
        response: 'Foto gespeichert! Druecke "Fertig" wenn du fertig bist.',
        buttons: COMPLETION_BUTTONS,
      };
    }

    // Worker pressed "fertig"
    if (text.toLowerCase() === 'fertig') {
      await clearState(phone);
      const visit = await markCompleted(visitId);

      const today = new Date().toISOString().split('T')[0];
      const flowState = await getWorkerFlowState(worker.id, today);

      if (flowState.allDone) {
        // All properties done — show day summary
        const summaryVisits = flowState.visits.map(v => ({
          address: v.address,
          arrived_at: v.arrived_at,
          completed_at: v.completed_at,
          hasPhoto: v.photo_count > 0,
        }));
        return {
          type: 'day_complete',
          response: formatDaySummary(summaryVisits),
          buttons: [{ id: 'auschecken', title: 'Auschecken' }],
        };
      }

      // More properties — show next one
      const next = flowState.nextVisit;
      return {
        type: 'visit_completed',
        response: `✅ ${visit.address || 'Objekt'} abgeschlossen!\n\nWeiter zu:\n${formatPropertyPrompt({ address: next.address, city: next.city, standardTasks: next.standard_tasks })}`,
        buttons: ARRIVAL_BUTTONS,
      };
    }

    // Unrecognized input while at property
    return {
      type: 'at_property_prompt',
      response: 'Sende ein Foto oder druecke "Fertig" wenn du fertig bist.',
      buttons: COMPLETION_BUTTONS,
    };
  }

  // Normalize command — handle both typed text and button IDs
  const command = text.toLowerCase().replace(/\s+/g, '_');

  if (command === 'einchecken') {
    return handleCheckIn(worker);
  }

  if (command === 'angekommen') {
    return handleAngekommen(worker);
  }

  if (command === 'fertig') {
    // If not in at_property state but pressed fertig, treat as no-op
    return {
      type: 'no_active_visit',
      response: 'Kein aktives Objekt. Druecke "Angekommen" wenn du vor Ort bist.',
      buttons: ARRIVAL_BUTTONS,
    };
  }

  if (command === 'auschecken') {
    return handleCheckOut(worker);
  }

  if (command === 'krank_melden' || command === 'krank melden') {
    await setState(phone, 'awaiting_sick_days');
    return {
      type: 'sick_prompt',
      response: 'Wie viele Tage wirst du krank sein?',
      buttons: SICK_DAY_BUTTONS,
    };
  }

  if (command === 'erledigt') {
    return handleErledigt(worker);
  }

  if (command === 'nicht_moeglich' || command === 'nicht moeglich') {
    return handleNichtMoeglich(worker);
  }

  // Postpone reason button IDs
  if (command.startsWith('postpone_')) {
    const stateKey = await getState(phone);
    if (stateKey && stateKey.startsWith('awaiting_postpone_reason_')) {
      const reasons = {
        postpone_zugang: 'Zugang nicht moeglich',
        postpone_material: 'Material fehlt',
        postpone_sonstiges: 'Sonstiges',
      };
      return handlePostponeReason(worker, reasons[command] || text);
    }
  }

  // Sick day button IDs
  if (command.startsWith('sick_')) {
    const stateKey = await getState(phone);
    if (stateKey === 'awaiting_sick_days') {
      const dayMap = { sick_1: '1', sick_2: '2', sick_3: 'mehr' };
      return handleSickDayCount(worker, dayMap[command] || text);
    }
  }

  // Plan approval/edit from Halil (button IDs: plan_approve_X, plan_edit_X)
  if (command.startsWith('plan_approve_') && phone === config.halilWhatsappNumber?.replace('whatsapp:', '')) {
    const planId = parseInt(command.replace('plan_approve_', ''), 10);
    try {
      await approvePlan(planId, 'halil_whatsapp');
      return { type: 'plan_approved', response: 'Tagesplan genehmigt! Wird morgen um 05:00 an die Mitarbeiter gesendet.' };
    } catch (err) {
      return { type: 'plan_error', response: `Fehler: ${err.message}` };
    }
  }

  if (command.startsWith('plan_edit_') && phone === config.halilWhatsappNumber?.replace('whatsapp:', '')) {
    return { type: 'plan_edit', response: 'Oeffne das Dashboard um den Plan zu bearbeiten:\nhttps://bal-hausmeisterservice.vercel.app/daily-plan' };
  }

  // Default: show main menu with buttons
  const firstName = worker.name.split(' ')[0];
  return {
    type: 'menu',
    response: `Hallo ${firstName}! Was moechtest du tun?`,
    buttons: MAIN_MENU_BUTTONS,
  };
}

async function handleCheckIn(worker) {
  const today = new Date().toISOString().split('T')[0];

  const existing = await pool.query(
    'SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  if (existing.rows.length > 0 && existing.rows[0].check_in) {
    const checkInTime = new Date(existing.rows[0].check_in).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    return {
      type: 'already_checked_in',
      response: `Du bist bereits eingecheckt seit ${checkInTime}.`,
      buttons: TASK_BUTTONS,
    };
  }

  const now = new Date();
  await pool.query(
    `INSERT INTO time_entries (worker_id, date, check_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, date) DO UPDATE SET check_in = $3, updated_at = NOW()`,
    [worker.id, today, now]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // Check if worker has accountability visits for today
  const flowState = await getWorkerFlowState(worker.id, today);
  if (flowState.nextVisit) {
    const next = flowState.nextVisit;
    return {
      type: 'checkin_with_flow',
      response: `✅ Eingecheckt um ${timeStr}\n\nDeine erste Aufgabe:\n${formatPropertyPrompt({ address: next.address, city: next.city, standardTasks: next.standard_tasks })}`,
      buttons: ARRIVAL_BUTTONS,
    };
  }

  return {
    type: 'checkin',
    response: `Eingecheckt um ${timeStr}. Guten Arbeitstag!`,
    buttons: TASK_BUTTONS,
  };
}

async function handleCheckOut(worker) {
  const today = new Date().toISOString().split('T')[0];

  const existing = await pool.query(
    'SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  if (existing.rows.length === 0 || !existing.rows[0].check_in) {
    return {
      type: 'not_checked_in',
      response: 'Du bist heute nicht eingecheckt.',
      buttons: MAIN_MENU_BUTTONS,
    };
  }

  if (existing.rows[0].check_out) {
    return {
      type: 'already_checked_out',
      response: 'Du bist heute bereits ausgecheckt.',
    };
  }

  const now = new Date();
  await pool.query(
    'UPDATE time_entries SET check_out = $1, updated_at = NOW() WHERE id = $2',
    [now, existing.rows[0].id]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return {
    type: 'checkout',
    response: `Ausgecheckt um ${timeStr}. Bis morgen!`,
  };
}

async function handleErledigt(worker) {
  const today = new Date().toISOString().split('T')[0];

  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Keine offenen Aufgaben fuer heute.',
      buttons: [
        { id: 'auschecken', title: 'Auschecken' },
      ],
    };
  }

  const task = taskResult.rows[0];

  await pool.query(
    `UPDATE task_assignments SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [task.id]
  );

  await setState(worker.phone_number, `awaiting_photo_${task.id}`);

  return {
    type: 'task_done',
    response: `${task.address}, ${task.city} erledigt!\nBitte sende ein Foto oder druecke Weiter.`,
    buttons: PHOTO_BUTTONS,
  };
}

async function handleNichtMoeglich(worker) {
  const today = new Date().toISOString().split('T')[0];

  const taskResult = await pool.query(
    `SELECT ta.id, ta.task_description, p.address, p.city
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     JOIN teams t ON t.id = ta.team_id
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.worker_id = $1 AND ta.date = $2 AND ta.status IN ('pending', 'in_progress')
     ORDER BY CASE ta.status WHEN 'in_progress' THEN 0 ELSE 1 END, ta.created_at
     LIMIT 1`,
    [worker.id, today]
  );

  if (taskResult.rows.length === 0) {
    return {
      type: 'no_tasks',
      response: 'Keine offenen Aufgaben fuer heute.',
      buttons: [
        { id: 'auschecken', title: 'Auschecken' },
      ],
    };
  }

  const task = taskResult.rows[0];
  await setState(worker.phone_number, `awaiting_postpone_reason_${task.id}`);

  return {
    type: 'postpone_prompt',
    response: `Warum kann ${task.address} nicht erledigt werden?`,
    buttons: POSTPONE_BUTTONS,
  };
}

async function handlePostponeReason(worker, reasonText) {
  const stateKey = await getState(worker.phone_number);
  const taskId = parseInt(stateKey.replace('awaiting_postpone_reason_', ''), 10);
  await clearState(worker.phone_number);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const task = await postponeTask(taskId, reasonText, tomorrowStr);
  await notifyHalilPostponedTask(task, reasonText);

  return {
    type: 'postponed',
    response: 'Aufgabe verschoben. Halil wird benachrichtigt.',
    buttons: TASK_BUTTONS,
  };
}

async function handleSickDayCount(worker, text) {
  await clearState(worker.phone_number);

  let days;
  const command = text.toLowerCase();
  if (command === 'mehr' || command === '3+_tage' || command === 'sick_3') {
    days = null;
  } else {
    // Handle button IDs like "1_tag", "2_tage"
    const cleaned = command.replace(/_?tage?/, '').replace('sick_', '').trim();
    days = parseInt(cleaned, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      return {
        type: 'sick_prompt',
        response: 'Bitte waehle eine Option:',
        buttons: SICK_DAY_BUTTONS,
      };
    }
  }

  const today = new Date().toISOString().split('T')[0];

  await pool.query(
    `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
     VALUES ($1, $2, $3, 'pending')`,
    [worker.id, today, days || 0]
  );

  await notifyHalilSickDeclaration(worker.name, days);

  // Immediately redistribute this worker's properties to other workers
  const redistribution = await redistributeSickWorkers(today);
  if (redistribution.details && redistribution.details.length > 0) {
    // Update property_visits to reflect new worker assignments
    for (const d of redistribution.details) {
      await pool.query(
        `UPDATE property_visits SET worker_id = $1
         WHERE plan_assignment_id = $2 AND status = 'assigned'`,
        [d.newWorkerId, d.assignmentId]
      );
    }
    // Notify workers who received extra properties
    await notifyWorkersOfRedistribution(redistribution.details, worker.name);
  }

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return {
    type: 'sick_recorded',
    response: `Krankmeldung fuer ${dayText} erfasst. Gute Besserung!`,
  };
}

async function handleAngekommen(worker) {
  const today = new Date().toISOString().split('T')[0];
  const flowState = await getWorkerFlowState(worker.id, today);

  if (!flowState.nextVisit) {
    return {
      type: 'no_visits',
      response: 'Keine weiteren Objekte fuer heute.',
      buttons: [{ id: 'auschecken', title: 'Auschecken' }],
    };
  }

  const visit = await markArrived(flowState.nextVisit.id);

  await setState(worker.phone_number, `at_property_${visit.id}`);

  const photoHint = flowState.nextVisit.photo_required
    ? '\n\n📷 Foto erforderlich fuer dieses Objekt!'
    : '\n\nWenn du fertig bist, mach ein Foto oder druecke "Fertig".';

  return {
    type: 'arrived',
    response: `📍 ${flowState.nextVisit.address}, ${flowState.nextVisit.city} — Los geht's!${photoHint}`,
    buttons: COMPLETION_BUTTONS,
  };
}
