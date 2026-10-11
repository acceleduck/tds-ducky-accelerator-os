import { describe, expect, it } from 'vitest';
import {
  USERNAME_DOMAIN,
  emailToUsername,
  isValidUsername,
  loginToEmail,
  looksLikeEmail,
  normalizeUsername,
} from './username';

// @kliv-spec-derived — from user intent: "i just want username no email needed to login"
describe('username-only login', () => {
  it('turns a typed username into a hidden account address', () => {
    expect(loginToEmail('AcceleDuck')).toBe(`acceleduck@${USERNAME_DOMAIN}`);
  });

  it('keeps usernames lowercase and strips characters that do not belong', () => {
    expect(normalizeUsername('  Quack Master!! ')).toBe('quack-master');
    expect(normalizeUsername('--pond..duck--')).toBe('pond..duck');
    expect(normalizeUsername('🎉')).toBe('');
  });

  it('accepts reasonable usernames and rejects junk', () => {
    expect(isValidUsername('acceleduck')).toBe(true);
    expect(isValidUsername('100151892')).toBe(true);
    expect(isValidUsername('min_check.duck-2')).toBe(true);
    expect(isValidUsername('a')).toBe(false);
    expect(isValidUsername('')).toBe(false);
    expect(isValidUsername('-nodash')).toBe(false);
  });

  it('still accepts a full email address for accounts made before usernames', () => {
    expect(looksLikeEmail('acceleduck@proton.me')).toBe(true);
    expect(loginToEmail('Acceleduck@Proton.Me')).toBe('acceleduck@proton.me');
  });

  it('shows the username half when displaying an account', () => {
    expect(emailToUsername(`quackmaster@${USERNAME_DOMAIN}`)).toBe('quackmaster');
    expect(emailToUsername(null)).toBe('');
    expect(emailToUsername('weird')).toBe('weird');
  });
});
