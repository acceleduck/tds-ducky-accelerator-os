// @kliv-spec-derived — from user intent: "edit your account and add your own profile picture"
import { describe, it, expect } from 'vitest';
import { sanitizeDisplayName, profileName, pfpProblem, NAME_MAX } from './profile';

describe('sanitizeDisplayName', () => {
  it('trims and collapses extra spaces', () => {
    expect(sanitizeDisplayName('  captain   quack ')).toBe('captain quack');
  });

  it('caps the length at NAME_MAX characters', () => {
    expect(sanitizeDisplayName('q'.repeat(60)).length).toBe(NAME_MAX);
  });

  it('treats blank input as empty, never as a name', () => {
    expect(sanitizeDisplayName(null)).toBe('');
    expect(sanitizeDisplayName('   ')).toBe('');
  });
});

describe('profileName', () => {
  it('prefers the chosen name over the email-derived one', () => {
    expect(profileName({ display_name: 'Captain Quack' }, 'bob123@pond.dev')).toBe('Captain Quack');
  });

  it('falls back to the email-derived name when none is set', () => {
    expect(profileName({ display_name: null }, 'bob123@pond.dev')).toBe('Bob123');
    expect(profileName(null, 'bob123@pond.dev')).toBe('Bob123');
  });

  it('ignores a blank chosen name', () => {
    expect(profileName({ display_name: '   ' }, 'bob123@pond.dev')).toBe('Bob123');
  });
});

describe('pfpProblem', () => {
  const png = (size = 1000) => new File([new Uint8Array(size)], 'selfie.png', { type: 'image/png' });

  it('accepts a reasonably sized image', () => {
    expect(pfpProblem(png())).toBeNull();
  });

  it('rejects non-images (e.g. a pdf someone renamed)', () => {
    const pdf = new File([new Uint8Array(10)], 'x.pdf', { type: 'application/pdf' });
    expect(pfpProblem(pdf)).toMatch(/image/i);
  });

  it('rejects pictures over 6 MB', () => {
    expect(pfpProblem(png(7 * 1024 * 1024))).toMatch(/6 MB/);
  });
});
