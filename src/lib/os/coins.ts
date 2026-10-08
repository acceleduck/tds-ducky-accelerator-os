/**
 * DuckCoins economy rules, mirrored for display and tests.
 * The amounts are settled server-side by the duckcoins-house function —
 * keep the tables here in sync with it.
 */

export const DUCKCOIN_START = 500;
export const DAILY_EARN_CAP = 300;

export const PLINKO_BETS = [10, 25, 50, 100, 250];
/** 9 bins, center pays best. Weights make the house keep a small edge. */
export const PLINKO_MULTS = [0, 0.3, 0.7, 1.2, 2.5, 1.2, 0.7, 0.3, 0];
export const PLINKO_WEIGHTS = [10, 14, 20, 24, 16, 24, 20, 14, 10];

export function plinkoPayout(bet: number, slot: number): number {
  const mult = PLINKO_MULTS[slot] ?? 0;
  return Math.max(0, Math.round(bet * mult));
}

/** Average return per coin bet — below 1 so the pond keeps a small edge. */
export function plinkoExpectedValue(): number {
  const total = PLINKO_WEIGHTS.reduce((a, b) => a + b, 0);
  return PLINKO_MULTS.reduce((sum, m, i) => sum + m * PLINKO_WEIGHTS[i], 0) / total;
}

export function pickPlinkoSlot(rand = Math.random()): number {
  const total = PLINKO_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rand * total;
  for (let i = 0; i < PLINKO_WEIGHTS.length; i++) {
    r -= PLINKO_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return PLINKO_WEIGHTS.length - 1;
}

export interface AwardRule {
  /** coins per point of score */
  rate: number;
  /** most a single run can pay */
  cap: number;
  /** highest score the house believes (anti-typo clamp) */
  max: number;
}

export const AWARD_TABLE: Record<string, AwardRule> = {
  'duck-dash': { rate: 2, cap: 40, max: 999 },
  'factory-fright': { rate: 0.06, cap: 60, max: 6000 },
  gridiron: { rate: 2, cap: 50, max: 999 },
  'liquid-soccer': { rate: 0.15, cap: 40, max: 1500 },
  'duck-drift': { rate: 0.08, cap: 60, max: 6000 },
  'duck-hole': { rate: 0.1, cap: 60, max: 3000 },
  'duck-merge': { rate: 0.02, cap: 80, max: 250000 },
  'duck-blocks': { rate: 0.05, cap: 60, max: 6000 },
  'duck-blaster': { rate: 1, cap: 50, max: 999 },
  'duck-war-3': { rate: 0.05, cap: 100, max: 30000 },
};

/** Coins the house pays for a finished run. */
export function coinsFor(game: string, rawScore: number): number {
  const rule = AWARD_TABLE[game];
  if (!rule) return 0;
  const score = Math.max(0, Math.min(rule.max, Math.floor(rawScore || 0)));
  return Math.min(rule.cap, Math.ceil(score * rule.rate));
}
