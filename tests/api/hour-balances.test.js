import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock the hourBalance service
vi.mock('../../src/services/hourBalance.js', () => ({
  getWorkerBalances: vi.fn().mockResolvedValue([]),
  syncMonthForAll: vi.fn().mockResolvedValue({ synced: 0 }),
  recordPayout: vi.fn().mockResolvedValue({ id: 1 }),
  setInitialBalance: vi.fn().mockResolvedValue({ id: 1 }),
}));

import indexHandler from '../../api/_handlers/hour-balances/index.js';
import syncHandler from '../../api/_handlers/hour-balances/sync.js';
import payoutHandler from '../../api/_handlers/hour-balances/payout.js';
import initialHandler from '../../api/_handlers/hour-balances/initial.js';

describe('Hour Balances Index API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Hour Balances Index API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Hour Balances Index API - happy path', () => {
  it('GET returns balances', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });
});

describe('Hour Balances Sync API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(syncHandler, {
      method: 'POST',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Hour Balances Sync API - method rejection', () => {
  it('rejects non-POST methods with 405', async () => {
    const { status, json } = await callHandler(syncHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Hour Balances Sync API - validation', () => {
  it('rejects missing year/month with 400', async () => {
    const { status, json } = await callHandler(syncHandler, {
      method: 'POST',
      authenticated: true,
      body: { year: 2026 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid sync request', async () => {
    const { status, json } = await callHandler(syncHandler, {
      method: 'POST',
      authenticated: true,
      body: { year: 2026, month: 3 },
    });
    expect(status).toBe(200);
    expect(json).toEqual({ synced: 0 });
  });
});

describe('Hour Balances Payout API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(payoutHandler, {
      method: 'POST',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Hour Balances Payout API - method rejection', () => {
  it('rejects non-POST methods with 405', async () => {
    const { status, json } = await callHandler(payoutHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Hour Balances Payout API - validation', () => {
  it('rejects missing fields with 400', async () => {
    const { status, json } = await callHandler(payoutHandler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid payout request', async () => {
    const { status, json } = await callHandler(payoutHandler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, year: 2026, month: 3, payout_hours: 5 },
    });
    expect(status).toBe(200);
    expect(json.id).toBe(1);
  });
});

describe('Hour Balances Initial API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(initialHandler, {
      method: 'POST',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Hour Balances Initial API - method rejection', () => {
  it('rejects non-POST methods with 405', async () => {
    const { status, json } = await callHandler(initialHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Hour Balances Initial API - validation', () => {
  it('rejects missing fields with 400', async () => {
    const { status, json } = await callHandler(initialHandler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, year: 2026 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid initial balance request', async () => {
    const { status, json } = await callHandler(initialHandler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, year: 2026, surplus_hours: 10, note: 'Carry over' },
    });
    expect(status).toBe(200);
    expect(json.id).toBe(1);
  });
});
