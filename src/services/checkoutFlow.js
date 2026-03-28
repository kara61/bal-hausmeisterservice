import { pool } from '../db/pool.js';
import { savePhotoFromTwilio } from './photoStorage.js';
import { postponePlanTask } from './planGeneration.js';

const CHECKOUT_CONFIRM_BUTTONS = [
  { id: 'alle_erledigt', title: 'Alle erledigt' },
  { id: 'nicht_alle', title: 'Nicht alle' },
];

const INCOMPLETE_REASON_BUTTONS = [
  { id: 'kein_zugang', title: 'Kein Zugang' },
  { id: 'material_fehlt', title: 'Material fehlt' },
  { id: 'keine_zeit', title: 'Keine Zeit' },
];

const MORE_INCOMPLETE_BUTTONS = [
  { id: 'ja_noch_eins', title: 'Ja' },
  { id: 'nein_rest_erledigt', title: 'Nein, Rest erledigt' },
];

const PHOTO_BUTTONS = [
  { id: 'noch_ein_foto', title: 'Noch ein Foto' },
  { id: 'foto_fertig', title: 'Fertig' },
];

export { CHECKOUT_CONFIRM_BUTTONS, INCOMPLETE_REASON_BUTTONS, MORE_INCOMPLETE_BUTTONS, PHOTO_BUTTONS };

async function getWorkerVisitsToday(workerId) {
  const today = new Date().toISOString().split('T')[0];
  const { rows } = await pool.query(
    `SELECT pv.*, p.address, p.city, pa.is_extra_work, pa.task_name
     FROM property_visits pv
     JOIN properties p ON p.id = pv.property_id
     JOIN plan_assignments pa ON pa.id = pv.plan_assignment_id
     WHERE pv.worker_id = $1 AND pv.visit_date = $2
     ORDER BY pv.id`,
    [workerId, today]
  );
  return rows;
}

export async function startCheckoutReview(worker) {
  const visits = await getWorkerVisitsToday(worker.id);

  if (visits.length === 0) {
    return {
      type: 'no_assignments',
      response: 'Keine Aufgaben fuer heute.',
      buttons: [],
    };
  }

  return {
    type: 'checkout_review',
    response: `Du hattest heute ${visits.length} Objekte. Alle erledigt?`,
    buttons: CHECKOUT_CONFIRM_BUTTONS,
  };
}

export async function handleAlleDone(worker) {
  const visits = await getWorkerVisitsToday(worker.id);
  const today = new Date().toISOString().split('T')[0];

  for (const visit of visits) {
    if (visit.status !== 'completed' && visit.status !== 'incomplete') {
      await pool.query(
        `UPDATE property_visits SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [visit.id]
      );
      if (visit.plan_assignment_id) {
        await pool.query(
          `UPDATE plan_assignments SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [visit.plan_assignment_id]
        );
      }
    }
  }

  const extraWork = visits.filter(v => v.is_extra_work);
  if (extraWork.length > 0) {
    const needsPhoto = [];
    for (const ew of extraWork) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM property_visit_photos WHERE property_visit_id = $1`,
        [ew.id]
      );
      if (rows[0].cnt === 0) {
        needsPhoto.push(ew);
      }
    }

    if (needsPhoto.length > 0) {
      const first = needsPhoto[0];
      return {
        type: 'extra_photo_needed',
        response: `Du hattest ${needsPhoto.length} Sonderaufgabe${needsPhoto.length > 1 ? 'n' : ''}:\n${first.address}, ${first.city} — ${first.task_name}\nBitte Foto senden.`,
        visitId: first.id,
        remainingPhotos: needsPhoto.slice(1),
      };
    }
  }

  return await finalizeCheckout(worker, visits);
}

export async function handleNichtAlle(worker) {
  const visits = await getWorkerVisitsToday(worker.id);

  const listItems = visits
    .filter(v => v.status !== 'incomplete')
    .map(v => ({
      id: `incomplete_${v.id}`,
      title: `${v.address}, ${v.city}`.substring(0, 24),
      description: v.task_name || '',
    }));

  return {
    type: 'incomplete_list',
    response: 'Welches Objekt nicht geschafft?',
    listItems,
    listButtonText: 'Objekt waehlen',
  };
}

export async function handleIncompleteSelection(worker, visitId) {
  const { rows: [visit] } = await pool.query(
    `SELECT pv.*, p.address, p.city FROM property_visits pv
     JOIN properties p ON p.id = pv.property_id WHERE pv.id = $1`,
    [visitId]
  );

  if (!visit) {
    return { type: 'error', response: 'Objekt nicht gefunden.', buttons: [] };
  }

  return {
    type: 'incomplete_reason',
    response: `${visit.address}, ${visit.city} — Warum?`,
    buttons: INCOMPLETE_REASON_BUTTONS,
    visitId,
  };
}

export async function handleIncompleteReason(worker, visitId, reason) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  await pool.query(
    `UPDATE property_visits SET status = 'incomplete', incomplete_reason = $2 WHERE id = $1`,
    [visitId, reason]
  );

  const { rows: [visit] } = await pool.query(
    `SELECT plan_assignment_id FROM property_visits WHERE id = $1`,
    [visitId]
  );
  if (visit?.plan_assignment_id) {
    await postponePlanTask(visit.plan_assignment_id, reason, tomorrowStr);
  }

  return {
    type: 'incomplete_recorded',
    response: 'Noch ein Objekt nicht geschafft?',
    buttons: MORE_INCOMPLETE_BUTTONS,
  };
}

export async function handleMoreIncomplete(worker, moreIncomplete) {
  if (moreIncomplete) {
    return handleNichtAlle(worker);
  }
  return handleAlleDone(worker);
}

export async function handleCheckoutPhoto(worker, visitId, mediaUrl, mediaContentType) {
  const photoUrl = await savePhotoFromTwilio(mediaUrl, mediaContentType);
  await pool.query(
    `INSERT INTO property_visit_photos (property_visit_id, photo_url) VALUES ($1, $2)`,
    [visitId, photoUrl]
  );

  return {
    type: 'photo_saved',
    response: '✓ Foto gespeichert.',
    buttons: PHOTO_BUTTONS,
    visitId,
  };
}

async function finalizeCheckout(worker, visits) {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();

  await pool.query(
    `UPDATE time_entries SET check_out = $1, updated_at = NOW()
     WHERE worker_id = $2 AND date = $3 AND check_out IS NULL`,
    [now, worker.id, today]
  );

  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const incomplete = visits.filter(v => v.status === 'incomplete');
  const total = visits.length;
  const doneCount = total - incomplete.length;

  let summary = `Ausgecheckt um ${timeStr}.\n✓ ${doneCount}/${total} Objekte erledigt`;

  for (const v of incomplete) {
    summary += `\n✗ ${v.address} → morgen (${v.incomplete_reason || 'Unbekannt'})`;
  }

  summary += '\nGuten Feierabend!';

  return {
    type: 'checkout_complete',
    response: summary,
    buttons: [],
  };
}
