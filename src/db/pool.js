import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
});
