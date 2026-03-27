-- 011-hour-balances.sql
-- Create hour_balances table for Stundenkonto tracking.

CREATE TABLE hour_balances (
  id            SERIAL PRIMARY KEY,
  worker_id     INTEGER NOT NULL REFERENCES workers(id),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  surplus_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  payout_hours  NUMERIC(6,2) NOT NULL DEFAULT 0,
  note          VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, year, month)
);

CREATE INDEX idx_hour_balances_worker ON hour_balances(worker_id);
