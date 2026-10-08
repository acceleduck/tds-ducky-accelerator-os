import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_LOOKBACK,
  MUTE_MS,
  RATE_LIMIT_5S,
  evaluateMessage,
  nextMute,
} from './moderation';

const now = 10_000_000_000;
const sec = (ago: number) => (now - ago * 1000) / 1000;

describe('message shape', () => {
  it('rejects empty and oversized messages', () => {
    expect(evaluateMessage('text', '   ', [], null, now).code).toBe('empty');
    expect(evaluateMessage('text', 'x'.repeat(1501), [], null, now).code).toBe('too_long');
    expect(evaluateMessage('text', 'hello', [], null, now).ok).toBe(true);
  });

  it('only accepts image messages that are real links or stored files', () => {
    expect(evaluateMessage('image', 'https://example.com/cat.gif', [], null, now).ok).toBe(true);
    expect(evaluateMessage('image', '/content/chat-uploads/pic.png', [], null, now).ok).toBe(true);
    expect(evaluateMessage('image', 'javascript:alert(1)', [], null, now).code).toBe('bad_image');
    expect(evaluateMessage('image', 'not a link', [], null, now).code).toBe('bad_image');
  });
});

describe('rate limits', () => {
  it(`blocks the ${RATE_LIMIT_5S + 1}th message within 5 seconds`, () => {
    const recent = Array.from({ length: RATE_LIMIT_5S }, (_, i) => ({ body: `m${i}`, _created_at: sec(1) }));
    expect(evaluateMessage('text', 'one more', recent, null, now).code).toBe('rate_short');
  });

  it('allows steady quacking under the burst limit', () => {
    const recent = Array.from({ length: RATE_LIMIT_5S - 1 }, (_, i) => ({ body: `m${i}`, _created_at: sec(1) }));
    expect(evaluateMessage('text', 'one more', recent, null, now).ok).toBe(true);
  });

  it('blocks sustained flooding over a minute even under the burst limit', () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({ body: `m${i}`, _created_at: sec(10 + i) }));
    expect(evaluateMessage('text', 'another', recent, null, now).code).toBe('rate_long');
  });
});

describe('duplicates, links and caps', () => {
  it(`blocks a repeat of the last ${DUPLICATE_LOOKBACK} messages but not older ones`, () => {
    const recent = [
      { body: 'latest', _created_at: sec(2) },
      { body: 'middle', _created_at: sec(4) },
      { body: 'older', _created_at: sec(6) },
      { body: 'ancient', _created_at: sec(8) },
    ];
    expect(evaluateMessage('text', 'latest', recent, null, now).code).toBe('duplicate');
    expect(evaluateMessage('text', 'ancient', recent, null, now).ok).toBe(true);
  });

  it('blocks link dumps over three links', () => {
    const four = 'a b c d https://x.com/1 https://x.com/2 https://x.com/3 https://x.com/4';
    expect(evaluateMessage('text', four, [], null, now).code).toBe('too_many_links');
    const three = 'a b c https://x.com/1 https://x.com/2 https://x.com/3';
    expect(evaluateMessage('text', three, [], null, now).ok).toBe(true);
  });

  it('tells shouty ducks to quiet down', () => {
    expect(evaluateMessage('text', 'THIS IS SO COOL EVERYONE', [], null, now).code).toBe('shouting');
    expect(evaluateMessage('text', 'this is so cool everyone', [], null, now).ok).toBe(true);
  });
});

describe('mutes', () => {
  it('blocks messages while muted and reports the remaining time', () => {
    const verdict = evaluateMessage('text', 'hi', [], { until: now + 30_000, strikes: 0, window_start: now }, now);
    expect(verdict.ok).toBe(false);
    expect(verdict.code).toBe('muted');
    expect(verdict.mutedUntil).toBe(now + 30_000);
  });

  it('escalates: three strikes inside the window mute for a minute, then reset', () => {
    const first = nextMute(null, now);
    expect(first.strikes).toBe(1);
    const second = nextMute(first, now + 1000);
    expect(second.strikes).toBe(2);
    const third = nextMute(second, now + 2000);
    expect(third.until).toBe(now + 2000 + MUTE_MS);
    expect(third.strikes).toBe(0);
  });

  it('wipes the slate when the strike window has passed', () => {
    const old = { strikes: 2, window_start: now - 11 * 60_000, until: 0 };
    expect(nextMute(old, now).strikes).toBe(1);
  });
});
