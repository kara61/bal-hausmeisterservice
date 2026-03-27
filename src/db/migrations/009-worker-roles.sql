-- 009-worker-roles.sql
-- Replace is_field_worker boolean with worker_role enum.

-- Step 1: Add worker_role column
ALTER TABLE workers ADD COLUMN worker_role VARCHAR(20) DEFAULT 'office';

-- Step 2: Migrate existing data
UPDATE workers SET worker_role = 'field' WHERE is_field_worker = true;
UPDATE workers SET worker_role = 'cleaning' WHERE id = 15; -- Marwa Ahmadi

-- Step 3: Add constraints
ALTER TABLE workers ALTER COLUMN worker_role SET NOT NULL;
ALTER TABLE workers ADD CONSTRAINT workers_role_check CHECK (worker_role IN ('field', 'cleaning', 'office'));

-- Step 4: Drop old column
ALTER TABLE workers DROP COLUMN is_field_worker;
