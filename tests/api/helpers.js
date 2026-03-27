import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';

/**
 * Create a valid JWT token for testing authenticated endpoints.
 */
export function createTestToken(payload = { username: 'halil', role: 'admin' }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Create a mock request object that mimics Vercel's serverless req.
 */
export function mockReq({
  method = 'GET',
  query = {},
  body = null,
  headers = {},
  params = {},
  authenticated = true,
} = {}) {
  const token = authenticated ? createTestToken() : null;
  return {
    method,
    query,
    body,
    params,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  };
}

/**
 * Create a mock response object that captures status, json, headers.
 */
export function mockRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    _ended: false,
    status(code) {
      res._status = code;
      return res;
    },
    json(data) {
      res._json = data;
      res._ended = true;
      return res;
    },
    setHeader(key, value) {
      res._headers[key] = value;
      return res;
    },
    end(data) {
      res._ended = true;
      res._endData = data;
      return res;
    },
    write(chunk) {
      if (!res._chunks) res._chunks = [];
      res._chunks.push(chunk);
      return res;
    },
  };
  return res;
}

/**
 * Call a handler and return the response.
 */
export async function callHandler(handler, reqOptions = {}) {
  const req = mockReq(reqOptions);
  const res = mockRes();
  await handler(req, res);
  return { status: res._status, json: res._json, headers: res._headers, ended: res._ended };
}
