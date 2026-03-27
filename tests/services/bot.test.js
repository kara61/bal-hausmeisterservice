import { it, expect, beforeEach, vi } from 'vitest';
import { handleIncomingMessage } from '../../src/services/bot.js';
import { cleanDb, createTestWorker, describeWithDb } from '../helpers.js';

vi.mock('../../src/services/whatsapp.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({}),
  sendWhatsAppButtons: vi.fn().mockResolvedValue({}),
  sendInteractiveButtons: vi.fn().mockResolvedValue({}),
}));

describeWithDb('handleIncomingMessage', () => {
  beforeEach(async () => { await cleanDb(); });

  it('rejects unregistered phone numbers', async () => {
    const result = await handleIncomingMessage('+4900000000000', 'hello');
    expect(result.response).toContain('nicht registriert');
  });

  it('shows main menu for registered worker sending free text', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Hallo wie gehts');
    expect(result.type).toBe('menu');
    expect(result.response).toContain('Was moechtest du tun');
  });

  it('processes Einchecken button press', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Einchecken');
    expect(result.type).toBe('checkin');
    expect(result.response).toContain('Eingecheckt um');
  });

  it('processes Auschecken button press', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await handleIncomingMessage('+4917612345678', 'Einchecken');
    const result = await handleIncomingMessage('+4917612345678', 'Auschecken');
    expect(result.type).toBe('checkout');
    expect(result.response).toContain('Ausgecheckt um');
  });

  it('prevents double check-in', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await handleIncomingMessage('+4917612345678', 'Einchecken');
    const result = await handleIncomingMessage('+4917612345678', 'Einchecken');
    expect(result.response).toContain('bereits eingecheckt');
  });

  it('prevents checkout without check-in', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Auschecken');
    expect(result.response).toContain('nicht eingecheckt');
  });

  it('processes Krank melden with day count', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    const result = await handleIncomingMessage('+4917612345678', 'Krank melden');
    expect(result.type).toBe('sick_prompt');
    expect(result.response).toContain('Wie viele Tage');
  });

  it('records sick leave when day count received after Krank melden', async () => {
    await createTestWorker({ phone_number: '+4917612345678' });
    await handleIncomingMessage('+4917612345678', 'Krank melden');
    const result = await handleIncomingMessage('+4917612345678', '3');
    expect(result.type).toBe('sick_recorded');
    expect(result.response).toContain('3 Tage');
  });
});
