import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../../api/_handlers/workers/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestWorker } from '../helpers.js';

describe('Workers API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describeWithDb('Workers API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('returns empty array when no workers exist', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('returns workers when they exist', async () => {
    await createTestWorker({ name: 'Alice', phone_number: '+4917600000001' });
    await createTestWorker({ name: 'Bob', phone_number: '+4917600000002' });

    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json.map((w) => w.name)).toEqual(['Alice', 'Bob']);
  });

  it('creates a worker with valid POST data', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        name: 'New Worker',
        phone_number: '+4917699999999',
        worker_type: 'fulltime',
        hourly_rate: 15,
        worker_role: 'field',
      },
    });
    expect(status).toBe(201);
    expect(json.name).toBe('New Worker');
    expect(json.phone_number).toBe('+4917699999999');
    expect(json.id).toBeDefined();
  });

  it('rejects missing name with 400', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        phone_number: '+4917699999999',
        worker_type: 'fulltime',
      },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('rejects invalid worker_type with 400', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        name: 'Bad Type',
        phone_number: '+4917699999999',
        worker_type: 'intern',
      },
    });
    expect(status).toBe(400);
    expect(json.error).toMatch(/worker_type/i);
  });

  it('rejects duplicate phone number with 409', async () => {
    await createTestWorker({ name: 'Existing', phone_number: '+4917600000001' });

    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: {
        name: 'Duplicate Phone',
        phone_number: '+4917600000001',
        worker_type: 'fulltime',
      },
    });
    expect(status).toBe(409);
    expect(json.error).toMatch(/phone number already exists/i);
  });
});
