import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock the analytics service
vi.mock('../../src/services/analytics.js', () => ({
  getWorkerAnalytics: vi.fn().mockResolvedValue([]),
  getPropertyAnalytics: vi.fn().mockResolvedValue([]),
  getOperationsAnalytics: vi.fn().mockResolvedValue({
    totalCompleted: 0,
    totalScheduled: 0,
    planAdherence: 0,
    avgWorkersPerDay: 0,
    totalOvertimeMinutes: 0,
    sickLeaveCount: 0,
    daysTracked: 0,
  }),
  getCostAnalytics: vi.fn().mockResolvedValue([]),
  computeDailyAnalyticsForDate: vi.fn().mockResolvedValue(undefined),
  computePropertyMonthlyForMonth: vi.fn().mockResolvedValue(undefined),
}));

import indexHandler from '../../api/_handlers/analytics/index.js';
import exportHandler from '../../api/_handlers/analytics/export.js';

describe('Analytics Index API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Analytics Index API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Analytics Index API - validation', () => {
  it('rejects missing view parameter with 400', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: {},
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/view/i);
  });

  it('rejects unknown view with 400', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: { view: 'unknown' },
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/unknown view/i);
  });
});

describe('Analytics Index API - workers view', () => {
  it('rejects missing from/to for workers view', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: { view: 'workers' },
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/from.*to/i);
  });

  it('returns workers analytics with valid params', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: { view: 'workers', from: '2026-03-01', to: '2026-03-31' },
    });
    expect(status).toBe(200);
    expect(json.view).toBe('workers');
    expect(json.data).toEqual([]);
  });
});

describe('Analytics Index API - properties view', () => {
  it('rejects missing month for properties view', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: { view: 'properties' },
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/month/i);
  });

  it('returns properties analytics with valid params', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
      query: { view: 'properties', month: '2026-03' },
    });
    expect(status).toBe(200);
    expect(json.view).toBe('properties');
  });
});

describe('Analytics Export API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(exportHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Analytics Export API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(exportHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Analytics Export API - validation', () => {
  it('rejects missing from/to with 400', async () => {
    const { status, json } = await callHandler(exportHandler, {
      method: 'GET',
      authenticated: true,
      query: {},
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/from.*to/i);
  });
});
