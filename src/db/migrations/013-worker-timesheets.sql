-- 013-worker-timesheets.sql
-- Store generated worker timesheets (Stundenzettel) per month.

CREATE TABLE IF NOT EXISTS worker_timesheets (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  pdf_path VARCHAR(500),
  total_hours NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, month, year)
);
