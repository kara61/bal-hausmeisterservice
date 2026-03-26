import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  generateDailyTasks,
  carryOverTasks,
  postponeTask,
  getDailyOverview,
} from '../services/taskScheduling.js';
import { notifyTeamTaskUpdate } from '../services/taskNotifications.js';

const router = Router();

const VALID_STATUSES = ['pending', 'in_progress', 'done', 'postponed'];

// GET /daily?date= — daily overview
router.get('/daily', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: 'date query parameter is required' });
    const tasks = await getDailyOverview(date);
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get daily overview' });
  }
});

// POST /generate — generate daily tasks
router.post('/generate', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    const created = await generateDailyTasks(date);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate daily tasks' });
  }
});

// POST /carryover — carry over incomplete tasks
router.post('/carryover', async (req, res) => {
  try {
    const { from_date, to_date } = req.body;
    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required' });
    }
    const carried = await carryOverTasks(from_date, to_date);
    res.status(201).json(carried);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to carry over tasks' });
  }
});

// PUT /:id/assign — assign team to task
router.put('/:id/assign', async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    const result = await pool.query(
      `UPDATE task_assignments SET team_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [team_id, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = result.rows[0];
    await notifyTeamTaskUpdate(team_id, task, 'assigned');
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

// PUT /:id/status — update task status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, photo_url } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const values = [status];
    let paramIndex = 2;

    if (status === 'done') {
      updates.push(`completed_at = NOW()`);
    }

    if (photo_url) {
      updates.push(`photo_url = $${paramIndex}`);
      values.push(photo_url);
      paramIndex++;
    }

    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE task_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// PUT /:id/postpone — postpone a task
router.put('/:id/postpone', async (req, res) => {
  try {
    const { reason, new_date } = req.body;
    if (!reason || !new_date) {
      return res.status(400).json({ error: 'reason and new_date are required' });
    }
    const task = await postponeTask(req.params.id, reason, new_date);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to postpone task' });
  }
});

// PUT /:id/reassign — reassign task to different team
router.put('/:id/reassign', async (req, res) => {
  try {
    const { team_id } = req.body;
    if (!team_id) return res.status(400).json({ error: 'team_id is required' });

    const current = await pool.query(
      'SELECT * FROM task_assignments WHERE id = $1',
      [req.params.id]
    );

    if (current.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const task = current.rows[0];
    const oldTeamId = task.team_id;

    const result = await pool.query(
      `UPDATE task_assignments SET team_id = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [team_id, req.params.id]
    );

    const updatedTask = result.rows[0];

    if (oldTeamId) {
      await notifyTeamTaskUpdate(oldTeamId, task, 'removed');
    }
    await notifyTeamTaskUpdate(team_id, updatedTask, 'assigned');

    res.json(updatedTask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reassign task' });
  }
});

export default router;
