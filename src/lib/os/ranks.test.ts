import { describe, expect, it } from 'vitest';
import { RANKS, can, canActOn, grantableRanks, isStaff, rankOf } from './ranks';

describe('the ladder', () => {
  it('has exactly 4 main ranks and 4 side ranks', () => {
    expect(RANKS.filter((r) => !r.side).map((r) => r.id)).toEqual(['member', 'moderator', 'admin', 'owner']);
    expect(RANKS.filter((r) => r.side).map((r) => r.id)).toEqual(['trial-mod', 'head-mod', 'trial-admin', 'head-admin']);
  });

  it('orders every rank strictly from member to owner', () => {
    const levels = RANKS.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(RANKS.length);
  });

  it('falls back to member for unknown ranks', () => {
    expect(rankOf('made-up').id).toBe('member');
    expect(rankOf(null).id).toBe('member');
  });
});

// @kliv-spec-derived — from user intent:
// "mods can ban/mute lower", "admin can ban/mute mods or lower",
// "head admins can ban (in any way) and mute admins, head mods and lower ranks"
describe('who can ban and mute whom', () => {
  it('mods can ban and mute lower ranks but not mods or above', () => {
    expect(canActOn('moderator', 'ban', 'trial-mod')).toBe(true);
    expect(canActOn('moderator', 'mute', 'member')).toBe(true);
    expect(canActOn('moderator', 'ban', 'moderator')).toBe(false);
    expect(canActOn('moderator', 'mute', 'head-mod')).toBe(false);
  });

  it('admins can ban/mute mods or lower, but not head mods or trial admins', () => {
    expect(canActOn('admin', 'ban', 'moderator')).toBe(true);
    expect(canActOn('admin', 'mute', 'trial-mod')).toBe(true);
    expect(canActOn('admin', 'mute', 'member')).toBe(true);
    expect(canActOn('admin', 'ban', 'head-mod')).toBe(false);
    expect(canActOn('admin', 'ban', 'trial-admin')).toBe(false);
    expect(canActOn('admin', 'ban', 'admin')).toBe(false);
  });

  it('head admins can ban in any way and mute admins, head mods and lower', () => {
    expect(canActOn('head-admin', 'ban', 'admin')).toBe(true);
    expect(canActOn('head-admin', 'ipban', 'admin')).toBe(true);
    expect(canActOn('head-admin', 'deviceban', 'admin')).toBe(true);
    expect(canActOn('head-admin', 'mute', 'head-mod')).toBe(true);
    expect(canActOn('head-admin', 'mute', 'moderator')).toBe(true);
    expect(canActOn('head-admin', 'ban', 'head-admin')).toBe(false);
    expect(canActOn('head-admin', 'ban', 'owner')).toBe(false);
  });

  it('head mods and trial admins follow the same pattern one rung down', () => {
    expect(canActOn('head-mod', 'ban', 'moderator')).toBe(true);
    expect(canActOn('head-mod', 'ban', 'head-mod')).toBe(false);
    expect(canActOn('trial-admin', 'ban', 'head-mod')).toBe(true);
    expect(canActOn('trial-admin', 'ban', 'trial-admin')).toBe(false);
  });

  it('trial admins get bans but not ip or device bans', () => {
    expect(canActOn('trial-admin', 'ban', 'member')).toBe(true);
    expect(can('trial-admin', 'ipban')).toBe(false);
    expect(can('trial-admin', 'deviceban')).toBe(false);
  });

  it('the owner can act on everyone below', () => {
    expect(canActOn('owner', 'ipban', 'head-admin')).toBe(true);
    expect(canActOn('owner', 'mute', 'admin')).toBe(true);
    expect(canActOn('owner', 'ban', 'owner')).toBe(false);
  });

  it('members and trial mods cannot ban or mute anyone', () => {
    expect(can('member', 'ban')).toBe(false);
    expect(can('member', 'mute')).toBe(false);
    expect(can('trial-mod', 'ban')).toBe(false);
    expect(can('trial-mod', 'delete')).toBe(true);
    expect(isStaff('member')).toBe(false);
    expect(isStaff('trial-mod')).toBe(true);
  });
});

describe('rank grants', () => {
  it('only allows granting ranks strictly below your own', () => {
    expect(grantableRanks('owner').map((r) => r.id)).toContain('head-admin');
    expect(grantableRanks('owner').map((r) => r.id)).not.toContain('owner');
    expect(grantableRanks('head-admin').map((r) => r.id)).not.toContain('head-admin');
    expect(grantableRanks('member')).toEqual([]);
  });
});
