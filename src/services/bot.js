import { pool } from '../db/pool.js';

const conversationState = new Map();

export async function handleIncomingMessage(phoneNumber, messageBody) {
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

  return {
    type: 'menu',
    response: 'Ich kann nur diese Aktionen ausfuehren:\n\n> Einchecken\n> Auschecken\n> Krank melden\n\nFuer alles andere bitte direkt Halil kontaktieren.',
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

  const dayText = days ? `${days} Tage` : 'unbestimmte Zeit';
  return {
    type: 'sick_recorded',
    response: `Krankmeldung fuer ${dayText} wurde erfasst. Halil wird benachrichtigt. Gute Besserung!`,
  };
}
