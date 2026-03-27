-- 015-widen-source-column.sql
-- Widen plan_assignments.source from VARCHAR(10) to VARCHAR(20)
-- to support 'substitution' value used in sick worker redistribution.

ALTER TABLE plan_assignments ALTER COLUMN source TYPE VARCHAR(20);
