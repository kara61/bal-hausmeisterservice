import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import { cleanDb } from '../helpers.js';

describe('GET /api/properties', () => {
  beforeEach(async () => { await cleanDb(); });

  it('returns empty array when no properties exist', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/properties', () => {
  beforeEach(async () => { await cleanDb(); });

  it('creates a new property', async () => {
    const res = await request(app).post('/api/properties').send({
      address: 'Musterstraße 1',
      city: 'Hannover',
      standard_tasks: 'Treppenhausreinigung',
      assigned_weekday: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.address).toBe('Musterstraße 1');
    expect(res.body.city).toBe('Hannover');
    expect(res.body.standard_tasks).toBe('Treppenhausreinigung');
    expect(res.body.assigned_weekday).toBe(1);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app).post('/api/properties').send({
      address: 'Musterstraße 1',
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/properties/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('updates a property', async () => {
    const create = await request(app).post('/api/properties').send({
      address: 'Musterstraße 1',
      city: 'Hannover',
    });
    const res = await request(app)
      .put(`/api/properties/${create.body.id}`)
      .send({ city: 'Braunschweig' });
    expect(res.status).toBe(200);
    expect(res.body.city).toBe('Braunschweig');
  });
});

describe('DELETE /api/properties/:id', () => {
  beforeEach(async () => { await cleanDb(); });

  it('soft-deletes a property (sets is_active = false)', async () => {
    const create = await request(app).post('/api/properties').send({
      address: 'Musterstraße 1',
      city: 'Hannover',
    });
    const res = await request(app).delete(`/api/properties/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);

    const list = await request(app).get('/api/properties');
    expect(list.body).toHaveLength(0);
  });
});
