-- 010-property-tasks.sql
-- Create property_tasks table and migrate existing standard_tasks data.

-- Step 1: Create property_tasks table
CREATE TABLE property_tasks (
  id                  SERIAL PRIMARY KEY,
  property_id         INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  task_name           VARCHAR(255) NOT NULL,
  worker_role         VARCHAR(20) NOT NULL CHECK (worker_role IN ('field', 'cleaning', 'office')),
  schedule_type       VARCHAR(20) NOT NULL DEFAULT 'property_default'
                      CHECK (schedule_type IN ('property_default', 'weekly', 'biweekly', 'monthly')),
  schedule_day        INTEGER,
  biweekly_start_date DATE,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_tasks_property ON property_tasks(property_id);

-- Step 2: Add worker_role column to task_assignments
ALTER TABLE task_assignments ADD COLUMN worker_role VARCHAR(20) DEFAULT 'field';

-- Step 3: Migrate existing standard_tasks data
DO $$
DECLARE
  prop RECORD;
  task_text TEXT;
  tasks TEXT[];
BEGIN
  FOR prop IN SELECT id, standard_tasks FROM properties WHERE standard_tasks IS NOT NULL AND standard_tasks != '' AND is_active = true
  LOOP
    task_text := prop.standard_tasks;

    -- Skip notes (not actual tasks)
    IF task_text ~* '^start ' THEN
      CONTINUE;
    END IF;

    -- Expand "alles" keyword
    IF task_text ~* '^alles' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES
        (prop.id, 'Treppenhausreinigung', 'field', 'property_default'),
        (prop.id, 'Außenanlage', 'field', 'property_default'),
        (prop.id, 'Mülltonnen', 'field', 'property_default');

      -- Check for extra items after "alles, "
      IF task_text ~* '^alles\s*,' THEN
        task_text := regexp_replace(task_text, '^\s*alles\s*,\s*', '', 'i');
        tasks := string_to_array(task_text, ',');
        FOR i IN 1..array_length(tasks, 1) LOOP
          INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
          VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
        END LOOP;
      END IF;

    -- "Außenanlagen und Müll"
    ELSIF task_text ~* 'Außenanlagen und Müll' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES
        (prop.id, 'Außenanlage', 'field', 'property_default'),
        (prop.id, 'Mülltonnen', 'field', 'property_default');

    -- "nur Tonnendienst"
    ELSIF task_text ~* 'nur Tonnendienst' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES (prop.id, 'Mülltonnen', 'field', 'property_default');

    -- "TH reinigen" variants
    ELSIF task_text ~* '^TH reinigen' THEN
      INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
      VALUES (prop.id, 'Treppenhausreinigung', 'field', 'property_default');

      IF task_text ~* '^TH reinigen\s*,' THEN
        task_text := regexp_replace(task_text, '^\s*TH reinigen\s*,\s*', '', 'i');
        tasks := string_to_array(task_text, ',');
        FOR i IN 1..array_length(tasks, 1) LOOP
          INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
          VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
        END LOOP;
      END IF;

    -- Fallback: comma-split any other value
    ELSE
      tasks := string_to_array(task_text, ',');
      FOR i IN 1..array_length(tasks, 1) LOOP
        INSERT INTO property_tasks (property_id, task_name, worker_role, schedule_type)
        VALUES (prop.id, trim(tasks[i]), 'field', 'property_default');
      END LOOP;
    END IF;
  END LOOP;
END $$;
