// api/_handlers/cron/checkout-final.js
import { pool } from '../../../src/db/pool.js';
import { sendWhatsAppButtons } from '../../../src/services/whatsapp.js';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    const { rows: workers } = await pool.query(
      `SELECT w.phone_number FROM time_entries te
       JOIN workers w ON w.id = te.worker_id
       WHERE te.date = $1 AND te.check_in IS NOT NULL AND te.check_out IS NULL`,
      [today]
    );

    let reminded = 0;
    for (const w of workers) {
      await sendWhatsAppButtons(
        w.phone_number,
        'Du bist noch eingecheckt! Bitte auschecken.',
        [{ id: 'auschecken', title: 'Auschecken' }]
      );
      reminded++;
    }

    res.json({ ok: true, reminded });
  } catch (err) {
    console.error('Checkout final cron error:', err);
    res.status(500).json({ error: 'Cron failed' });
  }
}
