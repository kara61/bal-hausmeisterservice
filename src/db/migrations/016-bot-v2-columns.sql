-- 016-bot-v2-columns.sql
-- Add is_extra_work flag to plan_assignments for photo requirements
ALTER TABLE plan_assignments ADD COLUMN IF NOT EXISTS is_extra_work BOOLEAN DEFAULT false;

-- Add incomplete_reason to property_visits for checkout review
ALTER TABLE property_visits ADD COLUMN IF NOT EXISTS incomplete_reason TEXT;
