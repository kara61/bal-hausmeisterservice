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

// POST /upload — upload PDF, parse, auto-match or return needs_mapping
router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const year = parseInt(req.body.year, 10);
    if (!year) {
      return res.status(400).json({ error: 'year is required' });
    }

    const pdfBuffer = await readFile(req.file.path);
    const dates = await parseAwpPdf(pdfBuffer, year);

    if (dates.length === 0) {
      return res.status(422).json({ error: 'No collection dates found in PDF' });
    }

    const sourcePdf = req.file.originalname || req.file.filename;

    // If property_id provided, import directly
    if (req.body.property_id) {
      const propertyId = parseInt(req.body.property_id, 10);
      await importScheduleFromPdf(propertyId, dates, sourcePdf);
      return res.json({ imported: true, property_id: propertyId, dates_count: dates.length });
    }

    // Try auto-match by extracted address
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(pdfBuffer);
    const extractedAddress = extractAddressFromPdf(pdfData.text);

    if (extractedAddress) {
      const { rows } = await pool.query(
        `SELECT id, address, city FROM properties WHERE address ILIKE $1 LIMIT 1`,
        [`%${extractedAddress}%`]
      );

      if (rows.length > 0) {
        const property = rows[0];
        await importScheduleFromPdf(property.id, dates, sourcePdf);
        return res.json({
          imported: true,
          property_id: property.id,
          property_address: property.address,
          dates_count: dates.length,
          auto_matched: true,
        });
      }
    }

    // No match — return needs_mapping
    return res.json({
      needs_mapping: true,
      extracted_address: extractedAddress,
      dates_preview: dates.slice(0, 10),
      total_dates: dates.length,
      source_pdf: sourcePdf,
      dates,
    });
  } catch (err) {
    next(err);
  }
});

// POST /map — manual mapping
router.post('/map', async (req, res, next) => {
  try {
    const { property_id, dates, source_pdf } = req.body;

    if (!property_id || !dates || !source_pdf) {
      return res.status(400).json({ error: 'property_id, dates, and source_pdf are required' });
    }

    await importScheduleFromPdf(property_id, dates, source_pdf);
    res.json({ imported: true, property_id, dates_count: dates.length });
  } catch (err) {
    next(err);
  }
});

// GET /schedule/:propertyId — get schedule for a property
router.get('/schedule/:propertyId', async (req, res, next) => {
  try {
    const propertyId = parseInt(req.params.propertyId, 10);
    const schedule = await getScheduleForProperty(propertyId);
    res.json(schedule);
  } catch (err) {
    next(err);
  }
});

// GET /upcoming?days=7 — get upcoming collection dates
router.get('/upcoming', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const { rows } = await pool.query(
      `SELECT gs.*, p.address, p.city
       FROM garbage_schedules gs
       JOIN properties p ON p.id = gs.property_id
       WHERE gs.collection_date >= CURRENT_DATE
         AND gs.collection_date < CURRENT_DATE + $1 * INTERVAL '1 day'
       ORDER BY gs.collection_date, p.address`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /generate — generate garbage tasks for a date
router.post('/generate', async (req, res, next) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    const tasks = await generateGarbageTasks(date);
    res.json({ generated: true, date, tasks });
  } catch (err) {
    next(err);
  }
});

// DELETE /schedule/:propertyId — delete all schedules for a property
router.delete('/schedule/:propertyId', async (req, res, next) => {
  try {
    const propertyId = parseInt(req.params.propertyId, 10);
    await deleteScheduleForProperty(propertyId);
    res.json({ deleted: true, property_id: propertyId });
  } catch (err) {
    next(err);
  }
});

// GET /summary — aggregate schedule info per property
router.get('/summary', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         gs.property_id,
         p.address,
         p.city,
         COUNT(*)::int AS total_dates,
         array_agg(DISTINCT gs.trash_type) AS trash_types,
         MIN(gs.collection_date) AS earliest_date,
         MAX(gs.collection_date) AS latest_date,
         array_agg(DISTINCT gs.source_pdf) AS source_pdfs
       FROM garbage_schedules gs
       JOIN properties p ON p.id = gs.property_id
       GROUP BY gs.property_id, p.address, p.city
       ORDER BY p.address`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
