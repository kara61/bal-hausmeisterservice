-- 014-add-joker-role.sql
-- Add 'joker' to the worker_role check constraint.
-- A joker is an office worker who substitutes for sick field workers.

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_role_check;
ALTER TABLE workers ADD CONSTRAINT workers_role_check
  CHECK (worker_role IN ('field', 'cleaning', 'office', 'joker'));
