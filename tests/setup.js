import { pool } from '../src/db/pool.js';

// Check if database is available before running tests
let dbAvailable = false;

try {
  if (process.env.DATABASE_URL) {
    const client = await pool.connect();
    client.release();
    dbAvailable = true;
  }
} catch {
  // DB not available — integration tests will be skipped
}

export { dbAvailable };

afterAll(async () => {
  await pool.end();
});
