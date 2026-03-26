import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (req, res) => {
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
  res.json(result.rows);
});

router.post('/', async (req, res) => {
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

    // Re-fetch with members
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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id/members', async (req, res) => {
  const { member_ids } = req.body;
  if (!Array.isArray(member_ids)) {
    return res.status(400).json({ error: 'member_ids array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify team exists
    const teamCheck = await client.query('SELECT id FROM teams WHERE id = $1', [req.params.id]);
    if (teamCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found' });
    }

    // Replace members
    await client.query('DELETE FROM team_members WHERE team_id = $1', [req.params.id]);

    if (member_ids.length > 0) {
      const placeholders = member_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO team_members (team_id, worker_id) VALUES ${placeholders}`,
        [req.params.id, ...member_ids]
      );
    }

    await client.query('COMMIT');

    // Re-fetch with members
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
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING *', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Team not found' });
  res.json(result.rows[0]);
});

export default router;
