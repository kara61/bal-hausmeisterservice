import { pool } from '../../src/db/pool.js';

const SIM_WORKERS = [
  { name: 'Sim Ali',    phone: '+49SIM001', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 4, flex: true  },
  { name: 'Sim Mehmet', phone: '+49SIM002', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 4, flex: false },
  { name: 'Sim Yusuf',  phone: '+49SIM003', role: 'field',    type: 'fulltime', rate: 14.00, salary: null,   maxProps: 3, flex: true  },
  { name: 'Sim Marwa',  phone: '+49SIM004', role: 'cleaning', type: 'fulltime', rate: 14.00, salary: null,   maxProps: 3, flex: false },
  { name: 'Sim Leyla',  phone: '+49SIM005', role: 'joker',    type: 'minijob',  rate: 12.50, salary: 538.00, maxProps: 2, flex: false },
];

const SIM_PROPERTIES = [
  { address: 'Simstraße 1', city: 'Teststadt', weekday: 1, photo: true,  tasks: [{ name: 'Treppenhausreinigung', role: 'field' }] },
  { address: 'Simstraße 2', city: 'Teststadt', weekday: 1, photo: false, tasks: [{ name: 'Außenanlagen', role: 'field' }] },
  { address: 'Simstraße 3', city: 'Teststadt', weekday: 2, photo: true,  tasks: [{ name: 'Reinigung', role: 'cleaning' }] },
  { address: 'Simstraße 4', city: 'Teststadt', weekday: 3, photo: false, tasks: [{ name: 'Treppenhausreinigung', role: 'field' }] },
  { address: 'Simstraße 5', city: 'Teststadt', weekday: 4, photo: true,  tasks: [{ name: 'Grünpflege', role: 'field' }, { name: 'Mülltonnen', role: 'field' }] },
  { address: 'Simstraße 6', city: 'Teststadt', weekday: 5, photo: false, tasks: [{ name: 'Reinigung', role: 'cleaning' }] },
];

export async function seed() {
  const workers = {};
  for (const w of SIM_WORKERS) {
    const { rows } = await pool.query(
      `INSERT INTO workers (name, phone_number, worker_type, hourly_rate, monthly_salary, registration_date, vacation_entitlement, worker_role)
       VALUES ($1, $2, $3, $4, $5, '2025-01-01', 26, $6) RETURNING *`,
      [w.name, w.phone, w.type, w.rate, w.salary, w.role]
    );
    const worker = rows[0];
    workers[w.name] = worker;

    await pool.query(
      `INSERT INTO worker_preferences (worker_id, is_flex_worker, max_properties_per_day)
       VALUES ($1, $2, $3)`,
      [worker.id, w.flex, w.maxProps]
    );
  }

  const properties = {};
  for (const p of SIM_PROPERTIES) {
    const { rows } = await pool.query(
      `INSERT INTO properties (address, city, assigned_weekday, standard_tasks, is_active, photo_required)
       VALUES ($1, $2, $3, $4, true, $5) RETURNING *`,
      [p.address, p.city, p.weekday, p.tasks.map(t => t.name).join(', '), p.photo]
    );
    const prop = rows[0];
    properties[p.address] = prop;

    for (const task of p.tasks) {
      await pool.query(
        `INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type, is_active)
         VALUES ($1, $2, $3, 'property_default', true)`,
        [prop.id, task.name, task.role]
      );
    }
  }

  return { workers, properties };
}

export async function cleanup() {
  // Delete in FK-safe order using sim identifiers
  const { rows: simWorkers } = await pool.query(
    `SELECT id FROM workers WHERE phone_number LIKE '+49SIM%'`
  );
  const { rows: simProps } = await pool.query(
    `SELECT id FROM properties WHERE address LIKE 'Simstraße%'`
  );

  const wIds = simWorkers.map(w => w.id);
  const pIds = simProps.map(p => p.id);

  if (wIds.length > 0 || pIds.length > 0) {
    // Delete analytics
    if (wIds.length > 0) {
      await pool.query(`DELETE FROM analytics_daily WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM hour_balances WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM time_entries WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM sick_leave WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM conversation_state WHERE phone_number LIKE '+49SIM%'`);
    }
    if (pIds.length > 0) {
      await pool.query(`DELETE FROM analytics_property_monthly WHERE property_id = ANY($1)`, [pIds]);
    }

    // Delete plan-related data (plans that only have sim worker/property assignments)
    const { rows: simPlans } = await pool.query(
      `SELECT DISTINCT dp.id FROM daily_plans dp
       JOIN plan_assignments pa ON pa.daily_plan_id = dp.id
       WHERE pa.worker_id = ANY($1) OR pa.property_id = ANY($2)`,
      [wIds, pIds]
    );
    const planIds = simPlans.map(p => p.id);

    if (planIds.length > 0) {
      await pool.query(
        `DELETE FROM property_visit_photos WHERE property_visit_id IN (
           SELECT id FROM property_visits WHERE plan_assignment_id IN (
             SELECT id FROM plan_assignments WHERE daily_plan_id = ANY($1)))`,
        [planIds]
      );
      await pool.query(
        `DELETE FROM property_visits WHERE plan_assignment_id IN (
           SELECT id FROM plan_assignments WHERE daily_plan_id = ANY($1))`,
        [planIds]
      );
      await pool.query(`DELETE FROM plan_assignments WHERE daily_plan_id = ANY($1)`, [planIds]);
      await pool.query(`DELETE FROM daily_plans WHERE id = ANY($1)`, [planIds]);
    }

    // Delete property tasks and properties
    if (pIds.length > 0) {
      await pool.query(`DELETE FROM property_tasks WHERE property_id = ANY($1)`, [pIds]);
      await pool.query(`DELETE FROM properties WHERE id = ANY($1)`, [pIds]);
    }

    // Delete worker preferences and workers
    if (wIds.length > 0) {
      await pool.query(`DELETE FROM worker_preferences WHERE worker_id = ANY($1)`, [wIds]);
      await pool.query(`DELETE FROM workers WHERE id = ANY($1)`, [wIds]);
    }
  }
}
