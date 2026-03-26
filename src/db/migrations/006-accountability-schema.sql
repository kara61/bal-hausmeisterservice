-- 006-accountability-schema.sql
-- Worker Accountability Flow: property visits with photo evidence

-- Add photo_required flag to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS photo_required BOOLEAN NOT NULL DEFAULT false;

-- Track each property visit (arrival, completion, duration)
CREATE TABLE property_visits (
  id SERIAL PRIMARY KEY,
  plan_assignment_id INTEGER REFERENCES plan_assignments(id),
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  property_id INTEGER NOT NULL REFERENCES properties(id),
  visit_date DATE NOT NULL,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  photo_required BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'assigned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_property_visits_date ON property_visits(visit_date);
CREATE INDEX idx_property_visits_worker ON property_visits(worker_id, visit_date);
CREATE INDEX idx_property_visits_assignment ON property_visits(plan_assignment_id);

-- Photo evidence linked to visits
CREATE TABLE property_visit_photos (
  id SERIAL PRIMARY KEY,
  property_visit_id INTEGER NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  caption TEXT
);
