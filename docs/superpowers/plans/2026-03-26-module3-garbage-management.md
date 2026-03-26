# Module 3: Garbage Bin Management (Muellliste) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate garbage bin tasks from AWP PDF schedules and merge them into Module 2's daily task list. Halil uploads AWP PDFs yearly; the system parses collection dates and creates "Tonnen raus" (1 day before) and "Tonnen rein" (on collection day) tasks that appear in the existing daily view.

**Architecture:** Extends the existing backend with PDF parsing, a garbage schedule database, and a task generation service that hooks into Module 2's daily task flow. The admin dashboard gets a garbage management page for PDF uploads and schedule viewing.

**Tech Stack:** Same stack + `pdf-parse` npm package for AWP PDF extraction

---

## File Structure

### Backend (new files)
- `src/db/migrations/003-module3-schema.sql` — garbage_schedules, garbage_tasks tables
- `src/routes/garbage.js` — Garbage schedule API (upload, list, delete)
- `src/services/awpParser.js` — Parse AWP PDF files to extract collection dates
- `src/services/garbageScheduling.js` — Generate garbage tasks from schedules, merge with Module 2

### Backend (modified files)
- `src/app.js` — Register garbage route, add multipart upload middleware
- `src/services/taskScheduling.js` — Extend `generateDailyTasks` to include garbage tasks
- `src/services/scheduler.js` — Already runs daily task generation at 05:00; no changes needed (garbage tasks generated within generateDailyTasks)

### Frontend (new files)
- `client/src/pages/GarbageSchedule.jsx` — Upload PDFs, view schedules, manage mappings

### Frontend (modified files)
- `client/src/App.jsx` — Add route
- `client/src/components/Layout.jsx` — Add nav item

### Tests (new files)
- `tests/services/awpParser.test.js` — PDF parsing tests
- `tests/services/garbageScheduling.test.js` — Task generation logic tests

---

### Task 1: Install Dependencies + Database Migration

**Files:**
- Create: `src/db/migrations/003-module3-schema.sql`

- [ ] **Step 1: Install pdf-parse and multer**

```bash
npm install pdf-parse multer
```

- [ ] **Step 2: Write the migration SQL**

```sql
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
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/db/migrations/003-module3-schema.sql
git commit -m "feat: add Module 3 dependencies and database schema (garbage schedules)"
```

---

### Task 2: AWP PDF Parser Service

**Files:**
- Create: `src/services/awpParser.js`
- Create: `tests/services/awpParser.test.js`

- [ ] **Step 1: Write the AWP parser**

The AWP PDFs contain yearly collection schedules. Each PDF has a table with dates organized by month and trash type columns. The parser needs to:
1. Extract text from the PDF
2. Find dates for each trash type
3. Return an array of { trash_type, collection_date } objects

```js
// src/services/awpParser.js
import pdfParse from 'pdf-parse';

const TRASH_TYPES = ['restmuell', 'bio', 'papier', 'gelb'];

const MONTH_MAP = {
  'januar': 0, 'februar': 1, 'maerz': 2, 'märz': 2, 'april': 3,
  'mai': 4, 'juni': 5, 'juli': 6, 'august': 7,
  'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11,
};

export function parseCollectionDates(text, year) {
  const dates = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // AWP PDFs list dates in format like "Di 07.01." or "07.01."
  // Pattern: DD.MM. possibly preceded by day abbreviation
  const datePattern = /(?:Mo|Di|Mi|Do|Fr|Sa|So)?\s*(\d{1,2})\.(\d{1,2})\./g;

  // Look for trash type indicators near dates
  // Common patterns: "Restmüll", "Biomüll", "Papier", "Gelber Sack"
  const trashKeywords = {
    restmuell: /restm[uü]ll|grau|grey/i,
    bio: /biom[uü]ll|braun|brown|bio\b/i,
    papier: /papier|gr[uü]n|green|karton/i,
    gelb: /gelb|yellow|sack/i,
  };

  // Strategy: Parse all dates from the text, then try to associate with trash types
  // AWP PDFs typically have sections/columns per trash type
  let currentTrashType = null;

  for (const line of lines) {
    // Check if line indicates a trash type section
    for (const [type, pattern] of Object.entries(trashKeywords)) {
      if (pattern.test(line)) {
        currentTrashType = type;
        break;
      }
    }

    // Extract dates from this line
    let match;
    const linePattern = /(?:Mo|Di|Mi|Do|Fr|Sa|So)?\s*(\d{1,2})\.(\d{1,2})\./g;
    while ((match = linePattern.exec(line)) !== null) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // Validate the date is real
        const d = new Date(year, month - 1, day);
        if (d.getMonth() === month - 1 && d.getDate() === day) {
          dates.push({
            trash_type: currentTrashType || 'restmuell',
            collection_date: dateStr,
          });
        }
      }
    }
  }

  return dates;
}

export async function parseAwpPdf(pdfBuffer, year) {
  const data = await pdfParse(pdfBuffer);
  return parseCollectionDates(data.text, year);
}

export function extractAddressFromPdf(text) {
  // AWP PDFs typically have the address in the header
  // Look for common German address patterns
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Match patterns like "Straßenname 123" or "Str. 45"
    const addressMatch = line.match(/^([A-ZÄÖÜ][a-zäöüß]+(?:str\.|straße|weg|platz|gasse|ring|allee)[^\d]*\d+[a-z]?)/i);
    if (addressMatch) {
      return addressMatch[1].trim();
    }
  }

  return null;
}
```

- [ ] **Step 2: Write tests for pure parsing functions**

```js
// tests/services/awpParser.test.js
import { describe, it, expect } from 'vitest';
import { parseCollectionDates, extractAddressFromPdf } from '../../src/services/awpParser.js';

describe('parseCollectionDates', () => {
  it('extracts dates with trash type context', () => {
    const text = `Restmüll
Di 07.01.  Mi 22.01.  Do 06.02.
Biomüll
Fr 10.01.  Mo 27.01.`;

    const result = parseCollectionDates(text, 2026);
    expect(result).toContainEqual({ trash_type: 'restmuell', collection_date: '2026-01-07' });
    expect(result).toContainEqual({ trash_type: 'restmuell', collection_date: '2026-01-22' });
    expect(result).toContainEqual({ trash_type: 'restmuell', collection_date: '2026-02-06' });
    expect(result).toContainEqual({ trash_type: 'bio', collection_date: '2026-01-10' });
    expect(result).toContainEqual({ trash_type: 'bio', collection_date: '2026-01-27' });
  });

  it('handles dates without day abbreviation', () => {
    const text = `Gelber Sack
07.01. 21.01. 04.02.`;

    const result = parseCollectionDates(text, 2026);
    expect(result.length).toBe(3);
    expect(result[0].trash_type).toBe('gelb');
  });

  it('skips invalid dates', () => {
    const text = `Restmüll
32.01. 00.13.`;

    const result = parseCollectionDates(text, 2026);
    expect(result.length).toBe(0);
  });

  it('returns empty array for text without dates', () => {
    const result = parseCollectionDates('No dates here', 2026);
    expect(result).toEqual([]);
  });
});

describe('extractAddressFromPdf', () => {
  it('extracts a street address', () => {
    const text = `Abfallkalender 2026
Scherrerweg 5
86529 Scheyern`;
    const result = extractAddressFromPdf(text);
    expect(result).toBe('Scherrerweg 5');
  });

  it('extracts address with Straße suffix', () => {
    const text = `Marienstraße 13
Scheyern`;
    const result = extractAddressFromPdf(text);
    expect(result).toBe('Marienstraße 13');
  });

  it('returns null when no address found', () => {
    const result = extractAddressFromPdf('Just some text\nwithout an address');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/awpParser.test.js`

- [ ] **Step 4: Commit**

```bash
git add src/services/awpParser.js tests/services/awpParser.test.js
git commit -m "feat: AWP PDF parser for extracting garbage collection dates"
```

---

### Task 3: Garbage Scheduling Service

**Files:**
- Create: `src/services/garbageScheduling.js`
- Create: `tests/services/garbageScheduling.test.js`

- [ ] **Step 1: Write tests for pure functions**

```js
// tests/services/garbageScheduling.test.js
import { describe, it, expect } from 'vitest';
import { calculateRausDates, formatGarbageTaskDescription } from '../../src/services/garbageScheduling.js';

describe('calculateRausDates', () => {
  it('returns day before collection date for raus', () => {
    expect(calculateRausDates('2026-03-26')).toBe('2026-03-25');
  });

  it('handles month boundary', () => {
    expect(calculateRausDates('2026-04-01')).toBe('2026-03-31');
  });

  it('handles year boundary', () => {
    expect(calculateRausDates('2026-01-01')).toBe('2025-12-31');
  });
});

describe('formatGarbageTaskDescription', () => {
  it('formats raus task', () => {
    expect(formatGarbageTaskDescription('gelb', 'raus')).toBe('gelb Tonnen raus');
  });

  it('formats rein task', () => {
    expect(formatGarbageTaskDescription('bio', 'rein')).toBe('bio Tonnen rein');
  });

  it('formats restmuell', () => {
    expect(formatGarbageTaskDescription('restmuell', 'raus')).toBe('restmuell Tonnen raus');
  });
});
```

- [ ] **Step 2: Write the garbage scheduling service**

```js
// src/services/garbageScheduling.js
import { pool } from '../db/pool.js';

export function calculateRausDates(collectionDateStr) {
  const [y, m, d] = collectionDateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  const ry = date.getFullYear();
  const rm = String(date.getMonth() + 1).padStart(2, '0');
  const rd = String(date.getDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

export function formatGarbageTaskDescription(trashType, taskType) {
  return `${trashType} Tonnen ${taskType}`;
}

export async function importScheduleFromPdf(propertyId, dates, sourcePdf) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete existing schedule entries from this PDF source for this property
    await client.query(
      'DELETE FROM garbage_schedules WHERE property_id = $1 AND source_pdf = $2',
      [propertyId, sourcePdf]
    );

    let imported = 0;
    for (const entry of dates) {
      await client.query(
        `INSERT INTO garbage_schedules (property_id, trash_type, collection_date, source_pdf)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (property_id, trash_type, collection_date) DO UPDATE SET source_pdf = $4`,
        [propertyId, entry.trash_type, entry.collection_date, sourcePdf]
      );
      imported++;
    }

    await client.query('COMMIT');
    return imported;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function generateGarbageTasks(dateStr) {
  // Find collection dates for tomorrow (raus tasks due today)
  // and collection dates for today (rein tasks due today)
  const created = [];

  // Raus tasks: collection is tomorrow, so raus is today
  const tomorrow = new Date(
    ...dateStr.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v))
  );
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const rausSchedules = await pool.query(
    `SELECT gs.*, p.address, p.city
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = $1`,
    [tomorrowStr]
  );

  for (const schedule of rausSchedules.rows) {
    // Check if garbage task already exists
    const exists = await pool.query(
      'SELECT id FROM garbage_tasks WHERE garbage_schedule_id = $1 AND task_type = $2',
      [schedule.id, 'raus']
    );
    if (exists.rows.length > 0) continue;

    const desc = formatGarbageTaskDescription(schedule.trash_type, 'raus');

    // Try to merge with existing task_assignment for this property on this date
    const existingTask = await pool.query(
      'SELECT id, task_description FROM task_assignments WHERE property_id = $1 AND date = $2 LIMIT 1',
      [schedule.property_id, dateStr]
    );

    let taskAssignmentId = null;
    if (existingTask.rows.length > 0) {
      // Append garbage info to existing task description
      const newDesc = existingTask.rows[0].task_description
        ? `${existingTask.rows[0].task_description} + ${desc}`
        : desc;
      await pool.query(
        'UPDATE task_assignments SET task_description = $1, updated_at = NOW() WHERE id = $2',
        [newDesc, existingTask.rows[0].id]
      );
      taskAssignmentId = existingTask.rows[0].id;
    } else {
      // Create standalone task assignment for the garbage task
      const newTask = await pool.query(
        `INSERT INTO task_assignments (property_id, date, task_description, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [schedule.property_id, dateStr, desc]
      );
      taskAssignmentId = newTask.rows[0].id;
    }

    const gt = await pool.query(
      `INSERT INTO garbage_tasks (garbage_schedule_id, task_type, due_date, task_assignment_id)
       VALUES ($1, 'raus', $2, $3) RETURNING *`,
      [schedule.id, dateStr, taskAssignmentId]
    );
    created.push(gt.rows[0]);
  }

  // Rein tasks: collection is today, so rein is today
  const reinSchedules = await pool.query(
    `SELECT gs.*, p.address, p.city
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date = $1`,
    [dateStr]
  );

  for (const schedule of reinSchedules.rows) {
    const exists = await pool.query(
      'SELECT id FROM garbage_tasks WHERE garbage_schedule_id = $1 AND task_type = $2',
      [schedule.id, 'rein']
    );
    if (exists.rows.length > 0) continue;

    const desc = formatGarbageTaskDescription(schedule.trash_type, 'rein');

    const existingTask = await pool.query(
      'SELECT id, task_description FROM task_assignments WHERE property_id = $1 AND date = $2 LIMIT 1',
      [schedule.property_id, dateStr]
    );

    let taskAssignmentId = null;
    if (existingTask.rows.length > 0) {
      const newDesc = existingTask.rows[0].task_description
        ? `${existingTask.rows[0].task_description} + ${desc}`
        : desc;
      await pool.query(
        'UPDATE task_assignments SET task_description = $1, updated_at = NOW() WHERE id = $2',
        [newDesc, existingTask.rows[0].id]
      );
      taskAssignmentId = existingTask.rows[0].id;
    } else {
      const newTask = await pool.query(
        `INSERT INTO task_assignments (property_id, date, task_description, status)
         VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [schedule.property_id, dateStr, desc]
      );
      taskAssignmentId = newTask.rows[0].id;
    }

    const gt = await pool.query(
      `INSERT INTO garbage_tasks (garbage_schedule_id, task_type, due_date, task_assignment_id)
       VALUES ($1, 'rein', $2, $3) RETURNING *`,
      [schedule.id, dateStr, taskAssignmentId]
    );
    created.push(gt.rows[0]);
  }

  return created;
}

export async function getScheduleForProperty(propertyId) {
  const result = await pool.query(
    `SELECT * FROM garbage_schedules
     WHERE property_id = $1
     ORDER BY collection_date, trash_type`,
    [propertyId]
  );
  return result.rows;
}

export async function deleteScheduleForProperty(propertyId, sourcePdf = null) {
  if (sourcePdf) {
    await pool.query(
      'DELETE FROM garbage_schedules WHERE property_id = $1 AND source_pdf = $2',
      [propertyId, sourcePdf]
    );
  } else {
    await pool.query('DELETE FROM garbage_schedules WHERE property_id = $1', [propertyId]);
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/services/garbageScheduling.test.js`

- [ ] **Step 4: Commit**

```bash
git add src/services/garbageScheduling.js tests/services/garbageScheduling.test.js
git commit -m "feat: garbage scheduling service with task generation and Module 2 integration"
```

---

### Task 4: Garbage API Routes

**Files:**
- Create: `src/routes/garbage.js`
- Modify: `src/app.js`

- [ ] **Step 1: Write the garbage routes**

```js
// src/routes/garbage.js
import { Router } from 'express';
import multer from 'multer';
import { readFile } from 'fs/promises';
import { pool } from '../db/pool.js';
import { parseAwpPdf, extractAddressFromPdf } from '../services/awpParser.js';
import {
  importScheduleFromPdf,
  getScheduleForProperty,
  deleteScheduleForProperty,
  generateGarbageTasks,
} from '../services/garbageScheduling.js';

const router = Router();
const upload = multer({ dest: 'uploads/awp/' });

// Upload and parse an AWP PDF
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' });

  const { property_id, year } = req.body;
  if (!year) return res.status(400).json({ error: 'year required' });

  const pdfBuffer = await readFile(req.file.path);
  const pdfParse = await import('pdf-parse');
  const pdfData = await pdfParse.default(pdfBuffer);

  const { parseCollectionDates, extractAddressFromPdf: extractAddr } = await import('../services/awpParser.js');
  const dates = parseCollectionDates(pdfData.text, parseInt(year));
  const extractedAddress = extractAddr(pdfData.text);

  if (property_id) {
    // Direct mapping to a property
    const imported = await importScheduleFromPdf(
      parseInt(property_id), dates, req.file.originalname
    );
    return res.json({
      message: `${imported} dates imported`,
      extracted_address: extractedAddress,
      dates_count: dates.length,
    });
  }

  // Try auto-matching by address
  if (extractedAddress) {
    const match = await pool.query(
      'SELECT id, address, city FROM properties WHERE address ILIKE $1 AND is_active = true',
      [`%${extractedAddress}%`]
    );

    if (match.rows.length === 1) {
      const imported = await importScheduleFromPdf(
        match.rows[0].id, dates, req.file.originalname
      );
      return res.json({
        message: `${imported} dates imported, auto-matched to ${match.rows[0].address}, ${match.rows[0].city}`,
        property_id: match.rows[0].id,
        dates_count: dates.length,
      });
    }
  }

  // Could not auto-match — return dates for manual mapping
  res.json({
    message: 'PDF parsed but property not matched. Please provide property_id.',
    extracted_address: extractedAddress,
    dates_count: dates.length,
    needs_mapping: true,
    dates_preview: dates.slice(0, 10),
  });
});

// Map a previously uploaded PDF to a property
router.post('/map', async (req, res) => {
  const { property_id, dates, source_pdf } = req.body;
  if (!property_id || !dates || !source_pdf) {
    return res.status(400).json({ error: 'property_id, dates, and source_pdf required' });
  }
  const imported = await importScheduleFromPdf(property_id, dates, source_pdf);
  res.json({ message: `${imported} dates imported` });
});

// Get garbage schedule for a property
router.get('/schedule/:propertyId', async (req, res) => {
  const schedule = await getScheduleForProperty(parseInt(req.params.propertyId));
  res.json(schedule);
});

// Get all schedules with upcoming dates
router.get('/upcoming', async (req, res) => {
  const { days } = req.query;
  const daysAhead = parseInt(days) || 7;
  const result = await pool.query(
    `SELECT gs.*, p.address, p.city
     FROM garbage_schedules gs
     JOIN properties p ON p.id = gs.property_id
     WHERE gs.collection_date >= CURRENT_DATE
       AND gs.collection_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
     ORDER BY gs.collection_date, p.address`,
    [daysAhead]
  );
  res.json(result.rows);
});

// Generate garbage tasks for a date
router.post('/generate', async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const created = await generateGarbageTasks(date);
  res.json({ message: `${created.length} garbage tasks generated`, tasks: created });
});

// Delete schedule for a property
router.delete('/schedule/:propertyId', async (req, res) => {
  await deleteScheduleForProperty(parseInt(req.params.propertyId));
  res.json({ message: 'Schedule deleted' });
});

// Get summary of imported schedules per property
router.get('/summary', async (req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.address, p.city,
       COUNT(DISTINCT gs.id) AS total_dates,
       COUNT(DISTINCT gs.trash_type) AS trash_types,
       MIN(gs.collection_date) AS first_date,
       MAX(gs.collection_date) AS last_date,
       array_agg(DISTINCT gs.source_pdf) AS source_pdfs
     FROM properties p
     LEFT JOIN garbage_schedules gs ON gs.property_id = p.id
     WHERE p.is_active = true
     GROUP BY p.id, p.address, p.city
     HAVING COUNT(gs.id) > 0
     ORDER BY p.city, p.address`
  );
  res.json(result.rows);
});

export default router;
```

- [ ] **Step 2: Register route in app.js**

Add import:
```js
import garbageRouter from './routes/garbage.js';
```

Add route:
```js
app.use('/api/garbage', requireAuth, garbageRouter);
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/garbage.js src/app.js
git commit -m "feat: garbage schedule API with PDF upload, auto-matching, and task generation"
```

---

### Task 5: Integrate Garbage Tasks with Daily Task Generation

**Files:**
- Modify: `src/services/taskScheduling.js`

- [ ] **Step 1: Extend generateDailyTasks to include garbage tasks**

Add import at top of `src/services/taskScheduling.js`:
```js
import { generateGarbageTasks } from './garbageScheduling.js';
```

At the end of the `generateDailyTasks` function, after the regular task generation loop, add:
```js
  // Generate garbage tasks for the day
  const garbageTasks = await generateGarbageTasks(dateStr);

  return [...created, ...garbageTasks.map(gt => ({ ...gt, is_garbage: true }))];
```

- [ ] **Step 2: Commit**

```bash
git add src/services/taskScheduling.js
git commit -m "feat: integrate garbage task generation into daily task workflow"
```

---

### Task 6: Garbage Schedule Admin Page

**Files:**
- Create: `client/src/pages/GarbageSchedule.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx`

- [ ] **Step 1: Write the GarbageSchedule page**

```jsx
// client/src/pages/GarbageSchedule.jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';

const TRASH_LABELS = {
  restmuell: 'Restmuell (grau)',
  bio: 'Biomuell (braun)',
  papier: 'Papier (gruen)',
  gelb: 'Gelber Sack',
};

export default function GarbageSchedule() {
  const [summary, setSummary] = useState([]);
  const [properties, setProperties] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [uploadResult, setUploadResult] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [viewingProperty, setViewingProperty] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [s, p] = await Promise.all([
      api.get('/garbage/summary'),
      api.get('/properties'),
    ]);
    setSummary(s);
    setProperties(p);
  }

  async function handleUpload(e) {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    if (!fileInput.files[0]) return;

    setUploading(true);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('pdf', fileInput.files[0]);
    formData.append('year', year);
    if (selectedProperty) formData.append('property_id', selectedProperty);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/garbage/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      setUploadResult(data);
      loadData();
    } catch (err) {
      setUploadResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function viewSchedule(propertyId) {
    const data = await api.get(`/garbage/schedule/${propertyId}`);
    setSchedule(data);
    setViewingProperty(propertyId);
  }

  async function deleteSchedule(propertyId) {
    if (!confirm('Muellplan fuer dieses Objekt wirklich loeschen?')) return;
    await api.delete(`/garbage/schedule/${propertyId}`);
    setSchedule(null);
    setViewingProperty(null);
    loadData();
  }

  return (
    <div>
      <h1>Muellplan (AWP)</h1>

      {/* Upload section */}
      <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f7fafc', borderRadius: '6px' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>AWP PDF hochladen</h2>
        <form onSubmit={handleUpload} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            PDF-Datei
            <input type="file" accept=".pdf" required />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Jahr
            <input value={year} onChange={e => setYear(e.target.value)}
              style={{ padding: '0.4rem', width: '80px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            Objekt (optional)
            <select value={selectedProperty} onChange={e => setSelectedProperty(e.target.value)}
              style={{ padding: '0.4rem' }}>
              <option value="">-- Auto-Erkennung --</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.address}, {p.city}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={uploading} style={{
            padding: '0.5rem 1rem', background: '#2b6cb0', color: 'white',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>{uploading ? 'Wird hochgeladen...' : 'Hochladen'}</button>
        </form>
        {uploadResult && (
          <div style={{
            marginTop: '0.75rem', padding: '0.5rem',
            background: uploadResult.error ? '#fed7d7' : '#c6f6d5',
            borderRadius: '4px', fontSize: '0.9rem',
          }}>
            {uploadResult.error || uploadResult.message}
            {uploadResult.needs_mapping && (
              <div style={{ marginTop: '0.5rem', color: '#e53e3e' }}>
                Adresse nicht erkannt: {uploadResult.extracted_address || 'unbekannt'}.
                Bitte Objekt manuell auswaehlen und erneut hochladen.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary table */}
      <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Importierte Plaene</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Objekt</th>
            <th style={{ padding: '0.5rem' }}>Termine</th>
            <th style={{ padding: '0.5rem' }}>Muellarten</th>
            <th style={{ padding: '0.5rem' }}>Zeitraum</th>
            <th style={{ padding: '0.5rem' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {summary.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.5rem' }}>{s.address}, {s.city}</td>
              <td style={{ padding: '0.5rem' }}>{s.total_dates}</td>
              <td style={{ padding: '0.5rem' }}>{s.trash_types}</td>
              <td style={{ padding: '0.5rem' }}>
                {s.first_date && new Date(s.first_date).toLocaleDateString('de-DE')}
                {' — '}
                {s.last_date && new Date(s.last_date).toLocaleDateString('de-DE')}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <button onClick={() => viewSchedule(s.id)}
                  style={{ marginRight: '0.5rem', cursor: 'pointer' }}>Anzeigen</button>
                <button onClick={() => deleteSchedule(s.id)}
                  style={{ color: 'red', cursor: 'pointer' }}>Loeschen</button>
              </td>
            </tr>
          ))}
          {summary.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
              Noch keine Muellplaene importiert. Laden Sie AWP PDFs hoch.
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Detail view */}
      {viewingProperty && schedule && (
        <div style={{ padding: '1rem', background: '#f7fafc', borderRadius: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Termine</h2>
            <button onClick={() => { setViewingProperty(null); setSchedule(null); }}
              style={{ cursor: 'pointer' }}>Schliessen</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {schedule.map(s => (
              <div key={s.id} style={{
                padding: '0.4rem 0.6rem', background: 'white', borderRadius: '4px',
                border: '1px solid #e2e8f0', fontSize: '0.85rem',
              }}>
                <span style={{ fontWeight: 'bold' }}>
                  {new Date(s.collection_date).toLocaleDateString('de-DE')}
                </span>
                {' — '}{TRASH_LABELS[s.trash_type] || s.trash_type}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add route and nav**

In `client/src/App.jsx`:
```jsx
import GarbageSchedule from './pages/GarbageSchedule';
// Add route:
<Route path="garbage" element={<GarbageSchedule />} />
```

In `client/src/components/Layout.jsx` navItems:
```js
{ path: '/garbage', label: 'Muellplan' },
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/GarbageSchedule.jsx client/src/App.jsx client/src/components/Layout.jsx
git commit -m "feat: garbage schedule admin page with PDF upload and schedule viewing"
```

---

### Task 7: Final Integration + Tests

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All pure-function tests pass. DB-dependent tests fail with ECONNREFUSED.

- [ ] **Step 2: Verify file structure**

All Module 3 files should exist:
- src/db/migrations/003-module3-schema.sql
- src/services/awpParser.js
- src/services/garbageScheduling.js
- src/routes/garbage.js
- client/src/pages/GarbageSchedule.jsx
- tests/services/awpParser.test.js
- tests/services/garbageScheduling.test.js

- [ ] **Step 3: Verify app.js has garbage route**

- [ ] **Step 4: Verify Layout.jsx has Muellplan nav item**

- [ ] **Step 5: Add uploads/awp to .gitignore**

Append to .gitignore:
```
uploads/
```

- [ ] **Step 6: Final commit if needed**

```bash
git add -A
git commit -m "feat: Module 3 (Garbage Bin Management) complete"
```

---

## Spec Coverage Checklist

| Requirement | Task |
|---|---|
| AWP PDF parsing (28 PDFs, 4 trash types) | Task 2 |
| Extract exact dates from PDFs (no frequency assumptions) | Task 2 |
| Store dates mapped to properties | Task 3 |
| Auto-match PDF address to property | Task 4 |
| Manual mapping when auto-match fails | Task 4, 6 |
| Tonnen raus (1 day before collection) | Task 3 |
| Tonnen rein (on collection day) | Task 3 |
| Merge garbage tasks into Module 2 daily task list | Task 3, 5 |
| Garbage tasks appear as part of property entry | Task 3, 5 |
| Unassigned garbage tasks shown in dashboard | Task 5 (via Module 2 daily view) |
| No photo required for garbage tasks | Built-in (no special handling needed) |
| Yearly PDF upload flow | Task 4, 6 |
| Replace schedule on new year upload | Task 3 |
| Admin page for upload and viewing | Task 6 |
