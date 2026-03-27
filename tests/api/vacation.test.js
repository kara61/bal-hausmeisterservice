import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock the vacation service
vi.mock('../../src/services/vacation.js', () => ({
  getVacationBalance: vi.fn().mockResolvedValue({ worker_id: 1, year: 2026, entitlement_days: 26, used_days: 0, remaining: 26 }),
  ensureVacationBalance: vi.fn().mockResolvedValue(undefined),
}));

// Mock the pool for GET
vi.mock('../../src/db/pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

import handler from '../../api/_handlers/vacation/index.js';

describe('Vacation API - POST validation (BUG-010)', () => {
  it('rejects POST with missing worker_id', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { year: 2026, entitlement_days: 26 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects POST with missing year', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, entitlement_days: 26 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects POST with missing entitlement_days', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, year: 2026 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects POST with non-numeric values', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 'abc', year: 2026, entitlement_days: 26 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects POST with null body', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: null,
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid POST', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { worker_id: 1, year: 2026, entitlement_days: 26 },
    });
    expect(status).toBe(201);
  });
});
