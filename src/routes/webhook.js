import { Router } from 'express';
import twilio from 'twilio';
import { config } from '../config.js';
import { handleIncomingMessage } from '../services/bot.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = Router();

// Validate Twilio signature in production
const validateTwilio = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') return next();
  if (!config.twilioAuthToken) return next();

  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  if (twilio.validateRequest(config.twilioAuthToken, signature, url, req.body)) {
    next();
  } else {
    res.status(403).send('Invalid Twilio signature');
  }
};

router.post('/', validateTwilio, async (req, res) => {
  const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body;

  if (!From) {
    return res.status(400).send('Missing From');
  }

  const result = await handleIncomingMessage(From, Body || '', {
    numMedia: parseInt(NumMedia || '0', 10),
    mediaUrl: MediaUrl0,
    mediaContentType: MediaContentType0,
  });
  await sendWhatsAppMessage(From, result.response);
  res.status(200).send('<Response></Response>');
});

export default router;
