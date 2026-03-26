import { Router } from 'express';
import { pool } from '../db/pool.js';
import { notifyTeamNewExtraJob } from '../services/taskNotifications.js';

const router = Router();

// GET / — list extra jobs, optional date filter
router.get('/', async (req, res) => {
  try {
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
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list extra jobs' });
  }
});

// POST / — create extra job
router.post('/', async (req, res) => {
  try {
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
    res.status(201).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create extra job' });
  }
});

// PUT /:id — update extra job
router.put('/:id', async (req, res) => {
  try {
    const fields = ['description', 'address', 'team_id', 'date', 'time_in', 'time_out', 'status'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(req.body[field]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE extra_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update extra job' });
  }
});

// POST /:id/photos — append photo URL
router.post('/:id/photos', async (req, res) => {
  try {
    const { photo_url } = req.body;
    if (!photo_url) return res.status(400).json({ error: 'photo_url is required' });

    const result = await pool.query(
      `UPDATE extra_jobs SET photo_urls = array_append(photo_urls, $1), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [photo_url, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add photo' });
  }
});

// DELETE /:id — hard delete
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM extra_jobs WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Extra job not found' });
    res.json({ message: 'Extra job deleted', job: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete extra job' });
  }
});

export default router;
