import cron from 'node-cron';
import { detectMissingCheckouts, flagMissingCheckout } from './anomaly.js';
import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

export function startScheduler() {
  cron.schedule('0 15-23 * * 1-5', async () => {
    const today = new Date().toISOString().split('T')[0];
    const missing = await detectMissingCheckouts(today);

    for (const entry of missing) {
      const checkInTime = new Date(entry.check_in);
      const hoursElapsed = (Date.now() - checkInTime.getTime()) / (1000 * 60 * 60);

      if (hoursElapsed >= config.missingCheckoutReminderHours) {
        await sendWhatsAppMessage(
          entry.phone_number,
          'Hast du vergessen auszuchecken? Bitte checke aus oder kontaktiere Halil.'
        );
      }
    }
  });

  cron.schedule('0 0 * * *', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const missing = await detectMissingCheckouts(yesterday);

    for (const entry of missing) {
      await flagMissingCheckout(entry.id);
    }

    if (missing.length > 0) {
      const names = missing.map(e => e.worker_name).join(', ');
      await sendWhatsAppMessage(
        config.halilWhatsappNumber,
        `${missing.length} fehlende Auschecken gestern: ${names}. Bitte im Dashboard korrigieren.`
      );
    }
  });

  console.log('Scheduler started.');
}
