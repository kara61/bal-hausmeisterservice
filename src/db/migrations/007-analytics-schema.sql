-- 007-analytics-schema.sql

CREATE TABLE IF NOT EXISTS analytics_daily (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  worker_id INTEGER REFERENCES workers(id),
  properties_completed INTEGER NOT NULL DEFAULT 0,
  properties_scheduled INTEGER NOT NULL DEFAULT 0,
  total_duration_minutes INTEGER NOT NULL DEFAULT 0,
  photos_submitted INTEGER NOT NULL DEFAULT 0,
  photos_required INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_postponed INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  check_in_time TIMESTAMPTZ,
  check_out_time TIMESTAMPTZ,
  sick_leave_declared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_daily_date ON analytics_daily(date);
CREATE INDEX idx_analytics_daily_worker ON analytics_daily(worker_id, date);
CREATE UNIQUE INDEX idx_analytics_daily_unique ON analytics_daily(date, worker_id);

CREATE TABLE IF NOT EXISTS analytics_property_monthly (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  avg_duration_minutes INTEGER,
  completion_rate NUMERIC(5,2),
  visit_count INTEGER NOT NULL DEFAULT 0,
  postponement_count INTEGER NOT NULL DEFAULT 0,
  top_worker_id INTEGER REFERENCES workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analytics_monthly_property ON analytics_property_monthly(property_id, month);
CREATE UNIQUE INDEX idx_analytics_monthly_unique ON analytics_property_monthly(month, property_id);
