import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../../api/_handlers/properties/index.js';
import { callHandler } from './helpers.js';
import { describeWithDb, cleanDb, createTestProperty, createTestPropertyTask } from '../helpers.js';

describe('Properties API - auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/authentication required/i);
  });
});

describeWithDb('Properties API - with DB', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it('rejects unsupported methods with 405', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'DELETE',
      authenticated: true,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });

  it('GET returns empty array when no properties exist', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('GET returns properties with tasks', async () => {
    const prop = await createTestProperty({ address: 'Teststr 1', city: 'München' });
    await createTestPropertyTask(prop.id, { task_name: 'Reinigung' });

    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].address).toBe('Teststr 1');
    expect(json[0].tasks).toHaveLength(1);
    expect(json[0].tasks[0].task_name).toBe('Reinigung');
  });

  it('POST creates a property with valid data', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { address: 'Neue Str 5', city: 'Berlin' },
    });
    expect(status).toBe(201);
    expect(json.address).toBe('Neue Str 5');
    expect(json.city).toBe('Berlin');
    expect(json.id).toBeDefined();
  });

  it('POST rejects missing address with 400', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      authenticated: true,
      body: { city: 'Berlin' },
    });
    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });
});
