import { describe, it, expect } from 'vitest';
import {
  pollProblem,
  parsePollOptions,
  tallyPollVotes,
  reactionSummary,
  replyQuote,
  type ReactionRow,
} from './chat';

// @kliv-spec-derived — from user intent: "discord like mechanics like polls"
describe('pollProblem', () => {
  it('accepts a normal poll', () => {
    expect(pollProblem({ question: 'Best pond snack?', options: ['Bread', 'Corn'] })).toBeNull();
  });

  it('rejects too-few, too-many or duplicate options', () => {
    expect(pollProblem({ question: 'Pick one', options: ['Only'] })).toMatch(/two options/i);
    expect(pollProblem({ question: 'Pick one', options: ['A', 'B', 'C', 'D', 'E'] })).toMatch(/at most/i);
    expect(pollProblem({ question: 'Pick one', options: ['Bread', 'bread'] })).toMatch(/same/i);
  });

  it('rejects missing or oversized questions', () => {
    expect(pollProblem({ question: 'ab', options: ['A', 'B'] })).toMatch(/characters/i);
    expect(pollProblem({ question: 'x'.repeat(141), options: ['A', 'B'] })).toMatch(/characters/i);
  });
});

describe('parsePollOptions', () => {
  it('round-trips an option list', () => {
    expect(parsePollOptions(JSON.stringify(['A', 'B', 'C']))).toEqual(['A', 'B', 'C']);
  });

  it('treats broken data as no options instead of crashing', () => {
    expect(parsePollOptions('{"oops"')).toEqual([]);
    expect(parsePollOptions(null)).toEqual([]);
    expect(parsePollOptions('not-an-array')).toEqual([]);
  });
});

describe('tallyPollVotes', () => {
  it('counts each choice once and reports percentages', () => {
    const t = tallyPollVotes(['A', 'B'], [{ choice: 0 }, { choice: 1 }, { choice: 0 }]);
    expect(t.total).toBe(3);
    expect(t.counts).toEqual([2, 1]);
    expect(t.percents).toEqual([67, 33]);
  });

  it('shows zeros while nobody has voted', () => {
    const t = tallyPollVotes(['A', 'B'], []);
    expect(t.total).toBe(0);
    expect(t.percents).toEqual([0, 0]);
  });

  it('ignores out-of-range choices so a deleted option cannot fake counts', () => {
    const t = tallyPollVotes(['A'], [{ choice: 5 }, { choice: -1 }, { choice: 0 }]);
    expect(t.total).toBe(1);
    expect(t.counts).toEqual([1]);
  });
});

describe('reactionSummary', () => {
  const row = (over: Partial<ReactionRow>): ReactionRow => ({
    _row_id: 1,
    message_row: 10,
    channel_slug: 'duck-lounge',
    user_uuid: 'u1',
    emoji: '👍',
    ...over,
  });

  it('groups by emoji, counts, and marks my own', () => {
    const chips = reactionSummary(
      [row({ user_uuid: 'u1', emoji: '🦆' }), row({ user_uuid: 'u2', emoji: '🦆' }), row({ user_uuid: 'u2', emoji: '👍' })],
      'u1',
    );
    expect(chips).toEqual([
      { emoji: '🦆', count: 2, mine: true },
      { emoji: '👍', count: 1, mine: false },
    ]);
  });

  it('keeps stable order for ties so chips do not jump around', () => {
    const chips = reactionSummary([row({ emoji: '❤️' }), row({ emoji: '👍' })], 'u9');
    expect(chips.map((c) => c.emoji)).toEqual(['❤️', '👍']);
  });
});

describe('replyQuote', () => {
  it('collapses whitespace and caps the length', () => {
    expect(replyQuote('  hello \n   pond ')).toBe('hello pond');
    expect(replyQuote('x'.repeat(300)).length).toBe(140);
    expect(replyQuote(null)).toBe('');
  });
});
