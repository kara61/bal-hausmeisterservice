import { pool } from '../db/pool.js';

export function calculateVacationEntitlement(registrationDate, year) {
  const [regYear, regMonth, regDay] = registrationDate.split('-').map(Number);
  const regDate = new Date(regYear, regMonth - 1, regDay);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  if (regDate > yearEnd) return 0;

  let totalDays = 0;

  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    if (regDate > monthEnd) continue;

    if (regDate <= monthStart) {
      totalDays += 2;
    } else {
      totalDays += 1;
    }
  }

  return totalDays;
}

export async function getVacationBalance(workerId, year) {
  const result = await pool.query(
    'SELECT * FROM vacation_balances WHERE worker_id = $1 AND year = $2',
    [workerId, year]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    remaining: row.entitlement_days - row.used_days,
  };
}

export async function ensureVacationBalance(workerId, year, entitlementDays) {
  await pool.query(
    `INSERT INTO vacation_balances (worker_id, year, entitlement_days)
     VALUES ($1, $2, $3)
     ON CONFLICT (worker_id, year) DO NOTHING`,
    [workerId, year, entitlementDays]
  );
}
