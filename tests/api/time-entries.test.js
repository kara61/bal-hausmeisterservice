import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

// Mock config so JWT verification works for non-DB tests
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

import handler from '../../api/_handlers/time-entries/index.js';
import flaggedHandler from '../../api/_handlers/time-entries/flagged.js';

describe('Time Entries API - BUG-012 validation', () => {
  it('rejects month 0', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { month: '0', year: '2026' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects month 13', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { month: '13', year: '2026' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects non-numeric month', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { month: 'abc', year: '2026' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects year without month', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { year: '2026' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects month without year', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { month: '3' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

describe('Time Entries API - auth', () => {
  it('rejects unauthenticated GET with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toBeDefined();
  });

  it('rejects unauthenticated GET /flagged with 401', async () => {
    const { status, json } = await callHandler(flaggedHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toBeDefined();
  });
});

describeWithDb('Time Entries API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET with date range query returns 200 and array', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { month: '3', year: '2026' },
    });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it('POST returns 405 method not allowed', async () => {
    const worker = await createTestWorker();
    const { status } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        worker_id: worker.id,
        date: '2026-03-27',
        hours: 8,
      },
    });
    expect(status).toBe(405);
  });

  it('GET /flagged returns 200 and array', async () => {
    const { status, json } = await callHandler(flaggedHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });
});
