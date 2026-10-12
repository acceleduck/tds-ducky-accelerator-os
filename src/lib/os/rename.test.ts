import { describe, expect, it } from 'vitest';
import { normalizeNameKey, renameProblem, RENAME_COOLDOWN_MS } from './rename';

const NOW = 1_700_000_000_000;
const ME = 'us-me';
const OWNER = 'us-owner';

// @kliv-spec-derived — from user intent: "a guy changes his username again and pretends to be a different person" must not be possible
describe('rename protection', () => {
  it('refuses a name another duck already owns', () => {
    const verdict = renameProblem({
      desired: 'Acceleduck',
      myUuid: ME,
      taken: { acceleduck: OWNER },
      nowMs: NOW,
    });
    expect(verdict?.code).toBe('taken');
  });

  it('sees through case, spaces and punctuation when matching names', () => {
    expect(normalizeNameKey('Accele.duck!')).toBe(normalizeNameKey('acceleduck'));
    expect(normalizeNameKey(' ACCELE DUCK ')).toBe(normalizeNameKey('acceleduck'));
    const verdict = renameProblem({
      desired: 'Accele.duck!',
      myUuid: ME,
      taken: { acceleduck: OWNER },
      nowMs: NOW,
    });
    expect(verdict?.code).toBe('taken');
  });

  it("lets a duck keep the name that is already theirs", () => {
    const verdict = renameProblem({
      desired: 'acceleduck',
      myUuid: OWNER,
      taken: { acceleduck: OWNER },
      nowMs: NOW,
    });
    expect(verdict).toBeNull();
  });

  it('refuses a name that merely contains a staff identity', () => {
    const verdict = renameProblem({
      desired: 'acceleduck fan club',
      myUuid: ME,
      protectedNames: [{ key: normalizeNameKey('Acceleduck'), uuid: OWNER }],
      nowMs: NOW,
    });
    expect(verdict?.code).toBe('protected');
  });

  it('allows an unrelated name even when staff identities exist', () => {
    const verdict = renameProblem({
      desired: 'Puddle Jumper',
      myUuid: ME,
      taken: { acceleduck: OWNER },
      protectedNames: [{ key: normalizeNameKey('Acceleduck'), uuid: OWNER }],
      nowMs: NOW,
    });
    expect(verdict).toBeNull();
  });
});

// @kliv-spec-derived — from user intent: renaming "again" to reset identity must be throttled
describe('rename cooldown', () => {
  it('refuses a second rename on the same day', () => {
    const verdict = renameProblem({
      desired: 'Fresh Identity',
      myUuid: ME,
      lastRenameAt: NOW - 60_000,
      nowMs: NOW,
    });
    expect(verdict?.code).toBe('cooldown');
    expect(verdict?.userMessage).toContain('try again');
  });

  it('allows a rename a full day after the last one', () => {
    const verdict = renameProblem({
      desired: 'Fresh Identity',
      myUuid: ME,
      lastRenameAt: NOW - RENAME_COOLDOWN_MS - 1,
      nowMs: NOW,
    });
    expect(verdict).toBeNull();
  });

  it('exempts the owner from the cooldown but not from name theft', () => {
    expect(
      renameProblem({
        desired: 'Anything At All',
        myUuid: OWNER,
        lastRenameAt: NOW - 60_000,
        nowMs: NOW,
        isOwner: true,
      }),
    ).toBeNull();
    expect(
      renameProblem({
        desired: 'Acceleduck',
        myUuid: ME,
        taken: { acceleduck: OWNER },
        lastRenameAt: NOW - 60_000,
        nowMs: NOW,
        isOwner: true,
      })?.code,
    ).toBe('taken');
  });
});
