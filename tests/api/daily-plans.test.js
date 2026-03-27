import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../../api/_handlers/daily-plans/index.js';
import approveHandler from '../../api/_handlers/daily-plans/approve.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb } from '../helpers.js';

describe('Daily Plans API - auth', () => {
  it('rejects unauthenticated GET with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describeWithDb('Daily Plans API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET returns 200 with array', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it('GET returns empty array when no plans exist for any date', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('approve returns 500 for non-existent plan (approvePlan throws)', async () => {
    const { status, json } = await callHandler(approveHandler, {
      method: 'POST',
      query: { id: '999999' },
      authenticated: true,
    });
    // approvePlan throws 'Plan not found', withErrorHandler catches → 500
    expect(status).toBe(500);
    expect(json.error).toBe('Internal server error');
  });
});
