import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb } from '../helpers.js';

// Mock the PDF import service for map handler
vi.mock('../../src/services/garbageScheduling.js', () => ({
  importScheduleFromPdf: vi.fn().mockResolvedValue(undefined),
}));

// Mock config so JWT verification works in tests with vi.mock
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

import summaryHandler from '../../api/_handlers/garbage/summary.js';
import upcomingHandler from '../../api/_handlers/garbage/upcoming.js';
import mapHandler from '../../api/_handlers/garbage/map.js';

describe('Garbage Summary API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(summaryHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Garbage Summary API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(summaryHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describeWithDb('Garbage Summary API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET returns empty array when no schedules exist', async () => {
    const { status, json } = await callHandler(summaryHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });
});

describe('Garbage Upcoming API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(upcomingHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Garbage Upcoming API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(upcomingHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describeWithDb('Garbage Upcoming API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET returns empty array when no upcoming schedules', async () => {
    const { status, json } = await callHandler(upcomingHandler, {
      method: 'GET',
      authenticated: true,
      query: { days: '7' },
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });
});

describe('Garbage Map API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(mapHandler, {
      method: 'POST',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Garbage Map API - method rejection', () => {
  it('rejects non-POST methods with 405', async () => {
    const { status, json } = await callHandler(mapHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Garbage Map API - validation', () => {
  it('rejects missing fields with 400', async () => {
    const { status, json } = await callHandler(mapHandler, {
      method: 'POST',
      authenticated: true,
      body: { property_id: 1 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid import request', async () => {
    const { status, json } = await callHandler(mapHandler, {
      method: 'POST',
      authenticated: true,
      body: {
        property_id: 1,
        dates: [{ date: '2026-04-01', trash_type: 'restmüll' }],
        source_pdf: 'schedule-2026.pdf',
      },
    });
    expect(status).toBe(200);
    expect(json.imported).toBe(true);
  });
});
