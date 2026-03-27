-- 008-field-worker.sql
-- Add is_field_worker flag to distinguish field workers from office/admin staff.
-- Default true: all existing workers remain field workers.
ALTER TABLE workers ADD COLUMN is_field_worker BOOLEAN NOT NULL DEFAULT true;
