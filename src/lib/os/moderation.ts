export const MAX_MESSAGE_LEN = 1500;
export const RATE_LIMIT_5S = 4;
export const RATE_LIMIT_60S = 12;
export const MAX_LINKS = 3;
export const DUPLICATE_LOOKBACK = 3;
export const STRIKE_WINDOW_MS = 10 * 60_000;
export const MUTE_MS = 60_000;

/** `_created_at` is unix seconds, matching the chat tables. */
export interface RecentMessage {
  body: string;
  _created_at: number;
}

export interface MuteRecord {
  until: number;
  strikes: number;
  window_start: number;
}

export type ModerationCode =
  | 'ok'
  | 'empty'
  | 'too_long'
  | 'bad_image'
  | 'muted'
  | 'rate_short'
  | 'rate_long'
  | 'duplicate'
  | 'too_many_links'
  | 'shouting';

export interface ModerationVerdict {
  ok: boolean;
  code: ModerationCode;
  userMessage: string;
  mutedUntil?: number;
}

const MESSAGES: Record<Exclude<ModerationCode, 'ok'>, string> = {
  empty: 'Nothing to send',
  too_long: `Keep it under ${MAX_MESSAGE_LEN} characters`,
  bad_image: "That image link doesn't look right",
  muted: 'PondGuard muted you — take a breather',
  rate_short: 'Easy on the send button — too many quacks at once',
  rate_long: "Slow down, the pond can't keep up",
  duplicate: 'You already sent that',
  too_many_links: "That's too many links for one message",
  shouting: 'PLEASE STOP SHOUTING (see?)',
};

/**
 * The PondGuard rulebook, mirrored server-side by the chat-guard function.
 * Order matters: mute first, then shape, then rate, then duplicates, then links, then caps.
 */
export function evaluateMessage(
  kind: 'text' | 'image',
  body: string,
  recent: RecentMessage[],
  mute: MuteRecord | null,
  nowMs: number,
): ModerationVerdict {
  const text = body.trim();

  if (mute && mute.until > nowMs) {
    return { ok: false, code: 'muted', userMessage: MESSAGES.muted, mutedUntil: mute.until };
  }

  if (kind === 'image') {
    const okUrl = /^(https?:\/\/|\/content\/)/i.test(text) && text.length <= 600;
    return okUrl
      ? { ok: true, code: 'ok', userMessage: '' }
      : { ok: false, code: 'bad_image', userMessage: MESSAGES.bad_image };
  }

  if (!text) return { ok: false, code: 'empty', userMessage: MESSAGES.empty };
  if (text.length > MAX_MESSAGE_LEN) return { ok: false, code: 'too_long', userMessage: MESSAGES.too_long };

  const nowSec = nowMs / 1000;
  if (recent.filter((r) => nowSec - r._created_at <= 5).length >= RATE_LIMIT_5S) {
    return { ok: false, code: 'rate_short', userMessage: MESSAGES.rate_short };
  }
  if (recent.filter((r) => nowSec - r._created_at <= 60).length >= RATE_LIMIT_60S) {
    return { ok: false, code: 'rate_long', userMessage: MESSAGES.rate_long };
  }
  if (recent.slice(0, DUPLICATE_LOOKBACK).some((r) => r.body === text)) {
    return { ok: false, code: 'duplicate', userMessage: MESSAGES.duplicate };
  }
  if ((text.match(/https?:\/\//g) ?? []).length > MAX_LINKS) {
    return { ok: false, code: 'too_many_links', userMessage: MESSAGES.too_many_links };
  }

  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 12) {
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (upper / letters.length > 0.85) {
      return { ok: false, code: 'shouting', userMessage: MESSAGES.shouting };
    }
  }

  return { ok: true, code: 'ok', userMessage: '' };
}

/** Strike escalation: 3 violations inside 10 minutes earns a 60-second mute, then a clean slate. */
export function nextMute(mute: MuteRecord | null, nowMs: number): MuteRecord {
  const inWindow = !!mute && nowMs - mute.window_start < STRIKE_WINDOW_MS;
  const strikes = inWindow ? mute!.strikes + 1 : 1;
  if (strikes >= 3) return { strikes: 0, window_start: nowMs, until: nowMs + MUTE_MS };
  return { strikes, window_start: inWindow ? mute!.window_start : nowMs, until: 0 };
}
