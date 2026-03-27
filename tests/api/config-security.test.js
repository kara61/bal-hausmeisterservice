import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './helpers.js';

// BUG-026: JWT_SECRET must be validated at startup
// BUG-027: Missing ADMIN_PASSWORD_HASH should return 500, not throw

describe('Config validation (BUG-026)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws if jwtSecret is falsy and NODE_ENV is not test', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    vi.doMock('dotenv/config', () => ({}));
    // Override the env var so config picks up empty
    const origJwt = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    await expect(async () => {
      await import('../../src/config.js');
    }).rejects.toThrow(/JWT_SECRET/);

    // Restore
    process.env.JWT_SECRET = origJwt;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('does not throw if jwtSecret is falsy in test environment', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    vi.doMock('dotenv/config', () => ({}));
    const origJwt = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // Should NOT throw
    const { config } = await import('../../src/config.js');
    expect(config).toBeDefined();

    // Restore
    process.env.JWT_SECRET = origJwt;
    process.env.NODE_ENV = originalNodeEnv;
  });
});

describe('Login handler with missing ADMIN_PASSWORD_HASH (BUG-027)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns 500 when adminPasswordHash is not configured', async () => {
    vi.doMock('../../src/config.js', () => ({
      config: {
        adminUsername: 'halil',
        adminPasswordHash: undefined,
        jwtSecret: 'test-secret',
      },
    }));

    const { default: handler } = await import('../../api/_handlers/auth/login.js');
    const req = mockReq({
      method: 'POST',
      body: { username: 'halil', password: 'anything' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json.error).toMatch(/misconfigured/i);
  });
});
