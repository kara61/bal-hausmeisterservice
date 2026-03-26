import { Router } from 'express';
import { handleIncomingMessage } from '../services/bot.js';
import { sendWhatsAppMessage } from '../services/whatsapp.js';

const router = Router();

router.post('/', async (req, res) => {
  const { From, Body } = req.body;

  if (!From || Body === undefined) {
    return res.status(400).send('Missing From or Body');
  }

  const result = await handleIncomingMessage(From, Body);
  await sendWhatsAppMessage(From, result.response);
  res.status(200).send('<Response></Response>');
});

export default router;
