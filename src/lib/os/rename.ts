/**
 * Rename policy, shared by the Settings screen (for previews and messages) and
 * its tests. The profile guard service enforces the same rules server-side.
 *
 * Why it exists: a duck who renames freely can quietly become "a different
 * person" — dodge a bad reputation, or wear the owner's name and ask for
 * passwords. So names belong to accounts, renames are rare, staff identities
 * are untouchable, and nobody renames while banned.
 */

export const RENAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Staff/owner names shorter than this aren't "contained" in longer names. */
export const MIN_PROTECTED_LEN = 4;

/**
 * Names match on letters and digits only, so case, spaces and punctuation
 * can't disguise a stolen name: "Accele.duck!", "acceleduck" and
 * " ACCELE DUCK " all collapse to the same key.
 */
export function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type RenameRejectionCode = 'empty' | 'taken' | 'protected' | 'cooldown';

export interface RenameRejection {
  code: RenameRejectionCode;
  userMessage: string;
}

export interface RenameCheckInput {
  desired: string;
  myUuid: string;
  /** normalized name -> the uuid of the account that owns it */
  taken?: Record<string, string>;
  /** staff/owner identities that may not even appear inside a longer name */
  protectedNames?: { key: string; uuid: string }[];
  lastRenameAt?: number | null;
  nowMs: number;
  isOwner?: boolean;
}

/** Returns null when the rename is allowed, or the reason it isn't. */
export function renameProblem(input: RenameCheckInput): RenameRejection | null {
  const desired = input.desired.replace(/\s+/g, ' ').trim();
  if (!desired) {
    return { code: 'empty', userMessage: 'Pick a name with at least one letter.' };
  }
  const key = normalizeNameKey(desired);
  if (!key) return null; // nothing textual to protect or compare

  const holder = input.taken?.[key];
  if (holder && holder !== input.myUuid) {
    return { code: 'taken', userMessage: 'That name already belongs to another duck — pick your own.' };
  }

  for (const p of input.protectedNames ?? []) {
    if (p.uuid !== input.myUuid && p.key.length >= MIN_PROTECTED_LEN && key.includes(p.key)) {
      return { code: 'protected', userMessage: "That name is too close to a staff duck's — it could fool someone." };
    }
  }

  const last = input.lastRenameAt ?? 0;
  if (!input.isOwner && last && input.nowMs - last < RENAME_COOLDOWN_MS) {
    return {
      code: 'cooldown',
      userMessage: `You renamed yourself recently — try again in ${renameCountdown(last + RENAME_COOLDOWN_MS, input.nowMs)}.`,
    };
  }
  return null;
}

/** Friendly "5h 12m" for the time until a rename unlocks. */
export function renameCountdown(unlockMs: number, nowMs: number = Date.now()): string {
  const left = Math.max(0, unlockMs - nowMs);
  const h = Math.floor(left / 3_600_000);
  const m = Math.ceil((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
