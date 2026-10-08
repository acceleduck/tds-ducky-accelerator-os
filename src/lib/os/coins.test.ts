import { describe, expect, it } from 'vitest';
import {
  AWARD_TABLE,
  DAILY_EARN_CAP,
  PLINKO_BETS,
  PLINKO_MULTS,
  PLINKO_WEIGHTS,
  coinsFor,
  plinkoExpectedValue,
  plinkoPayout,
  pickPlinkoSlot,
} from './coins';

describe('plinko money system', () => {
  // @kliv-spec-derived — from user intent: "plinko has a money system"
  it('pays the bet times the bin multiplier, rounded and never negative', () => {
    expect(plinkoPayout(25, 4)).toBe(63); // 25 * 2.5
    expect(plinkoPayout(10, 1)).toBe(3); // 10 * 0.3
    expect(plinkoPayout(50, 0)).toBe(0); // edge bins pay nothing
    expect(plinkoPayout(10, 99)).toBe(0); // unknown bin pays nothing
  });

  it('keeps a small house edge — expected return is below 1 but above 0.8', () => {
    const ev = plinkoExpectedValue();
    expect(ev).toBeGreaterThan(0.8);
    expect(ev).toBeLessThan(1);
  });

  it('spreads drops across every bin according to the weights', () => {
    const counts = new Array(PLINKO_MULTS.length).fill(0);
    const N = 4000;
    for (let i = 0; i < N; i++) counts[pickPlinkoSlot((i + 0.5) / N)] += 1;
    // deterministic sweep: each bin should get roughly its weight share
    const total = PLINKO_WEIGHTS.reduce((a, b) => a + b, 0);
    for (let b = 0; b < counts.length; b++) {
      const expected = (PLINKO_WEIGHTS[b] / total) * N;
      expect(counts[b]).toBeGreaterThan(expected * 0.5);
      expect(counts[b]).toBeLessThan(expected * 1.5);
    }
  });

  it('only accepts the published bet sizes', () => {
    expect(PLINKO_BETS).toEqual([10, 25, 50, 100, 250]);
    expect(PLINKO_BETS.every((b) => b > 0)).toBe(true);
  });
});

describe('game earnings', () => {
  // @kliv-spec-derived — from user intent: games feed the coin wallet
  it('pays coins per score with each game rate', () => {
    expect(coinsFor('duck-dash', 20)).toBe(40); // rate 2
    expect(coinsFor('duck-blaster', 30)).toBe(30); // rate 1
    expect(coinsFor('factory-fright', 500)).toBe(30); // rate 0.06
  });

  it('caps what a single run can pay', () => {
    expect(coinsFor('duck-dash', 9999)).toBe(AWARD_TABLE['duck-dash'].cap);
    expect(coinsFor('duck-war-3', 999999)).toBe(AWARD_TABLE['duck-war-3'].cap);
  });

  it('ignores impossible scores and unknown games', () => {
    expect(coinsFor('duck-dash', -50)).toBe(0);
    expect(coinsFor('duck-dash', Number.NaN)).toBe(0);
    expect(coinsFor('not-a-game', 500)).toBe(0);
    expect(coinsFor('plinko', 1000)).toBe(0); // plinko spends coins, it does not earn them
  });

  it('keeps the daily earn cap modest', () => {
    expect(DAILY_EARN_CAP).toBeLessThanOrEqual(500);
  });
});
