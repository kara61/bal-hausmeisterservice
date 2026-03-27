import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../../api/_handlers/sick-leave/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

describe('Sick Leave API - auth', () => {
  it('rejects unauthenticated GET with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toBeDefined();
  });
});

describeWithDb('Sick Leave API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('GET returns 200 and array', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it('GET with worker_id filter returns 200 and array', async () => {
    const worker = await createTestWorker();
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
      query: { worker_id: String(worker.id) },
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
        start_date: '2026-03-27',
        end_date: '2026-03-29',
      },
    });
    expect(status).toBe(405);
  });
});
