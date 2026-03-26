import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { getTasksForTeam, formatTaskList } from './taskScheduling.js';

export async function sendDailyTaskLists(dateStr) {
  const { rows: teams } = await pool.query(
    `SELECT id FROM teams WHERE date = $1`,
    [dateStr]
  );

  for (const team of teams) {
    const tasks = await getTasksForTeam(team.id, dateStr);
    const message = formatTaskList(tasks, dateStr);

    const { rows: members } = await pool.query(
      `SELECT w.whatsapp_number FROM team_members tm
       JOIN workers w ON w.id = tm.worker_id
       WHERE tm.team_id = $1`,
      [team.id]
    );

    for (const member of members) {
      await sendWhatsAppMessage(member.whatsapp_number, message);
    }
  }
}

export async function notifyTeamTaskUpdate(teamId, task, action) {
  const { rows: [property] } = await pool.query(
    `SELECT address FROM properties WHERE id = $1`,
    [task.property_id]
  );

  let message;
  if (action === 'assigned') {
    message = `Neue Aufgabe: ${property.address} — ${task.task_description}`;
  } else if (action === 'removed') {
    message = `Aufgabe entfernt: ${property.address}`;
  }

  const { rows: members } = await pool.query(
    `SELECT w.whatsapp_number FROM team_members tm
     JOIN workers w ON w.id = tm.worker_id
     WHERE tm.team_id = $1`,
    [teamId]
  );

  for (const member of members) {
    await sendWhatsAppMessage(member.whatsapp_number, message);
  }
}

export async function notifyTeamNewExtraJob(teamId, job) {
  const message = `Zusatzauftrag: ${job.description}\nAdresse: ${job.address}`;

  const { rows: members } = await pool.query(
    `SELECT w.whatsapp_number FROM team_members tm
     JOIN workers w ON w.id = tm.worker_id
     WHERE tm.team_id = $1`,
    [teamId]
  );

  for (const member of members) {
    await sendWhatsAppMessage(member.whatsapp_number, message);
  }
}

export async function notifyHalilPostponedTask(task, reason) {
  const { rows: [property] } = await pool.query(
    `SELECT address FROM properties WHERE id = $1`,
    [task.property_id]
  );

  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `Aufgabe verschoben: ${property.address}\nGrund: ${reason}\n\n> OK\n> Bearbeiten`
  );
}
