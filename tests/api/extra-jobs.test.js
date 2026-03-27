import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';
import { pool } from '../../src/db/pool.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock the notification service to avoid side effects
vi.mock('../../src/services/taskNotifications.js', () => ({
  notifyTeamNewExtraJob: vi.fn().mockResolvedValue(undefined),
}));

import handler from '../../api/_handlers/extra-jobs/index.js';

describe('Extra Jobs API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describeWithDb('Extra Jobs API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('rejects unsupported methods with 405', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'DELETE',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });

  it('GET returns empty array when no extra jobs exist', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('POST rejects missing fields with 400', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { description: 'Fix roof' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('POST creates an extra job with valid data', async () => {
    const worker = await createTestWorker({ name: 'TeamWorker', phone_number: '+4917600000099' });
    const teamResult = await pool.query(
      `INSERT INTO teams (date, name) VALUES ($1, $2) RETURNING *`,
      ['2026-03-27', 'Test Team']
    );
    const team = teamResult.rows[0];
    await pool.query(
      `INSERT INTO team_members (team_id, worker_id) VALUES ($1, $2)`,
      [team.id, worker.id]
    );

    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        description: 'Fix roof',
        address: 'Dachstr 1',
        team_id: team.id,
        date: '2026-03-27',
      },
    });
    expect(status).toBe(201);
    expect(json.description).toBe('Fix roof');
    expect(json.id).toBeDefined();
  });
});
