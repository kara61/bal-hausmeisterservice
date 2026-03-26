CREATE TABLE IF NOT EXISTS garbage_schedules (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  trash_type VARCHAR(20) NOT NULL
    CHECK (trash_type IN ('restmuell', 'bio', 'papier', 'gelb')),
  collection_date DATE NOT NULL,
  source_pdf VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, trash_type, collection_date)
);

CREATE INDEX IF NOT EXISTS idx_garbage_schedules_date ON garbage_schedules(collection_date);
CREATE INDEX IF NOT EXISTS idx_garbage_schedules_property ON garbage_schedules(property_id);

CREATE TABLE IF NOT EXISTS garbage_tasks (
  id SERIAL PRIMARY KEY,
  garbage_schedule_id INTEGER NOT NULL REFERENCES garbage_schedules(id) ON DELETE CASCADE,
  task_type VARCHAR(10) NOT NULL CHECK (task_type IN ('raus', 'rein')),
  due_date DATE NOT NULL,
  task_assignment_id INTEGER REFERENCES task_assignments(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(garbage_schedule_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_garbage_tasks_due_date ON garbage_tasks(due_date);
