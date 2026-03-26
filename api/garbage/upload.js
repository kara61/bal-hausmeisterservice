import { readFile } from 'fs/promises';
import formidable from 'formidable';
import { pool } from '../../src/db/pool.js';
import { checkAuth } from '../_utils/auth.js';
import { parseAwpPdf, extractAddressFromPdf } from '../../src/services/awpParser.js';
import { importScheduleFromPdf } from '../../src/services/garbageScheduling.js';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    if (checkAuth(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
    const [fields, files] = await form.parse(req);

    const pdfFile = files.pdf?.[0];
    if (!pdfFile) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const year = parseInt(fields.year?.[0], 10);
    if (!year) {
      return res.status(400).json({ error: 'year is required' });
    }

    const pdfBuffer = await readFile(pdfFile.filepath);
    const dates = await parseAwpPdf(pdfBuffer, year);

    if (dates.length === 0) {
      return res.status(422).json({ error: 'No collection dates found in PDF' });
    }

    const sourcePdf = pdfFile.originalFilename || pdfFile.newFilename;

    // If property_id provided, import directly
    const propertyIdStr = fields.property_id?.[0];
    if (propertyIdStr) {
      const propertyId = parseInt(propertyIdStr, 10);
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
