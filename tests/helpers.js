import { pool } from '../src/db/pool.js';

export async function cleanDb() {
  await pool.query(`
    DELETE FROM task_assignments;
    DELETE FROM extra_jobs;
    DELETE FROM team_members;
    DELETE FROM teams;
    DELETE FROM properties;
    DELETE FROM monthly_reports;
    DELETE FROM sick_leave;
    DELETE FROM time_entries;
    DELETE FROM vacation_balances;
    DELETE FROM workers;
  `);
}

export async function createTestWorker(overrides = {}) {
  const defaults = {
    name: 'Test Worker',
    phone_number: '+4917612345678',
    worker_type: 'fulltime',
    hourly_rate: 14.0,
    monthly_salary: null,
    registration_date: '2025-01-01',
    vacation_entitlement: 26,
  };
  const w = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [w.name, w.phone_number, w.worker_type, w.hourly_rate, w.monthly_salary, w.registration_date, w.vacation_entitlement]
  );
  return result.rows[0];
}
