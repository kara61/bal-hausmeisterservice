import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { notifyTeamNewExtraJob } from '../../../src/services/taskNotifications.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { date } = req.query;
    let query = `
      SELECT ej.*, t.name AS team_name,
        (SELECT json_agg(json_build_object('worker_id', tm.worker_id, 'name', w.name))
         FROM team_members tm
         JOIN workers w ON w.id = tm.worker_id
         WHERE tm.team_id = t.id) AS team_members
      FROM extra_jobs ej
      LEFT JOIN teams t ON t.id = ej.team_id
    `;
    const values = [];

    if (date) {
      query += ' WHERE ej.date = $1';
      values.push(date);
    }

    query += ' ORDER BY ej.date DESC, ej.id DESC';

    const result = await pool.query(query, values);
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { description, address, team_id, date } = req.body;
    if (!description || !address || !team_id || !date) {
      return res.status(400).json({ error: 'description, address, team_id, and date are required' });
    }

    const result = await pool.query(
      `INSERT INTO extra_jobs (description, address, team_id, date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [description, address, team_id, date]
    );

    const job = result.rows[0];
    await notifyTeamNewExtraJob(team_id, job);
    return res.status(201).json(job);
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
