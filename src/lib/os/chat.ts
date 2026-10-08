export interface ChatChannel {
  _row_id: number;
  slug: string;
  name: string;
  kind: 'public' | 'group' | 'dm';
  topic: string | null;
  members: string;
  _created_at: number;
}

export type ChatMessageKind =
  | 'text'
  | 'system'
  | 'image'
  | 'poll'
  | 'call-start'
  | 'call-join'
  | 'call-leave'
  | 'call-end';

export interface ChatMessage {
  _row_id: number;
  channel_slug: string;
  author_uuid: string;
  author_name: string;
  kind: ChatMessageKind;
  body: string;
  _created_at: number;
  poll_question?: string | null;
  poll_options?: string | null;
  poll_closed?: number | null;
  reply_to?: number | null;
  reply_author?: string | null;
  reply_snippet?: string | null;
}

export const PUBLIC_LOUNGE = 'duck-lounge';

/** Deterministic, symmetric slug for a DM between two users. */
export function dmSlug(a: string, b: string): string {
  return `dm-${[a, b].sort().join('-')}`;
}

export function parseMembers(members: string): string[] {
  return members.split('|').filter(Boolean);
}

export function isMember(ch: ChatChannel, uuid: string | null): boolean {
  if (ch.kind === 'public') return true;
  return !!uuid && parseMembers(ch.members).includes(uuid);
}

export interface ActiveCall {
  startedAt: number; // unix seconds
  startedBy: string;
  participants: { uuid: string; name: string }[];
}

/** Derive the live call for a channel from its message history. */
export function activeCall(messages: ChatMessage[]): ActiveCall | null {
  let startIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === 'call-start') {
      startIdx = i;
      break;
    }
    if (messages[i].kind === 'call-end') return null; // a later end closes everything
  }
  if (startIdx === -1) return null;
  const start = messages[startIdx];
  const map = new Map<string, string>();
  map.set(start.author_uuid, start.author_name);
  for (let i = startIdx; i < messages.length; i++) {
    const m = messages[i];
    if (m.kind === 'call-join') map.set(m.author_uuid, m.author_name);
    if (m.kind === 'call-leave') map.delete(m.author_uuid);
  }
  return {
    startedAt: start._created_at,
    startedBy: start.author_uuid,
    participants: [...map.entries()].map(([uuid, name]) => ({ uuid, name })),
  };
}

/** Friendly display name derived from an account email. */
export function displayName(email: string | null | undefined): string {
  if (!email) return 'Duck';
  const prefix = email.split('@')[0] || 'duck';
  const cleaned = prefix.replace(/[._+-]+/g, ' ').trim() || 'duck';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'D';
}

export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function avatarColor(seed: string): string {
  return `hsl(${avatarHue(seed)} 55% 45%)`;
}

/* ------------------------------------------------------------------ polls */

export interface PollVoteRow {
  _row_id: number;
  message_row: number;
  channel_slug: string;
  user_uuid: string;
  choice: number;
}

export interface ReactionRow {
  _row_id: number;
  message_row: number;
  channel_slug: string;
  user_uuid: string;
  emoji: string;
}

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const POLL_QUESTION_MIN = 3;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 60;

/** The reactions offered on every message. */
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🦆'] as const;

/** Returns an error message when a poll draft can't be posted. */
export function pollProblem(draft: { question: string; options: string[] }): string | null {
  const q = draft.question.replace(/\s+/g, ' ').trim();
  if (q.length < POLL_QUESTION_MIN || q.length > POLL_QUESTION_MAX) {
    return `Questions need ${POLL_QUESTION_MIN}–${POLL_QUESTION_MAX} characters.`;
  }
  const opts = draft.options.map((o) => o.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (opts.length < POLL_MIN_OPTIONS) return 'Give the poll at least two options.';
  if (opts.length > POLL_MAX_OPTIONS) return `At most ${POLL_MAX_OPTIONS} options.`;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) {
    return 'Two options are the same — tweak one.';
  }
  return null;
}

/** Read the option list off a stored poll message; bad data becomes no options. */
export function parsePollOptions(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) => String(o ?? '')).filter(Boolean).slice(0, POLL_MAX_OPTIONS);
  } catch {
    return [];
  }
}

export interface PollTally {
  counts: number[];
  total: number;
  /** Whole-number percent per option; all zero while nobody has voted. */
  percents: number[];
}

/** Count votes per option, ignoring choices that no longer exist. */
export function tallyPollVotes(options: string[], votes: { choice: number }[]): PollTally {
  const counts = options.map(() => 0);
  let total = 0;
  for (const v of votes) {
    const i = Math.trunc(v.choice);
    if (i >= 0 && i < counts.length) {
      counts[i] += 1;
      total += 1;
    }
  }
  const percents = counts.map((c) => (total > 0 ? Math.round((c / total) * 100) : 0));
  return { counts, total, percents };
}

/** Group reaction rows into chips — emoji, how many ducks, and whether mine is among them. */
export function reactionSummary(
  rows: ReactionRow[],
  me: string | null | undefined,
): { emoji: string; count: number; mine: boolean }[] {
  const order: string[] = [];
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of rows) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, count: 0, mine: false });
      order.push(r.emoji);
    }
    const chip = map.get(r.emoji)!;
    chip.count += 1;
    if (r.user_uuid === me) chip.mine = true;
  }
  return order.map((k) => map.get(k)!).sort((a, b) => b.count - a.count);
}

/** Collapse a message body into the short quote shown above a reply. */
export function replyQuote(body: string | null | undefined): string {
  return String(body ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);
}
