import twilio from 'twilio';
import { config } from '../config.js';

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

export async function sendWhatsAppMessage(to, body) {
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body,
  });
}

export async function sendWhatsAppButtons(to, body, buttons) {
  const actions = buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } }));
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body,
    persistentAction: actions.map(a => a.reply.title),
  });
}

export async function sendInteractiveButtons(to, bodyText, buttons) {
  return client.messages.create({
    from: config.twilio.whatsappNumber,
    to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    body: bodyText + '\n\n' + buttons.map(b => `> ${b.title}`).join('\n'),
  });
}
