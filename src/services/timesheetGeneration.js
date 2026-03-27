import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { pool } from '../db/pool.js';
import { config } from '../config.js';

let supabase;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }
  return supabase;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
];

// --- Pure helpers ---

function formatClockTime(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDuration(decimalHours) {
  if (decimalHours === 0) return '0:00';
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatTotalDuration(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}:${String(m).padStart(2, '0')}:00`;
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(day, month, year) {
  return new Date(year, month - 1, day).getDay(); // 0=Sun .. 6=Sat
}

// Pick work days for a part-time worker
function pickPartTimeWorkDays(workerId, month, year, daysPerWeek) {
  const daysInMonth = getDaysInMonth(month, year);
  // Pick consistent weekday(s) based on worker ID
  const baseDow = (workerId % 5) + 1; // 1-5 → Mon-Fri
  const preferredDays = [baseDow];
  if (daysPerWeek >= 2) preferredDays.push(((baseDow + 1) % 5) + 1);
  if (daysPerWeek >= 3) preferredDays.push(((baseDow + 3) % 5) + 1);

  const workDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = getDayOfWeek(d, month, year);
    if (preferredDays.includes(dow)) workDays.push(d);
  }
  return workDays;
}

// Pick all Mon-Fri days in the month
function pickFullTimeWorkDays(month, year) {
  const daysInMonth = getDaysInMonth(month, year);
  const workDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = getDayOfWeek(d, month, year);
    if (dow >= 1 && dow <= 5) workDays.push(d);
  }
  return workDays;
}

// Generate a single work-day entry with realistic times
function generateDayEntry(day, hours, index) {
  const startTime = index % 2 === 0 ? 7.5 : 8.0; // alternate 7:30 / 8:00

  let breakStart = null;
  let breakEnd = null;
  let breakDuration = 0;

  if (hours > 6) {
    breakStart = 12.0;
    breakDuration = 0.5; // 30 min lunch
    breakEnd = 12.5;
  }

  const endTime = startTime + hours + breakDuration;

  return {
    day,
    start: formatClockTime(startTime),
    breakStart: breakStart !== null ? formatClockTime(breakStart) : null,
    breakEnd: breakEnd !== null ? formatClockTime(breakEnd) : null,
    end: formatClockTime(endTime),
    totalHours: hours,
  };
}

// Build the full month's timesheet entries for one worker
export function generateTimesheetEntries(workerId, monthlySalary, hourlyRate, month, year) {
  const totalHours = Math.round((Number(monthlySalary) / Number(hourlyRate)) * 100) / 100;
  const daysInMonth = getDaysInMonth(month, year);

  // Choose work-day pattern
  let workDays;
  if (totalHours >= 80) {
    workDays = pickFullTimeWorkDays(month, year);
  } else {
    const avgWeeks = daysInMonth / 7;
    const hoursPerWeek = totalHours / avgWeeks;
    const daysPerWeek = hoursPerWeek <= 12 ? 1 : hoursPerWeek <= 20 ? 2 : 3;
    workDays = pickPartTimeWorkDays(workerId, month, year, daysPerWeek);
  }

  if (workDays.length === 0) return { entries: [], totalHours: 0 };

  // Distribute hours with slight variation
  const baseH = totalHours / workDays.length;
  const dayHours = workDays.map((_, i) => {
    const variation = i % 3 === 0 ? 0.5 : i % 3 === 1 ? -0.5 : 0;
    return Math.round((baseH + variation) * 2) / 2; // round to nearest 0.5
  });

  // Adjust last day so total is exact
  const sumWithout = dayHours.slice(0, -1).reduce((a, b) => a + b, 0);
  dayHours[dayHours.length - 1] = Math.round((totalHours - sumWithout) * 2) / 2;

  // Build entries for every calendar day
  const entries = [];
  let wdi = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (workDays.includes(d)) {
      entries.push(generateDayEntry(d, dayHours[wdi], wdi));
      wdi++;
    } else {
      entries.push({ day: d, start: null, breakStart: null, breakEnd: null, end: null, totalHours: 0 });
    }
  }

  return { entries, totalHours };
}

// --- PDF generation ---

function buildTimesheetPdf(worker, entries, totalHours, month, year) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const leftMargin = 40;

    // Header
    doc.fontSize(10).font('Helvetica');
    const headerY = 40;
    doc.text('Firma:', leftMargin, headerY);
    doc.font('Helvetica-Bold').text('Bal Hausmeisterservice', 160, headerY);
    doc.font('Helvetica').text('Name Mitarbeiter:', leftMargin, headerY + 18);
    doc.font('Helvetica-Bold').text(worker.name, 160, headerY + 18);
    doc.font('Helvetica').text('Monat / Jahr:', leftMargin, headerY + 36);
    doc.font('Helvetica-Bold').text(`${MONTH_SHORT[month - 1]} ${String(year).slice(-2)}`, 160, headerY + 36);

    // Table header
    const tableTop = headerY + 65;
    const col = {
      day: leftMargin,
      start: leftMargin + 55,
      breakStart: leftMargin + 145,
      breakEnd: leftMargin + 230,
      end: leftMargin + 320,
      total: leftMargin + 415,
    };
    const rowHeight = 18;

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Kal-Tag.', col.day, tableTop, { width: 50 });
    doc.text('Arbeits-Beginn', col.start, tableTop, { width: 90 });
    doc.text('Pause von', col.breakStart, tableTop, { width: 80 });
    doc.text('Pause bis', col.breakEnd, tableTop, { width: 80 });
    doc.text('Arbeitsende', col.end, tableTop, { width: 90 });
    doc.text('Total Stunden', col.total, tableTop, { width: 90 });

    // Separator line
    const lineY = tableTop + 14;
    doc.moveTo(leftMargin, lineY).lineTo(555, lineY).stroke();

    // Rows
    doc.font('Helvetica').fontSize(9);
    let y = lineY + 5;

    for (const e of entries) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }

      doc.text(`${e.day}.`, col.day, y, { width: 30, align: 'right' });

      if (e.start) {
        doc.text(e.start, col.start + 20, y);
        doc.text(e.breakStart || '', col.breakStart + 15, y);
        doc.text(e.breakEnd || '', col.breakEnd + 15, y);
        doc.text(e.end, col.end + 20, y);
        doc.text(formatDuration(e.totalHours), col.total + 30, y);
      } else {
        doc.text('0:00', col.total + 30, y);
      }

      y += rowHeight;
    }

    // Footer: Gesamtstunden
    y += 4;
    doc.moveTo(leftMargin, y).lineTo(555, y).stroke();
    y += 6;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Gesamtstunden', col.day, y);
    doc.text(formatTotalDuration(totalHours), col.total + 15, y);

    doc.end();
  });
}

// --- Main: generate timesheets for a month ---

export async function generateTimesheets(month, year) {
  // Get all active workers with salary and hourly rate
  const { rows: workers } = await pool.query(
    `SELECT id, name, hourly_rate, monthly_salary
     FROM workers
     WHERE is_active = true AND monthly_salary IS NOT NULL AND hourly_rate IS NOT NULL
     ORDER BY name`
  );

  const results = [];

  for (const worker of workers) {
    const { entries, totalHours } = generateTimesheetEntries(
      worker.id, worker.monthly_salary, worker.hourly_rate, month, year
    );

    if (entries.length === 0) continue;

    // Generate PDF
    const pdfBuffer = await buildTimesheetPdf(worker, entries, totalHours, month, year);

    // Upload to Supabase Storage
    const safeName = worker.name.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Stundenzettel_${safeName}_${MONTH_NAMES[month - 1]}_${year}.pdf`;
    const storagePath = `timesheets/${year}/${month}/${filename}`;

    const { error } = await getSupabase().storage
      .from('photos')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) throw new Error(`Timesheet upload failed for ${worker.name}: ${error.message}`);

    const { data: { publicUrl } } = getSupabase().storage
      .from('photos')
      .getPublicUrl(storagePath);

    // Upsert into worker_timesheets
    await pool.query(
      `INSERT INTO worker_timesheets (worker_id, month, year, pdf_path, total_hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (worker_id, month, year)
       DO UPDATE SET pdf_path = $4, total_hours = $5, created_at = NOW()`,
      [worker.id, month, year, publicUrl, totalHours]
    );

    results.push({ workerId: worker.id, workerName: worker.name, totalHours, filename });
  }

  return results;
}

// List timesheets for a given month/year
export async function listTimesheets(month, year) {
  const { rows } = await pool.query(
    `SELECT wt.*, w.name AS worker_name
     FROM worker_timesheets wt
     JOIN workers w ON w.id = wt.worker_id
     WHERE wt.month = $1 AND wt.year = $2
     ORDER BY w.name`,
    [month, year]
  );
  return rows;
}
