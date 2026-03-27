import { describe, it, expect, vi } from 'vitest';
import { callHandler } from './helpers.js';

// Hash of 'correct-password' generated with bcrypt.hashSync('correct-password', 10)
const TEST_HASH = '$2b$10$SvWLwxKNmZB3/MLJTflhZO4PsAQ4s6BnruLrzrygJeSzBCv8cXQSi';

vi.mock('../../src/config.js', () => ({
  config: {
    adminUsername: 'halil',
    adminPasswordHash: TEST_HASH,
    jwtSecret: 'test-secret-do-not-use-in-production',
  },
}));

const { default: handler } = await import('../../api/_handlers/auth/login.js');

describe('POST /api/auth/login', () => {
  it('rejects GET method with 405', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'GET',
      authenticated: false,
    });
    expect(status).toBe(405);
    expect(json.error).toMatch(/method not allowed/i);
  });

  it('rejects missing credentials with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      body: {},
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/invalid credentials/i);
  });

  it('rejects wrong credentials with 401', async () => {
    const { status, json } = await callHandler(handler, {
      method: 'POST',
      body: { username: 'halil', password: 'wrong-password' },
      authenticated: false,
    });
    expect(status).toBe(401);
    expect(json.error).toMatch(/invalid credentials/i);
  });
});
