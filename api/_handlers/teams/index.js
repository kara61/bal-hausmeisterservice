import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date query parameter is required' });

    const result = await pool.query(
      `SELECT t.id, t.date, t.name, t.created_at,
         COALESCE(json_agg(
           json_build_object('id', w.id, 'name', w.name)
         ) FILTER (WHERE w.id IS NOT NULL), '[]') AS members
       FROM teams t
       LEFT JOIN team_members tm ON tm.team_id = t.id
       LEFT JOIN workers w ON w.id = tm.worker_id
       WHERE t.date = $1
       GROUP BY t.id
       ORDER BY t.name`,
      [date]
    );
    return res.json(result.rows);
  }

  if (req.method === 'POST') {
    const { date, name, member_ids } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const teamResult = await client.query(
        'INSERT INTO teams (date, name) VALUES ($1, $2) RETURNING *',
        [date, name || null]
      );
      const team = teamResult.rows[0];

      if (member_ids && member_ids.length > 0) {
        const placeholders = member_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO team_members (team_id, worker_id) VALUES ${placeholders}`,
          [team.id, ...member_ids]
        );
      }

      await client.query('COMMIT');

      const result = await pool.query(
        `SELECT t.id, t.date, t.name, t.created_at,
           COALESCE(json_agg(
             json_build_object('id', w.id, 'name', w.name)
           ) FILTER (WHERE w.id IS NOT NULL), '[]') AS members
         FROM teams t
         LEFT JOIN team_members tm ON tm.team_id = t.id
         LEFT JOIN workers w ON w.id = tm.worker_id
         WHERE t.id = $1
         GROUP BY t.id`,
        [team.id]
      );
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A team with this name already exists for the given date' });
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
