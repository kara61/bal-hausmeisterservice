import { pool } from '../db/pool.js';
import { calculateMonthlyHours, splitOfficialAndUnofficial } from './timeCalculation.js';

/** Legal Minijob ceiling since Jan 2024 */
export const MINIJOB_MAX_MONTHLY = 538;

export function calculateSurplusHours(entries, workerType, minijobMonthlyMax = null) {
  const totalHours = calculateMonthlyHours(entries);
  const { unofficial } = splitOfficialAndUnofficial(totalHours, workerType, minijobMonthlyMax);
  return unofficial;
}

export async function syncMonthForAll(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { rows: workers } = await pool.query(
    `SELECT id, worker_type, hourly_rate, monthly_salary
     FROM workers WHERE worker_role IN ('field', 'cleaning') AND is_active = true`
  );

  const results = [];
  for (const worker of workers) {
    const { rows: entries } = await pool.query(
      `SELECT check_in, check_out FROM time_entries
       WHERE worker_id = $1 AND date >= $2 AND date < $3`,
      [worker.id, startDate, endDate]
    );

    const minijobMax = worker.worker_type === 'minijob' && worker.hourly_rate
      ? Math.round((Math.min(worker.monthly_salary, MINIJOB_MAX_MONTHLY) / worker.hourly_rate) * 100) / 100
      : null;

    const surplus = calculateSurplusHours(entries, worker.worker_type, minijobMax);

    const { rows } = await pool.query(
      `INSERT INTO hour_balances (worker_id, year, month, surplus_hours)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (worker_id, year, month)
       DO UPDATE SET surplus_hours = $4, updated_at = NOW()
       RETURNING *`,
      [worker.id, year, month, surplus]
    );
    results.push(rows[0]);
  }
  return results;
}

export async function getWorkerBalances() {
  const { rows: workers } = await pool.query(
    `SELECT id, name, worker_role, worker_type
     FROM workers WHERE worker_role IN ('field', 'cleaning') AND is_active = true
     ORDER BY name`
  );

  const { rows: balances } = await pool.query(
    `SELECT * FROM hour_balances
     WHERE worker_id = ANY($1)
     ORDER BY year, month`,
    [workers.map(w => w.id)]
  );

  const balancesByWorker = {};
  for (const b of balances) {
    if (!balancesByWorker[b.worker_id]) balancesByWorker[b.worker_id] = [];
    balancesByWorker[b.worker_id].push(b);
  }

  return workers.map(w => {
    const history = balancesByWorker[w.id] || [];
    const totalBalance = history.reduce(
      (sum, h) => sum + Number(h.surplus_hours) - Number(h.payout_hours), 0
    );
    return {
      ...w,
      balance: Math.round(totalBalance * 100) / 100,
      history,
    };
  });
}

export async function recordPayout(workerId, year, month, payoutHours, note) {
  // First, try to update an existing row with a guard against overpayment
  const update = await pool.query(
    `UPDATE hour_balances
     SET payout_hours = hour_balances.payout_hours + $4,
         note = COALESCE($5, hour_balances.note),
         updated_at = NOW()
     WHERE worker_id = $1 AND year = $2 AND month = $3
       AND hour_balances.payout_hours + $4 <= hour_balances.surplus_hours
     RETURNING *`,
    [workerId, year, month, payoutHours, note]
  );

  if (update.rowCount > 0) {
    return update.rows[0];
  }

  // Check if a row exists but the payout would exceed surplus
  const existing = await pool.query(
    `SELECT * FROM hour_balances WHERE worker_id = $1 AND year = $2 AND month = $3`,
    [workerId, year, month]
  );

  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    const available = Number(row.surplus_hours) - Number(row.payout_hours);
    throw new Error(
      `Payout of ${payoutHours}h exceeds available balance of ${available}h`
    );
  }

  // No existing row — only allow insert if payout is 0 (or surplus covers it)
  if (payoutHours > 0) {
    throw new Error(
      `Payout of ${payoutHours}h exceeds available balance of 0h`
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO hour_balances (worker_id, year, month, payout_hours, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [workerId, year, month, payoutHours, note]
  );
  return rows[0];
}

export async function setInitialBalance(workerId, year, surplusHours, note) {
  const { rows } = await pool.query(
    `INSERT INTO hour_balances (worker_id, year, month, surplus_hours, note)
     VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (worker_id, year, month)
     DO UPDATE SET surplus_hours = $3, note = $4, updated_at = NOW()
     RETURNING *`,
    [workerId, year, surplusHours, note || 'Anfangssaldo']
  );
  return rows[0];
}
