import { describe, it, expect } from 'vitest';
import { matchKeyword } from '../../src/services/keywordRouter.js';

describe('matchKeyword', () => {
  it('matches sick keywords', () => {
    expect(matchKeyword('krank')).toBe('sick');
    expect(matchKeyword('bin krank')).toBe('sick');
    expect(matchKeyword('Kann nicht kommen')).toBe('sick');
    expect(matchKeyword('KRANK')).toBe('sick');
  });

  it('matches checkout keywords', () => {
    expect(matchKeyword('auschecken')).toBe('checkout');
    expect(matchKeyword('feierabend')).toBe('checkout');
    expect(matchKeyword('Fertig')).toBe('checkout');
  });

  it('matches help keywords', () => {
    expect(matchKeyword('hilfe')).toBe('help');
    expect(matchKeyword('help')).toBe('help');
    expect(matchKeyword('?')).toBe('help');
  });

  it('matches reset keywords', () => {
    expect(matchKeyword('reset')).toBe('reset');
    expect(matchKeyword('neustart')).toBe('reset');
  });

  it('matches status keyword', () => {
    expect(matchKeyword('status')).toBe('status');
  });

  it('returns null for unrecognized input', () => {
    expect(matchKeyword('hallo')).toBeNull();
    expect(matchKeyword('wie gehts')).toBeNull();
    expect(matchKeyword('')).toBeNull();
  });
});
