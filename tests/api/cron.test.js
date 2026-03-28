import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Mock all services used by cron handlers
vi.mock('../../src/services/anomaly.js', () => ({
  detectMissingCheckouts: vi.fn().mockResolvedValue([]),
  flagMissingCheckout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
    halilWhatsappNumber: '+4917699999999',
  },
}));
vi.mock('../../src/services/planGeneration.js', () => ({
  generateDraftPlan: vi.fn().mockResolvedValue({ id: 1 }),
  carryOverPlanTasks: vi.fn().mockResolvedValue([]),
  redistributeSickWorkers: vi.fn().mockResolvedValue({ reassigned: 0 }),
}));
vi.mock('../../src/services/planNotifications.js', () => ({
  notifyHalilPlanReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/analytics.js', () => ({
  computeDailyAnalyticsForDate: vi.fn().mockResolvedValue(undefined),
  computePropertyMonthlyForMonth: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/db/pool.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

import nightlyHandler from '../../api/_handlers/cron/nightly.js';
import morningHandler from '../../api/_handlers/cron/morning.js';
import eveningHandler from '../../api/_handlers/cron/evening.js';

describe('Cron Nightly - auth', () => {
  it('rejects requests without CRON_SECRET with 401', async () => {
    const { status, json } = await callHandler(nightlyHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/unauthorized/i);
  });
});

describe('Cron Nightly - happy path', () => {
  it('runs successfully with valid cron secret', async () => {
    const cronSecret = process.env.CRON_SECRET || 'test-cron-secret';
    process.env.CRON_SECRET = cronSecret;

    const { status, json } = await callHandler(nightlyHandler, {
      method: 'GET',
      authenticated: false,
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty('flagged');
    expect(json).toHaveProperty('analytics_computed');
  });
});

describe('Cron Morning - auth', () => {
  it('rejects requests without CRON_SECRET with 401', async () => {
    const { status, json } = await callHandler(morningHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/unauthorized/i);
  });
});

describe('Cron Morning - happy path', () => {
  it('runs successfully with valid cron secret', async () => {
    const cronSecret = process.env.CRON_SECRET || 'test-cron-secret';
    process.env.CRON_SECRET = cronSecret;

    const { status, json } = await callHandler(morningHandler, {
      method: 'GET',
      authenticated: false,
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty('carried_over');
    expect(json).toHaveProperty('redistributed');
  });
});

describe('Cron Evening - auth', () => {
  it('rejects requests without CRON_SECRET with 401', async () => {
    const { status, json } = await callHandler(eveningHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/unauthorized/i);
  });
});

describe('Cron Evening - happy path', () => {
  it('runs successfully with valid cron secret', async () => {
    const cronSecret = process.env.CRON_SECRET || 'test-cron-secret';
    process.env.CRON_SECRET = cronSecret;

    const { status, json } = await callHandler(eveningHandler, {
      method: 'GET',
      authenticated: false,
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json).toHaveProperty('plan_id');
  });
});
