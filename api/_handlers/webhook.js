import twilio from 'twilio';
import { config } from '../../src/config.js';
import { handleIncomingMessage } from '../../src/services/bot.js';
import { sendWhatsAppMessage, sendWhatsAppButtons } from '../../src/services/whatsapp.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    // Validate Twilio signature
    if (process.env.NODE_ENV !== 'test' && config.twilioAuthToken) {
      const signature = req.headers['x-twilio-signature'];
      // Use x-forwarded-* headers to reconstruct original URL (before Vercel rewrite)
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const url = `${proto}://${host}/api/webhook`;

      if (!twilio.validateRequest(config.twilioAuthToken, signature, url, req.body)) {
        return res.status(403).send('Invalid Twilio signature');
      }
    }

    const { From, Body, ButtonPayload, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

    if (!From) {
      return res.status(400).send('Missing From');
    }

    // Use ButtonPayload (from interactive button clicks) if available, otherwise Body
    const messageText = ButtonPayload || Body || '';

    const result = await handleIncomingMessage(From, messageText, {
      numMedia: parseInt(NumMedia || '0', 10),
      mediaUrl: MediaUrl0,
      mediaContentType: MediaContentType0,
    });

    // Send with buttons if the response includes them
    if (result.buttons && result.buttons.length > 0) {
      await sendWhatsAppButtons(From, result.response, result.buttons);
    } else {
      await sendWhatsAppMessage(From, result.response);
    }

    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  }
}
