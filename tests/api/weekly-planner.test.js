import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../../api/_handlers/weekly-planner/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb } from '../helpers.js';

describe('Weekly Planner API - auth', () => {
  it('rejects unauthenticated GET with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describeWithDb('Weekly Planner API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET current week returns 200 with expected shape', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toHaveProperty('week_start');
    expect(json).toHaveProperty('week_end');
    expect(json).toHaveProperty('calendar_week');
    expect(json).toHaveProperty('days');
    expect(typeof json.days).toBe('object');
    // Should have 5 weekdays (Mon-Fri)
    expect(Object.keys(json.days)).toHaveLength(5);
  });

  it('GET with specific week_start date returns 200', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      query: { week_start: '2026-03-23' }, // a Monday
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json.week_start).toBe('2026-03-23');
    expect(json.week_end).toBe('2026-03-27');
    expect(json).toHaveProperty('days');
  });

  it('POST returns 405 (GET-only endpoint)', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });
});
