import { pool } from '../../../src/db/pool.js';
import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';

// Helpers — use YYYY-MM-DD string arithmetic to avoid timezone issues (BUG-013)

function parseDateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function dateFromParts(year, month, day) {
  return new Date(year, month - 1, day);
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekday(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  return dateFromParts(year, month, day).getDay();
}

function getMonday(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const d = dateFromParts(year, month, day);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDates(mondayDate) {
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    dates.push(toDateStr(d));
  }
  return dates;
}

function getCalendarWeek(dateStr) {
  const { year, month, day } = parseDateParts(dateStr);
  const d = dateFromParts(year, month, day);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + (4 - (d.getDay() || 7)));
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
}

function isBiweeklyActive(targetDateStr, biweeklyStartDateStr) {
  const tp = parseDateParts(targetDateStr);
  const sp = parseDateParts(biweeklyStartDateStr);
  const target = dateFromParts(tp.year, tp.month, tp.day);
  const start = dateFromParts(sp.year, sp.month, sp.day);
  const diffWeeks = Math.round((target - start) / (7 * 86400000));
  return diffWeeks % 2 === 0;
}

async function getHistoryTasks(dates) {
  const tasks = {};
  for (const d of dates) tasks[d] = [];

  // Plan assignments (field, cleaning tasks)
  const { rows: planRows } = await pool.query(
    `SELECT pa.status, pa.task_name, pa.worker_role, pa.postpone_reason, pa.postponed_to,
            dp.plan_date, w.name AS worker_name, w.id AS worker_id,
            p.address AS property_address, p.id AS property_id
     FROM plan_assignments pa
     JOIN daily_plans dp ON dp.id = pa.daily_plan_id
     JOIN workers w ON w.id = pa.worker_id
     JOIN properties p ON p.id = pa.property_id
     WHERE dp.plan_date = ANY($1)
     ORDER BY dp.plan_date, pa.assignment_order`,
    [dates]
  );
  for (const row of planRows) {
    const dateKey = toDateStr(new Date(row.plan_date));
    if (!tasks[dateKey]) continue;
    const status = row.status === 'done' ? 'done'
      : row.status === 'postponed' ? 'postponed'
      : row.status === 'in_progress' ? 'in_progress'
      : 'missed';
    tasks[dateKey].push({
      type: row.worker_role === 'cleaning' ? 'cleaning' : 'field',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_name || 'Aufgabe',
      worker_name: row.worker_name,
      worker_id: row.worker_id,
      status,
      postponed_to: row.postponed_to ? toDateStr(new Date(row.postponed_to)) : null,
    });
  }

  // Garbage tasks
  const { rows: garbageRows } = await pool.query(
    `SELECT gt.status, gt.due_date, gt.task_type,
            gs.trash_type, gs.collection_date,
            p.address AS property_address, p.id AS property_id
     FROM garbage_tasks gt
     JOIN garbage_schedules gs ON gs.id = gt.garbage_schedule_id
     JOIN properties p ON p.id = gs.property_id
     WHERE gt.due_date = ANY($1)
     ORDER BY gt.due_date, p.address`,
    [dates]
  );
  for (const row of garbageRows) {
    const dateKey = toDateStr(new Date(row.due_date));
    if (!tasks[dateKey]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    const action = row.task_type === 'raus' ? 'raus' : 'rein';
    tasks[dateKey].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} ${action}`,
      worker_name: null,
      worker_id: null,
      status: row.status === 'done' ? 'done' : 'missed',
    });
  }

  // Extra jobs (task_assignments not linked to garbage_tasks)
  const { rows: extraRows } = await pool.query(
    `SELECT ta.date, ta.task_description, ta.status,
            p.address AS property_address, p.id AS property_id
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.date = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM garbage_tasks gt WHERE gt.task_assignment_id = ta.id
       )
     ORDER BY ta.date, p.address`,
    [dates]
  );
  for (const row of extraRows) {
    const dateKey = toDateStr(new Date(row.date));
    if (!tasks[dateKey]) continue;
    const status = row.status === 'done' ? 'done'
      : row.status === 'postponed' ? 'postponed'
      : row.status === 'in_progress' ? 'in_progress'
      : 'missed';
    tasks[dateKey].push({
      type: 'extra',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_description || 'Zusatzauftrag',
      worker_name: null,
      worker_id: null,
      status,
    });
  }

  return tasks;
}

async function getForecastTasks(dates) {
  const tasks = {};
  for (const d of dates) tasks[d] = [];

  // Property tasks based on schedule rules
  const { rows: ptRows } = await pool.query(
    `SELECT pt.schedule_type, pt.schedule_day, pt.biweekly_start_date,
            pt.task_name, pt.worker_role,
            p.address AS property_address, p.id AS property_id,
            p.assigned_weekday
     FROM property_tasks pt
     JOIN properties p ON p.id = pt.property_id
     WHERE pt.is_active = true AND p.is_active = true`
  );

  for (const dateStr of dates) {
    const { year, month, day: dayOfMonth } = parseDateParts(dateStr);
    const dayOfWeek = dateFromParts(year, month, dayOfMonth).getDay(); // 0=Sun, 1=Mon...

    for (const pt of ptRows) {
      let matches = false;

      if (pt.schedule_type === 'property_default') {
        matches = pt.assigned_weekday === dayOfWeek;
      } else if (pt.schedule_type === 'weekly') {
        matches = pt.schedule_day === dayOfWeek;
      } else if (pt.schedule_type === 'biweekly') {
        matches = pt.schedule_day === dayOfWeek
          && pt.biweekly_start_date
          && isBiweeklyActive(dateStr, typeof pt.biweekly_start_date === 'string'
              ? pt.biweekly_start_date.slice(0, 10)
              : toDateStr(pt.biweekly_start_date));
      } else if (pt.schedule_type === 'monthly') {
        matches = pt.schedule_day === dayOfMonth;
      }

      if (matches) {
        tasks[dateStr].push({
          type: pt.worker_role === 'cleaning' ? 'cleaning' : 'field',
          property_id: pt.property_id,
          property_address: pt.property_address,
          task_name: pt.task_name,
          worker_name: null,
          worker_id: null,
          status: null,
        });
      }
    }
  }

  // Garbage schedules for future dates
  const { rows: gsRows } = await pool.query(
    `SELECT gs.collection_date, gs.trash_type,
            p.address AS property_address, p.id AS property_id
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = ANY($1)
     ORDER BY gs.collection_date, p.address`,
    [dates]
  );
  for (const row of gsRows) {
    const dateKey = toDateStr(new Date(row.collection_date));
    if (!tasks[dateKey]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    tasks[dateKey].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} rein`,
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  // Also check day-before for "raus" tasks
  const nextDays = dates.map(d => {
    const { year, month, day } = parseDateParts(d);
    const next = dateFromParts(year, month, day);
    next.setDate(next.getDate() + 1);
    return toDateStr(next);
  });
  const { rows: rausRows } = await pool.query(
    `SELECT gs.collection_date, gs.trash_type,
            p.address AS property_address, p.id AS property_id
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = ANY($1)
     ORDER BY gs.collection_date, p.address`,
    [nextDays]
  );
  for (const row of rausRows) {
    const collectionDate = toDateStr(new Date(row.collection_date));
    const cp = parseDateParts(collectionDate);
    const rausDate = dateFromParts(cp.year, cp.month, cp.day);
    rausDate.setDate(rausDate.getDate() - 1);
    const rausDateStr = toDateStr(rausDate);
    if (!tasks[rausDateStr]) continue;
    const label = row.trash_type.charAt(0).toUpperCase() + row.trash_type.slice(1);
    tasks[rausDateStr].push({
      type: 'garbage',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: `${label} raus`,
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  // Extra jobs with future dates (exclude garbage-linked assignments)
  const { rows: extraRows } = await pool.query(
    `SELECT ta.date, ta.task_description,
            p.address AS property_address, p.id AS property_id
     FROM task_assignments ta
     JOIN properties p ON p.id = ta.property_id
     WHERE ta.date = ANY($1)
       AND NOT EXISTS (
         SELECT 1 FROM garbage_tasks gt WHERE gt.task_assignment_id = ta.id
       )
     ORDER BY ta.date, p.address`,
    [dates]
  );
  for (const row of extraRows) {
    const dateKey = toDateStr(new Date(row.date));
    if (!tasks[dateKey]) continue;
    tasks[dateKey].push({
      type: 'extra',
      property_id: row.property_id,
      property_address: row.property_address,
      task_name: row.task_description || 'Zusatzauftrag',
      worker_name: null,
      worker_id: null,
      status: null,
    });
  }

  return tasks;
}

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const todayStr = toDateStr(new Date());
  const weekStartParam = req.query.week_start || todayStr;
  const monday = getMonday(weekStartParam);
  const mondayStr = toDateStr(monday);
  const weekDates = getWeekDates(monday);
  const fridayStr = weekDates[4];

  // Check 8-week forecast limit
  const tp = parseDateParts(todayStr);
  const maxForecast = dateFromParts(tp.year, tp.month, tp.day);
  maxForecast.setDate(maxForecast.getDate() + 56);
  const mp = parseDateParts(mondayStr);
  if (dateFromParts(mp.year, mp.month, mp.day) > maxForecast) {
    return res.json({
      week_start: mondayStr,
      week_end: fridayStr,
      calendar_week: getCalendarWeek(mondayStr),
      days: Object.fromEntries(weekDates.map(d => [d, { mode: 'forecast', tasks: [] }])),
    });
  }

  const historyDates = weekDates.filter(d => d <= todayStr);
  const forecastDates = weekDates.filter(d => d > todayStr);

  const [historyTasks, forecastTasks] = await Promise.all([
    historyDates.length > 0 ? getHistoryTasks(historyDates) : {},
    forecastDates.length > 0 ? getForecastTasks(forecastDates) : {},
  ]);

  const days = {};
  for (const d of weekDates) {
    if (d === todayStr) {
      days[d] = { mode: 'today', tasks: historyTasks[d] || [] };
    } else if (d < todayStr) {
      days[d] = { mode: 'history', tasks: historyTasks[d] || [] };
    } else {
      days[d] = { mode: 'forecast', tasks: forecastTasks[d] || [] };
    }
  }

  res.json({
    week_start: mondayStr,
    week_end: fridayStr,
    calendar_week: getCalendarWeek(mondayStr),
    days,
  });
});
