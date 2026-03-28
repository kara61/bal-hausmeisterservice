import { pool } from '../db/pool.js';
import { matchKeyword } from './keywordRouter.js';
import { startCheckoutReview, handleAlleDone, handleNichtAlle, handleIncompleteSelection, handleIncompleteReason, handleMoreIncomplete, handleCheckoutPhoto, CHECKOUT_CONFIRM_BUTTONS, INCOMPLETE_REASON_BUTTONS, MORE_INCOMPLETE_BUTTONS, PHOTO_BUTTONS } from './checkoutFlow.js';
import { notifyHalilSickDeclaration } from './notifications.js';
import { approvePlan, redistributeSickWorkers } from './planGeneration.js';
import { notifyWorkersOfRedistribution } from './planNotifications.js';
import { config } from '../config.js';

// --- State helpers ---

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

const MORNING_BUTTONS = [
  { id: 'alles_klar', title: 'Alles klar' },
  { id: 'kann_heute_nicht', title: 'Kann heute nicht' },
];

const CHECKIN_BUTTONS = [
  { id: 'einchecken', title: 'Einchecken' },
];

const SICK_BUTTONS = [
  { id: 'sick_1', title: '1 Tag' },
  { id: 'sick_2', title: '2 Tage' },
  { id: 'sick_3', title: '3+ Tage' },
];

// --- Main handler ---

export async function handleIncomingMessageV2(phoneNumber, messageBody, media = {}) {
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
  const text = (messageBody || '').trim();
  const command = text.toLowerCase().replace(/\s+/g, '_');
  const state = await getState(phone);

  // --- Keyword recognition (works in any state) ---
  const keyword = matchKeyword(text);

  if (keyword === 'sick' && state !== 'awaiting_sick_days') {
    await setState(phone, 'awaiting_sick_days');
    return { type: 'sick_prompt', response: 'Wie lange faellst du aus?', buttons: SICK_BUTTONS };
  }

  if (keyword === 'help') {
    return handleHelp(worker, state);
  }

  if (keyword === 'reset') {
    await clearState(phone);
    return { type: 'reset', response: 'Status zurueckgesetzt. Warte auf naechste Nachricht.' };
  }

  if (keyword === 'status') {
    return handleStatus(worker);
  }

  if (keyword === 'checkout' && state === 'checked_in') {
    await setState(phone, 'checkout_review');
    return startCheckoutReview(worker);
  }

  // --- State-based routing ---

  // Sick day count
  if (state === 'awaiting_sick_days') {
    return handleSickDayCount(worker, command);
  }

  // Checkout flow states
  if (state === 'checkout_review') {
    if (command === 'alle_erledigt') {
      const result = await handleAlleDone(worker);
      if (result.type === 'extra_photo_needed') {
        await setState(phone, `checkout_photo_${result.visitId}`);
      } else {
        await clearState(phone);
      }
      return result;
    }
    if (command === 'nicht_alle') {
      await setState(phone, 'checkout_incomplete');
      return handleNichtAlle(worker);
    }
    return { type: 'repeat', response: 'Alle erledigt?', buttons: CHECKOUT_CONFIRM_BUTTONS };
  }

  if (state === 'checkout_incomplete') {
    if (command.startsWith('incomplete_')) {
      const visitId = parseInt(command.replace('incomplete_', ''), 10);
      await setState(phone, `checkout_reason_${visitId}`);
      return handleIncompleteSelection(worker, visitId);
    }
    return { type: 'repeat', response: 'Welches Objekt nicht geschafft?', buttons: [] };
  }

  if (state && state.startsWith('checkout_reason_')) {
    const visitId = parseInt(state.replace('checkout_reason_', ''), 10);
    const reasons = {
      kein_zugang: 'Kein Zugang',
      material_fehlt: 'Material fehlt',
      keine_zeit: 'Keine Zeit',
    };
    const reason = reasons[command];
    if (reason) {
      await setState(phone, 'checkout_more_incomplete');
      return handleIncompleteReason(worker, visitId, reason);
    }
    return { type: 'repeat', response: 'Warum?', buttons: INCOMPLETE_REASON_BUTTONS };
  }

  if (state === 'checkout_more_incomplete') {
    if (command === 'ja_noch_eins') {
      await setState(phone, 'checkout_incomplete');
      return handleNichtAlle(worker);
    }
    if (command === 'nein_rest_erledigt') {
      const result = await handleAlleDone(worker);
      if (result.type === 'extra_photo_needed') {
        await setState(phone, `checkout_photo_${result.visitId}`);
      } else {
        await clearState(phone);
      }
      return result;
    }
    return { type: 'repeat', response: 'Noch ein Objekt nicht geschafft?', buttons: MORE_INCOMPLETE_BUTTONS };
  }

  if (state && state.startsWith('checkout_photo_')) {
    const visitId = parseInt(state.replace('checkout_photo_', ''), 10);

    if (media && media.numMedia > 0 && media.mediaUrl) {
      const result = await handleCheckoutPhoto(worker, visitId, media.mediaUrl, media.mediaContentType);
      return result;
    }

    if (command === 'noch_ein_foto') {
      return { type: 'photo_prompt', response: 'Sende das naechste Foto.', visitId };
    }

    if (command === 'foto_fertig') {
      const result = await handleAlleDone(worker);
      if (result.type === 'extra_photo_needed') {
        await setState(phone, `checkout_photo_${result.visitId}`);
      } else {
        await clearState(phone);
      }
      return result;
    }

    return { type: 'repeat', response: 'Bitte sende ein Foto oder druecke Fertig.', buttons: PHOTO_BUTTONS };
  }

  // --- Command-based routing (no state or base state) ---

  if (command === 'alles_klar') {
    await setState(phone, 'acknowledged');
    return {
      type: 'acknowledged',
      response: 'Gut! Druecke Einchecken wenn du am ersten Objekt ankommst.',
      buttons: CHECKIN_BUTTONS,
    };
  }

  if (command === 'kann_heute_nicht') {
    await setState(phone, 'awaiting_sick_days');
    return { type: 'sick_prompt', response: 'Wie lange faellst du aus?', buttons: SICK_BUTTONS };
  }

  if (command === 'einchecken') {
    return handleCheckIn(worker, phone);
  }

  if (command === 'auschecken') {
    if (state === 'checked_in') {
      await setState(phone, 'checkout_review');
      return startCheckoutReview(worker);
    }
    return { type: 'not_checked_in', response: 'Du bist heute nicht eingecheckt.', buttons: CHECKIN_BUTTONS };
  }

  // Plan approval from Halil
  if (command.startsWith('plan_approve_') && phone === config.halilWhatsappNumber?.replace('whatsapp:', '')) {
    const planId = parseInt(command.replace('plan_approve_', ''), 10);
    try {
      await approvePlan(planId, 'halil_whatsapp');
      return { type: 'plan_approved', response: 'Tagesplan genehmigt! Wird morgen um 06:15 an die Mitarbeiter gesendet.' };
    } catch (err) {
      return { type: 'plan_error', response: `Fehler: ${err.message}` };
    }
  }

  if (command.startsWith('plan_edit_') && phone === config.halilWhatsappNumber?.replace('whatsapp:', '')) {
    return { type: 'plan_edit', response: 'Oeffne das Dashboard um den Plan zu bearbeiten:\nhttps://balhausmeister.vercel.app/daily-plan' };
  }

  // --- Default: repeat current state prompt or show info ---
  if (state === 'acknowledged') {
    return { type: 'repeat', response: 'Druecke Einchecken wenn du am ersten Objekt ankommst.', buttons: CHECKIN_BUTTONS };
  }

  if (state === 'checked_in') {
    return { type: 'info', response: 'Du bist eingecheckt. Schreib "auschecken" oder "hilfe" wenn du Fragen hast.' };
  }

  const firstName = worker.name.split(' ')[0];
  return { type: 'info', response: `Hallo ${firstName}! Warte auf die naechste Tagesaufgabe.` };
}

// --- Sub-handlers ---

async function handleCheckIn(worker, phone) {
  const today = new Date().toISOString().split('T')[0];

  const existing = await pool.query(
    'SELECT * FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  if (existing.rows.length > 0 && existing.rows[0].check_in) {
    const checkInTime = new Date(existing.rows[0].check_in).toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit',
    });
    return { type: 'already_checked_in', response: `Du bist bereits eingecheckt seit ${checkInTime}.` };
  }

  const now = new Date();
  await pool.query(
    `INSERT INTO time_entries (worker_id, date, check_in)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, date) DO UPDATE SET check_in = $3, updated_at = NOW()`,
    [worker.id, today, now]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  await setState(phone, 'checked_in');

  return { type: 'checkin', response: `Eingecheckt um ${timeStr}. Guten Arbeitstag!` };
}

async function handleSickDayCount(worker, command) {
  await clearState(worker.phone_number);

  let days;
  if (command === 'mehr' || command === '3+_tage' || command === 'sick_3') {
    days = null;
  } else {
    const cleaned = command.replace(/_?tage?/, '').replace('sick_', '').trim();
    days = parseInt(cleaned, 10);
    if (isNaN(days) || days < 1 || days > 30) {
      return { type: 'sick_prompt', response: 'Bitte waehle eine Option:', buttons: SICK_BUTTONS };
    }
  }

  const today = new Date().toISOString().split('T')[0];

  await pool.query(
    `INSERT INTO sick_leave (worker_id, start_date, declared_days, status)
     VALUES ($1, $2, $3, 'pending')`,
    [worker.id, today, days || 0]
  );

  await notifyHalilSickDeclaration(worker.name, days);

  const redistribution = await redistributeSickWorkers(today);
  if (redistribution.details && redistribution.details.length > 0) {
    for (const d of redistribution.details) {
      await pool.query(
        `UPDATE property_visits SET worker_id = $1
         WHERE plan_assignment_id = $2 AND status = 'assigned'`,
        [d.newWorkerId, d.assignmentId]
      );
    }
    await notifyWorkersOfRedistribution(redistribution.details);
  }

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return { type: 'sick_recorded', response: `Krankmeldung fuer ${dayText} erfasst. Gute Besserung!` };
}

function handleHelp(worker, state) {
  const stateMessages = {
    null: 'Du wartest auf die naechste Tagesaufgabe. Schreib "krank" wenn du krank bist.',
    acknowledged: 'Du hast deine Aufgaben gesehen. Druecke "Einchecken" wenn du am ersten Objekt bist.',
    checked_in: 'Du bist eingecheckt. Schreib "auschecken" wenn du fertig bist.',
    awaiting_sick_days: 'Waehle die Anzahl Tage: 1, 2 oder 3+.',
  };

  let msg = stateMessages[state] || `Aktueller Status: ${state}. Schreib "reset" um neuzustarten.`;

  if (state && (state.startsWith('checkout_') || state.startsWith('checkout_photo_'))) {
    msg = 'Du bist im Auschecken. Folge den Anweisungen oder schreib "reset" um neuzustarten.';
  }

  return { type: 'help', response: msg };
}

async function handleStatus(worker) {
  const today = new Date().toISOString().split('T')[0];
  const { rows: te } = await pool.query(
    'SELECT check_in, check_out FROM time_entries WHERE worker_id = $1 AND date = $2',
    [worker.id, today]
  );

  const { rows: visits } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS done
     FROM property_visits WHERE worker_id = $1 AND visit_date = $2`,
    [worker.id, today]
  );

  const checkIn = te[0]?.check_in
    ? new Date(te[0].check_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : 'nicht eingecheckt';
  const total = visits[0]?.total || 0;
  const done = visits[0]?.done || 0;

  return {
    type: 'status',
    response: `Eingecheckt: ${checkIn}\nObjekte: ${done}/${total} erledigt`,
  };
}
