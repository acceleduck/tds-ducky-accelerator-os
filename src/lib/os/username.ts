/**
 * Username-only sign-in. The account service beneath the OS identifies members
 * by an email address, so every username gets a hidden home at
 * `@duckpond.os` — ducks only ever see and type the username half.
 */
export const USERNAME_DOMAIN = 'duckpond.os';

/**
 * Normalize whatever was typed into a username: lowercase, letters/digits and
 * . _ - kept, anything else (including spaces) squeezed to single hyphens,
 * leading/trailing separators trimmed, capped at 32 characters.
 */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32)
    .replace(/[._-]+$/g, '');
}

/** A usable username: starts with a letter or digit, 2–32 allowed characters. */
export function isValidUsername(u: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,31}$/.test(u);
}

/** True when the field holds a full address (kept working for older accounts). */
export function looksLikeEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/**
 * Whatever was typed in the sign-in field, resolved to the account identifier
 * the auth service expects. Usernames map to their hidden pond address; full
 * email addresses pass through untouched for accounts made before usernames.
 */
export function loginToEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (looksLikeEmail(trimmed)) return trimmed.toLowerCase();
  return `${normalizeUsername(trimmed)}@${USERNAME_DOMAIN}`;
}

/** The username half of an account's address — what ducks should always see. */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return '';
  const local = email.split('@')[0] ?? '';
  return local || email;
}
