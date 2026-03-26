import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const { member_ids } = req.body;
  if (!Array.isArray(member_ids)) {
    return res.status(400).json({ error: 'member_ids array is required' });
  }

  const teamId = req.query.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamCheck = await client.query('SELECT id FROM teams WHERE id = $1', [teamId]);
    if (teamCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found' });
    }

    await client.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);

    if (member_ids.length > 0) {
      const placeholders = member_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO team_members (team_id, worker_id) VALUES ${placeholders}`,
        [teamId, ...member_ids]
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
      [teamId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});
