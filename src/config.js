import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
  },
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  halilWhatsappNumber: process.env.HALIL_WHATSAPP_NUMBER,
  adminUsername: process.env.ADMIN_USERNAME || 'halil',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
};

if (!config.jwtSecret && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET environment variable is required. Set it before starting the server.');
}
