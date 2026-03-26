-- Migration 005: Daily Plans for Smart Daily Planner
-- Creates tables for daily plan generation, assignments, and worker preferences

CREATE TABLE daily_plans (
  id SERIAL PRIMARY KEY,
  plan_date DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by VARCHAR(50)
);

CREATE TABLE plan_assignments (
  id SERIAL PRIMARY KEY,
  daily_plan_id INTEGER NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  assignment_order INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(10) NOT NULL DEFAULT 'auto',
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_preferences (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id) UNIQUE,
  is_flex_worker BOOLEAN NOT NULL DEFAULT false,
  max_properties_per_day INTEGER NOT NULL DEFAULT 4,
  preferred_properties INTEGER[] DEFAULT '{}'
);

CREATE INDEX idx_daily_plans_date ON daily_plans(plan_date);
CREATE INDEX idx_plan_assignments_plan ON plan_assignments(daily_plan_id);
CREATE INDEX idx_plan_assignments_worker ON plan_assignments(worker_id);
