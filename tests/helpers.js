import { describe } from 'vitest';
import { pool } from '../src/db/pool.js';
import { dbAvailable } from './setup.js';

export const describeWithDb = dbAvailable
  ? describe
  : describe.skip;

export async function cleanDb() {
  await pool.query(`
    DELETE FROM analytics_property_monthly;
    DELETE FROM analytics_daily;
    DELETE FROM property_visit_photos;
    DELETE FROM property_visits;
    DELETE FROM plan_assignments;
    DELETE FROM daily_plans;
    DELETE FROM worker_preferences;
    DELETE FROM garbage_tasks;
    DELETE FROM garbage_schedules;
    DELETE FROM conversation_state;
    DELETE FROM task_assignments;
    DELETE FROM extra_jobs;
    DELETE FROM team_members;
    DELETE FROM teams;
    DELETE FROM property_tasks;
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
    worker_role: 'field',
  };
  const w = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [w.name, w.phone_number, w.worker_type, w.hourly_rate, w.monthly_salary, w.registration_date, w.vacation_entitlement, w.worker_role]
  );
  return result.rows[0];
}

export async function createTestProperty(overrides = {}) {
  const defaults = {
    address: 'Mozartstraße 12',
    city: 'Pfaffenhofen',
    assigned_weekday: 1,
    standard_tasks: 'Treppenhausreinigung, Mülltonnen',
    is_active: true,
  };
  const p = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO properties (address, city, assigned_weekday, standard_tasks, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [p.address, p.city, p.assigned_weekday, p.standard_tasks, p.is_active]
  );
  return result.rows[0];
}

export async function createTestPropertyTask(propertyId, overrides = {}) {
  const defaults = {
    task_name: 'Treppenhausreinigung',
    worker_role: 'field',
    schedule_type: 'property_default',
    schedule_day: null,
    biweekly_start_date: null,
    is_active: true,
  };
  const t = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, schedule_day, biweekly_start_date, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [propertyId, t.task_name, t.worker_role, t.schedule_type, t.schedule_day, t.biweekly_start_date, t.is_active]
  );
  return result.rows[0];
}

export async function createTestPlan(overrides = {}) {
  const defaults = {
    plan_date: new Date().toISOString().split('T')[0],
    status: 'draft',
  };
  const p = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO daily_plans (plan_date, status) VALUES ($1, $2) RETURNING *`,
    [p.plan_date, p.status]
  );
  return result.rows[0];
}

export async function createTestAssignment(planId, workerId, propertyId, overrides = {}) {
  const defaults = {
    assignment_order: 1,
    source: 'auto',
    status: 'assigned',
  };
  const a = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO plan_assignments (daily_plan_id, worker_id, property_id, assignment_order, source, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [planId, workerId, propertyId, a.assignment_order, a.source, a.status]
  );
  return result.rows[0];
}

export async function createTestVisit(overrides = {}) {
  const defaults = {
    worker_id: null,
    property_id: null,
    plan_assignment_id: null,
    visit_date: new Date().toISOString().split('T')[0],
    status: 'assigned',
    photo_required: false,
  };
  const v = { ...defaults, ...overrides };
  const result = await pool.query(
    `INSERT INTO property_visits (plan_assignment_id, worker_id, property_id, visit_date, status, photo_required)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [v.plan_assignment_id, v.worker_id, v.property_id, v.visit_date, v.status, v.photo_required]
  );
  return result.rows[0];
}

export async function createTestVisitPhoto(visitId, photoUrl = 'https://example.com/photo.jpg') {
  const result = await pool.query(
    `INSERT INTO property_visit_photos (property_visit_id, photo_url) VALUES ($1, $2) RETURNING *`,
    [visitId, photoUrl]
  );
  return result.rows[0];
}
