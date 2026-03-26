import { pool } from '../db/pool.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { notifyHalilPostponedTask } from './taskNotifications.js';
import { savePhotoFromTwilio } from './photoStorage.js';
import { postponeTask } from './taskScheduling.js';

const conversationState = new Map();

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

  const state = conversationState.get(phone);
  if (state === 'awaiting_sick_days') {
    return handleSickDayCount(worker, text);
  }

  // Handle photo state
  if (state && state.startsWith('awaiting_photo_')) {
    const taskId = parseInt(state.replace('awaiting_photo_', ''), 10);
    conversationState.delete(phone);

    if (media && media.numMedia > 0 && media.mediaUrl) {
      const photoPath = await savePhotoFromTwilio(media.mediaUrl, media.mediaContentType);
      await pool.query(
        'UPDATE task_assignments SET photo_url = $1, updated_at = NOW() WHERE id = $2',
        [photoPath, taskId]
      );
      return { type: 'photo_saved', response: 'Foto gespeichert. Weiter zur naechsten Aufgabe!' };
    }

    if (text.toLowerCase() === 'weiter') {
      return { type: 'photo_skipped', response: 'OK, weiter zur naechsten Aufgabe.' };
    }

    return { type: 'photo_skipped', response: 'Kein Foto erkannt. Weiter zur naechsten Aufgabe.' };
  }

  // Handle postpone reason state
  if (state && state.startsWith('awaiting_postpone_reason_')) {
    return handlePostponeReason(worker, text);
  }

  const command = text.toLowerCase();

  if (command === 'einchecken') {
    return handleCheckIn(worker);
  }

  if (command === 'auschecken') {
    return handleCheckOut(worker);
  }

  if (command === 'krank melden') {
    conversationState.set(phone, 'awaiting_sick_days');
    return {
      type: 'sick_prompt',
      response: 'Wie viele Tage wirst du krank sein?\n\n> 1\n> 2\n> 3\n> 4\n> 5\n> Mehr',
    };
  }

  if (command === 'erledigt') {
    return handleErledigt(worker);
  }

  if (command === 'nicht moeglich') {
    return handleNichtMoeglich(worker);
  }

  return {
    type: 'menu',
    response: 'Ich kann nur diese Aktionen ausfuehren:\n\n> Einchecken\n> Auschecken\n> Krank melden\n> Erledigt\n> Nicht moeglich\n\nFuer alles andere bitte direkt Halil kontaktieren.',
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
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];

  await pool.query(
    `UPDATE task_assignments SET status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [task.id]
  );

  conversationState.set(worker.phone_number, `awaiting_photo_${task.id}`);

  return {
    type: 'task_done',
    response: `${task.address}, ${task.city} als erledigt markiert.\nBitte sende ein Foto als Bestaetigung (oder "weiter" um zu ueberspringen).`,
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
      response: 'Du hast keine offenen Aufgaben fuer heute.',
    };
  }

  const task = taskResult.rows[0];
  conversationState.set(worker.phone_number, `awaiting_postpone_reason_${task.id}`);

  return {
    type: 'postpone_prompt',
    response: `Warum kann ${task.address} nicht erledigt werden?\n\n> Zugang nicht moeglich\n> Verantwortlicher nicht da\n> Material fehlt\n> Sonstiges`,
  };
}

async function handlePostponeReason(worker, reasonText) {
  const stateKey = conversationState.get(worker.phone_number);
  const taskId = parseInt(stateKey.replace('awaiting_postpone_reason_', ''), 10);
  conversationState.delete(worker.phone_number);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const task = await postponeTask(taskId, reasonText, tomorrowStr);
  await notifyHalilPostponedTask(task, reasonText);

  return {
    type: 'postponed',
    response: 'Aufgabe wurde verschoben. Halil wird benachrichtigt.',
  };
}

async function handleSickDayCount(worker, text) {
  conversationState.delete(worker.phone_number);

  let days;
  if (text.toLowerCase() === 'mehr') {
    days = null;
  } else {
    days = parseInt(text, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      return {
        type: 'menu',
        response: 'Ungueltige Eingabe. Bitte waehle eine Option:\n\n> 1\n> 2\n> 3\n> 4\n> 5\n> Mehr',
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
    response: `Krankmeldung fuer ${dayText} wurde erfasst. Halil wird benachrichtigt. Gute Besserung!`,
  };
}
