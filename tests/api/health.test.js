import { describe, it, expect } from 'vitest';
import handler from '../../api/_handlers/health.js';
import { callHandler } from './helpers.js';

describe('Health API', () => {
  it('returns ok status without authentication', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
  });

  it('returns ok status with authentication', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: true,
    });
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
  });
});
