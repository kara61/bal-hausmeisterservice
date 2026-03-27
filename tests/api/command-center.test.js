import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock the commandCenter service
vi.mock('../../src/services/commandCenter.js', () => ({
  getCommandCenterData: vi.fn().mockResolvedValue({
    date: '2026-03-27',
    workers: [],
    properties: [],
    alerts: [],
  }),
}));

import handler from '../../api/_handlers/command-center/index.js';

describe('Command Center API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Command Center API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Command Center API - happy path', () => {
  it('GET returns command center data', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { date: '2026-03-27' },
    });
    expect(status).toBe(200);
    expect(json.date).toBe('2026-03-27');
    expect(json).toHaveProperty('workers');
    expect(json).toHaveProperty('properties');
  });

  it('GET works without explicit date parameter', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toHaveProperty('date');
  });
});
