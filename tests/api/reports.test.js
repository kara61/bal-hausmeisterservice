import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb } from '../helpers.js';

// Mock config so JWT verification works
vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost/test',
  },
}));

// Mock report generation and notifications
vi.mock('../../src/services/pdfReport.js', () => ({
  generateMonthlyReport: vi.fn().mockResolvedValue({ filename: 'report-2026-03.pdf' }),
}));
vi.mock('../../src/services/notifications.js', () => ({
  notifyHalilReportReady: vi.fn().mockResolvedValue(undefined),
}));

import indexHandler from '../../api/_handlers/reports/index.js';
import generateHandler from '../../api/_handlers/reports/generate.js';

describe('Reports Index API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Reports Index API - method rejection', () => {
  it('rejects non-GET methods with 405', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describeWithDb('Reports Index API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET returns empty array when no reports exist', async () => {
    const { status, json } = await callHandler(indexHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });
});

describe('Reports Generate API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(generateHandler, {
      method: 'POST',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describe('Reports Generate API - method rejection', () => {
  it('rejects non-POST methods with 405', async () => {
    const { status, json } = await callHandler(generateHandler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});

describe('Reports Generate API - validation', () => {
  it('rejects missing month/year with 400', async () => {
    const { status, json } = await callHandler(generateHandler, {
      method: 'POST',
      authenticated: true,
      body: { month: 3 },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('accepts valid generate request', async () => {
    const { status, json } = await callHandler(generateHandler, {
      method: 'POST',
      authenticated: true,
      body: { month: 3, year: 2026 },
    });
    expect(status).toBe(200);
    expect(json.filename).toBe('report-2026-03.pdf');
  });
});
