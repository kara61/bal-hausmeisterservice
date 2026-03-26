import { pool } from '../db/pool.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { notifyHalilPostponedTask } from './taskNotifications.js';
import { savePhotoFromTwilio } from './photoStorage.js';
import { postponeTask } from './taskScheduling.js';

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

  // Normalize command — handle both typed text and button IDs
  const command = text.toLowerCase().replace(/\s+/g, '_');

  if (command === 'einchecken') {
    return handleCheckIn(worker);
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

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return {
    type: 'sick_recorded',
    response: `Krankmeldung fuer ${dayText} erfasst. Gute Besserung!`,
  };
}
