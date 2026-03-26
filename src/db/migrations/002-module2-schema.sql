CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  standard_tasks TEXT NOT NULL DEFAULT '',
  assigned_weekday INTEGER CHECK (assigned_weekday BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  UNIQUE(team_id, worker_id)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  team_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL,
  task_description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'postponed', 'carried_over')),
  photo_url VARCHAR(500),
  completed_at TIMESTAMPTZ,
  postpone_reason VARCHAR(255),
  postponed_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extra_jobs (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  address VARCHAR(255) NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  photo_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
