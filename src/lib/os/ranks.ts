export type RankId =
  | 'member'
  | 'trial-mod'
  | 'moderator'
  | 'head-mod'
  | 'trial-admin'
  | 'admin'
  | 'head-admin'
  | 'owner';

export type Power = 'delete' | 'mute' | 'ban' | 'ipban' | 'deviceban' | 'unban' | 'rank';

export interface Rank {
  id: RankId;
  name: string;
  /** Side ranks are the secondary ladder: trial- and head- positions. */
  side: boolean;
  level: number;
  color: string;
  powers: Power[];
  /** The highest rank level this rank may aim ban/mute actions at. */
  actCap: number;
}

/**
 * Four main ranks plus four side ranks, member → owner.
 * Acting rules: mods ban/mute lower, admins ban/mute mods-or-lower (any kind of ban),
 * head admins ban (in any way) and mute admins, head mods and lower.
 */
export const RANKS: Rank[] = [
  { id: 'member', name: 'Member', side: false, level: 0, color: '#9aa4b2', powers: [], actCap: -1 },
  { id: 'trial-mod', name: 'Trial Mod', side: true, level: 1, color: '#7ee081', powers: ['delete'], actCap: 0 },
  { id: 'moderator', name: 'Moderator', side: false, level: 2, color: '#34d399', powers: ['delete', 'mute', 'ban'], actCap: 1 },
  { id: 'head-mod', name: 'Head Mod', side: true, level: 3, color: '#22c1a4', powers: ['delete', 'mute', 'ban'], actCap: 2 },
  { id: 'trial-admin', name: 'Trial Admin', side: true, level: 4, color: '#fbbf24', powers: ['delete', 'mute', 'ban', 'unban'], actCap: 3 },
  { id: 'admin', name: 'Admin', side: false, level: 5, color: '#f97316', powers: ['delete', 'mute', 'ban', 'ipban', 'deviceban', 'unban'], actCap: 2 },
  { id: 'head-admin', name: 'Head Admin', side: true, level: 6, color: '#ef4444', powers: ['delete', 'mute', 'ban', 'ipban', 'deviceban', 'unban', 'rank'], actCap: 5 },
  { id: 'owner', name: 'Owner', side: false, level: 7, color: '#e879f9', powers: ['delete', 'mute', 'ban', 'ipban', 'deviceban', 'unban', 'rank'], actCap: 6 },
];

export const MEMBER: Rank = RANKS[0];

export function rankOf(id: string | null | undefined): Rank {
  return RANKS.find((r) => r.id === id) ?? MEMBER;
}

export function can(rank: RankId | string | null | undefined, power: Power): boolean {
  return rankOf(rank).powers.includes(power);
}

/** Staff may only aim an action at ranks at or below their actCap. */
export function canActOn(
  actor: RankId | string | null | undefined,
  power: Power,
  target: RankId | string | null | undefined,
): boolean {
  const a = rankOf(actor);
  return a.powers.includes(power) && rankOf(target).level <= a.actCap;
}

/** A rank may only be granted/demoted to positions strictly below the actor's own. */
export function grantableRanks(actor: RankId | string | null | undefined): Rank[] {
  const level = rankOf(actor).level;
  return RANKS.filter((r) => r.level < level);
}

export function isStaff(rank: RankId | string | null | undefined): boolean {
  return rankOf(rank).level >= 1;
}
