-- 012-unified-daily-operations.sql
-- Extend plan_assignments for task-level tracking.
-- worker_role and status are VARCHAR(20), no enum types.

-- 1. Extend daily_plans with auto-approve support
ALTER TABLE daily_plans
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scheduled_send_at TIMESTAMPTZ;

-- 2. Extend plan_assignments with task-level fields
ALTER TABLE plan_assignments
  ADD COLUMN IF NOT EXISTS task_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS worker_role VARCHAR(20),
  ADD COLUMN IF NOT EXISTS postpone_reason VARCHAR(255),
  ADD COLUMN IF NOT EXISTS postponed_to DATE,
  ADD COLUMN IF NOT EXISTS carried_from_id INTEGER REFERENCES plan_assignments(id),
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. Migrate existing 'assigned' status to 'pending'
UPDATE plan_assignments SET status = 'pending' WHERE status = 'assigned';
