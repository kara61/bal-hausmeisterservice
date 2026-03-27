import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { mockRes } from './helpers.js';

// BUG-002: Token should NOT be accepted via query string

vi.mock('../../src/config.js', () => ({
  config: {
    jwtSecret: 'test-secret-do-not-use-in-production',
  },
}));

const { requireAuth, checkAuth } = await import('../../src/middleware/auth.js');

const SECRET = 'test-secret-do-not-use-in-production';

describe('Auth middleware query string rejection (BUG-002)', () => {
  it('requireAuth rejects token passed via query string', () => {
    const token = jwt.sign({ username: 'halil', role: 'admin' }, SECRET, { expiresIn: '1h' });

    const req = {
      headers: {},
      query: { token },
    };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    // Should NOT call next — query token should be rejected
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('requireAuth accepts token via Authorization header', () => {
    const token = jwt.sign({ username: 'halil', role: 'admin' }, SECRET, { expiresIn: '1h' });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      query: {},
    };
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('checkAuth rejects token passed via query string', () => {
    const token = jwt.sign({ username: 'halil', role: 'admin' }, SECRET, { expiresIn: '1h' });

    const req = {
      headers: {},
      query: { token },
    };
    const res = mockRes();

    const rejected = checkAuth(req, res);

    // Should reject (return true) — query token should not be accepted
    expect(rejected).toBe(true);
    expect(res._status).toBe(401);
  });

  it('checkAuth accepts token via Authorization header', () => {
    const token = jwt.sign({ username: 'halil', role: 'admin' }, SECRET, { expiresIn: '1h' });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      query: {},
    };
    const res = mockRes();

    const rejected = checkAuth(req, res);

    expect(rejected).toBeNull();
  });
});
