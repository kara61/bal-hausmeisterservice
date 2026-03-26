import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { cleanDb } from '../helpers.js';

describe('GET /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns empty array when no workers exist', async () => {
    const res = await request(app).get('/api/workers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/workers', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a new worker', async () => {
    const res = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Ertugrul Bal');
    expect(res.body.phone_number).toBe('+4917612345678');
    expect(res.body.worker_type).toBe('fulltime');
  });

  it('rejects duplicate phone number', async () => {
    const worker = {
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    };
    await request(app).post('/api/workers').send(worker);
    const res = await request(app).post('/api/workers').send(worker);
    expect(res.status).toBe(409);
  });

  it('rejects invalid worker_type', async () => {
    const res = await request(app).post('/api/workers').send({
      name: 'Test',
      phone_number: '+4917600000000',
      worker_type: 'invalid',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/workers/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('updates a worker', async () => {
    const create = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    const res = await request(app)
      .put(`/api/workers/${create.body.id}`)
      .send({ hourly_rate: 15.0 });
    expect(res.status).toBe(200);
    expect(Number(res.body.hourly_rate)).toBe(15.0);
  });
});

describe('DELETE /api/workers/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('soft-deletes a worker (sets is_active = false)', async () => {
    const create = await request(app).post('/api/workers').send({
      name: 'Ertugrul Bal',
      phone_number: '+4917612345678',
      worker_type: 'fulltime',
      hourly_rate: 14.0,
      registration_date: '2023-09-01',
      vacation_entitlement: 26,
    });
    const res = await request(app).delete(`/api/workers/${create.body.id}`);
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/workers');
    expect(list.body).toHaveLength(0);
  });
});
