import { config } from 'dotenv';
config({ path: '.env.test' });

import { pool } from '../src/db/pool.js';
import { seed, cleanup } from './sim/seed.js';
import { Report } from './sim/report.js';
import scenario1 from './sim/scenarios/scenario1.js';

const REPORT_PATH = 'docs/simulation/results.md';

async function main() {
  console.log('Day Simulation — Bal Hausmeisterservice');
  console.log('Database:', process.env.DATABASE_URL);
  console.log('');

  const report = new Report();
  let data;

  try {
    // Setup
    console.log('Seeding test data...');
    await cleanup(); // Clean any leftover sim data
    data = await seed();
    console.log(`Seeded ${Object.keys(data.workers).length} workers, ${Object.keys(data.properties).length} properties`);

    // Run scenarios
    await scenario1(report, data);

  } catch (err) {
    console.error('\nFATAL ERROR:', err);
  } finally {
    // Cleanup
    console.log('\nCleaning up simulation data...');
    await cleanup();
    await pool.end();
  }

  // Write report
  const { mkdirSync } = await import('fs');
  mkdirSync('docs/simulation', { recursive: true });
  const failures = report.writeReport(REPORT_PATH);
  process.exit(failures > 0 ? 1 : 0);
}

main();
