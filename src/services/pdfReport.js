import PDFDocument from 'pdfkit';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/pool.js';
import {
  calculateDailyHours,
  calculateMonthlyHours,
  calculateMonthlyHarcirah,
  splitOfficialAndUnofficial,
} from './timeCalculation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '../../uploads/reports');

const MONTH_NAMES = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export async function generateMonthlyReport(month, year) {
  mkdirSync(REPORTS_DIR, { recursive: true });

  const workers = await pool.query(
    'SELECT * FROM workers WHERE is_active = true ORDER BY name'
  );

  const entries = await pool.query(
    `SELECT * FROM time_entries
     WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
     ORDER BY worker_id, date`,
    [month, year]
  );

  const sickLeaves = await pool.query(
    `SELECT * FROM sick_leave
     WHERE EXTRACT(MONTH FROM start_date) = $1 AND EXTRACT(YEAR FROM start_date) = $2`,
    [month, year]
  );

  const vacations = await pool.query(
    'SELECT * FROM vacation_balances WHERE year = $1',
    [year]
  );

  const summaries = workers.rows.map(worker => {
    const workerEntries = entries.rows.filter(e => e.worker_id === worker.id);
    const totalHours = calculateMonthlyHours(workerEntries);
    const minijobMax = worker.worker_type === 'minijob' && worker.monthly_salary && worker.hourly_rate
      ? Number(worker.monthly_salary) / Number(worker.hourly_rate)
      : null;
    const { official, unofficial } = splitOfficialAndUnofficial(totalHours, worker.worker_type, minijobMax);
    const harcirah = calculateMonthlyHarcirah(workerEntries);

    const workerSick = sickLeaves.rows.filter(s => s.worker_id === worker.id);
    const sickDays = workerSick.reduce((sum, s) => sum + (s.aok_approved_days || s.declared_days), 0);
    const vacDeducted = workerSick.reduce((sum, s) => sum + s.vacation_deducted_days, 0);
    const unpaid = workerSick.reduce((sum, s) => sum + s.unpaid_days, 0);

    const vacBalance = vacations.rows.find(v => v.worker_id === worker.id);

    return {
      name: worker.name,
      type: worker.worker_type,
      hourlyRate: Number(worker.hourly_rate),
      officialHours: official,
      sickDays,
      vacationDeducted: vacDeducted,
      unpaidDays: unpaid,
      harcirahDays: harcirah.days,
      harcirahAmount: harcirah.amount,
      vacationRemaining: vacBalance ? vacBalance.entitlement_days - vacBalance.used_days : 0,
    };
  });

  const filename = `Gehaltsbericht_${MONTH_NAMES[month - 1]}_${year}.pdf`;
  const filepath = join(REPORTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = createWriteStream(filepath);
    doc.pipe(stream);

    doc.fontSize(20).font('Helvetica-Bold')
      .text('Bal Hausmeisterservice', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Pfaffenhofen an der Ilm', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold')
      .text(`Gehalt / Lohn Mitarbeiter — ${MONTH_NAMES[month - 1]} ${year}`, { align: 'center' });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const col = { name: 50, type: 160, hours: 220, sick: 280, vacation: 330, harcirah: 400, rate: 470 };

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Name', col.name, tableTop);
    doc.text('Typ', col.type, tableTop);
    doc.text('Std.', col.hours, tableTop);
    doc.text('Krank', col.sick, tableTop);
    doc.text('Urlaub', col.vacation, tableTop);
    doc.text('Harcirah', col.harcirah, tableTop);
    doc.text('Satz', col.rate, tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(9);

    for (const s of summaries) {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      doc.text(s.name, col.name, y, { width: 105 });
      doc.text(s.type === 'fulltime' ? 'Vollzeit' : 'Minijob', col.type, y);
      doc.text(s.officialHours.toFixed(1), col.hours, y);
      doc.text(s.sickDays > 0 ? `${s.sickDays} T` : '-', col.sick, y);
      doc.text(s.vacationDeducted > 0 ? `${s.vacationDeducted} T` : '-', col.vacation, y);
      doc.text(s.harcirahDays > 0 ? `${s.harcirahDays} T / ${s.harcirahAmount} EUR` : '-', col.harcirah, y);
      doc.text(s.hourlyRate ? `${s.hourlyRate} EUR/h` : '-', col.rate, y);

      y += 18;
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#666')
      .text(`Erstellt am ${new Date().toLocaleDateString('de-DE')} — Bal Hausmeisterservice`, 50, 780, { align: 'center' });

    doc.end();

    stream.on('finish', async () => {
      await pool.query(
        `INSERT INTO monthly_reports (month, year, generated_at, pdf_path, status)
         VALUES ($1, $2, NOW(), $3, 'draft')
         ON CONFLICT (month, year) DO UPDATE SET generated_at = NOW(), pdf_path = $3, status = 'draft'`,
        [month, year, filepath]
      );
      resolve({ filepath, filename });
    });

    stream.on('error', reject);
  });
}
