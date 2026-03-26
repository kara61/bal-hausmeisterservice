import { sendWhatsAppMessage } from './whatsapp.js';
import { config } from '../config.js';

export async function notifyHalilSickDeclaration(workerName, days) {
  const dayText = days > 0 ? `${days} Tage` : 'unbestimmte Zeit';
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `Krankmeldung: ${workerName} hat sich fuer ${dayText} krank gemeldet.\n\n> OK\n> Bearbeiten`
  );
}

export async function notifyHalilMissingCheckouts(entries) {
  if (entries.length === 0) return;
  const names = entries.map(e => e.worker_name).join(', ');
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `${entries.length} fehlende Auschecken: ${names}.\nBitte im Dashboard korrigieren.`
  );
}

export async function notifyHalilReportReady(month, year) {
  const monthNames = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  await sendWhatsAppMessage(
    config.halilWhatsappNumber,
    `Monatsbericht fuer ${monthNames[month - 1]} ${year} ist bereit zur Pruefung.\n\n> OK\n> Bearbeiten`
  );
}

export async function notifyHalilAnomaly(message) {
  await sendWhatsAppMessage(config.halilWhatsappNumber, `Anomalie: ${message}`);
}
