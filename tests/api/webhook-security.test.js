import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReq, mockRes } from './helpers.js';

// BUG-001: Webhook should fail closed when validateRequest is not a function
// BUG-007: Webhook should use SKIP_TWILIO_VALIDATION instead of NODE_ENV

describe('Webhook signature validation (BUG-001, BUG-007)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear relevant env vars
    delete process.env.SKIP_TWILIO_VALIDATION;
  });

  it('BUG-001: rejects request when twilio.validateRequest is not a function', async () => {
    // Mock twilio with no validateRequest function
    vi.doMock('twilio', () => ({ default: {} }));
    vi.doMock('../../src/config.js', () => ({
      config: { twilioAuthToken: 'some-token' },
    }));
    vi.doMock('../../src/services/botV2.js', () => ({
      handleIncomingMessageV2: vi.fn(),
    }));
    vi.doMock('../../src/services/whatsapp.js', () => ({
      sendWhatsAppMessage: vi.fn(),
      sendWhatsAppButtons: vi.fn(),
    }));

    const { default: handler } = await import('../../api/_handlers/webhook.js');
    const req = mockReq({
      method: 'POST',
      body: { From: '+491234', Body: 'hello' },
      headers: { 'x-twilio-signature': 'fake', host: 'example.com' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it('BUG-001: rejects request when validateRequest returns false', async () => {
    vi.doMock('twilio', () => ({
      default: { validateRequest: vi.fn(() => false) },
    }));
    vi.doMock('../../src/config.js', () => ({
      config: { twilioAuthToken: 'some-token' },
    }));
    vi.doMock('../../src/services/botV2.js', () => ({
      handleIncomingMessageV2: vi.fn(),
    }));
    vi.doMock('../../src/services/whatsapp.js', () => ({
      sendWhatsAppMessage: vi.fn(),
      sendWhatsAppButtons: vi.fn(),
    }));

    const { default: handler } = await import('../../api/_handlers/webhook.js');
    const req = mockReq({
      method: 'POST',
      body: { From: '+491234', Body: 'hello' },
      headers: { 'x-twilio-signature': 'fake', host: 'example.com' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it('BUG-001: rejects request when validateRequest throws', async () => {
    vi.doMock('twilio', () => ({
      default: { validateRequest: vi.fn(() => { throw new Error('boom'); }) },
    }));
    vi.doMock('../../src/config.js', () => ({
      config: { twilioAuthToken: 'some-token' },
    }));
    vi.doMock('../../src/services/botV2.js', () => ({
      handleIncomingMessageV2: vi.fn(),
    }));
    vi.doMock('../../src/services/whatsapp.js', () => ({
      sendWhatsAppMessage: vi.fn(),
      sendWhatsAppButtons: vi.fn(),
    }));

    const { default: handler } = await import('../../api/_handlers/webhook.js');
    const req = mockReq({
      method: 'POST',
      body: { From: '+491234', Body: 'hello' },
      headers: { 'x-twilio-signature': 'fake', host: 'example.com' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    // Should return 403, not 500
    expect(res._status).toBe(403);
  });

  it('BUG-007: does NOT skip validation when NODE_ENV=test (without SKIP_TWILIO_VALIDATION)', async () => {
    // NODE_ENV is 'test' but SKIP_TWILIO_VALIDATION is not set
    vi.doMock('twilio', () => ({
      default: { validateRequest: vi.fn(() => false) },
    }));
    vi.doMock('../../src/config.js', () => ({
      config: { twilioAuthToken: 'some-token' },
    }));
    vi.doMock('../../src/services/botV2.js', () => ({
      handleIncomingMessageV2: vi.fn(),
    }));
    vi.doMock('../../src/services/whatsapp.js', () => ({
      sendWhatsAppMessage: vi.fn(),
      sendWhatsAppButtons: vi.fn(),
    }));

    const { default: handler } = await import('../../api/_handlers/webhook.js');
    const req = mockReq({
      method: 'POST',
      body: { From: '+491234', Body: 'hello' },
      headers: { 'x-twilio-signature': 'bad', host: 'example.com' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    expect(res._status).toBe(403);
  });

  it('BUG-007: skips validation when SKIP_TWILIO_VALIDATION=true', async () => {
    process.env.SKIP_TWILIO_VALIDATION = 'true';

    vi.doMock('twilio', () => ({
      default: { validateRequest: vi.fn(() => false) },
    }));
    vi.doMock('../../src/config.js', () => ({
      config: { twilioAuthToken: 'some-token' },
    }));
    vi.doMock('../../src/services/botV2.js', () => ({
      handleIncomingMessageV2: vi.fn().mockResolvedValue({ response: 'ok', buttons: [] }),
    }));
    vi.doMock('../../src/services/whatsapp.js', () => ({
      sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
      sendWhatsAppButtons: vi.fn().mockResolvedValue(undefined),
      sendWhatsAppListMessage: vi.fn().mockResolvedValue(undefined),
    }));

    const { default: handler } = await import('../../api/_handlers/webhook.js');
    const req = mockReq({
      method: 'POST',
      body: { From: '+491234', Body: 'hello' },
      headers: { 'x-twilio-signature': 'bad', host: 'example.com' },
      authenticated: false,
    });
    const res = mockRes();
    await handler(req, res);

    // Should succeed because validation is explicitly skipped
    expect(res._status).toBe(200);
  });
});
