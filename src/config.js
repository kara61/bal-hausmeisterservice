import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  halilWhatsappNumber: process.env.HALIL_WHATSAPP_NUMBER,
  adminUsername: process.env.ADMIN_USERNAME || 'halil',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  missingCheckoutReminderHours: parseInt(
    process.env.MISSING_CHECKOUT_REMINDER_HOURS || '10',
    10
  ),
};
