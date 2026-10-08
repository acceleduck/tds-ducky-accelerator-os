import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { GameProps } from './shared';

const TIER_NAMES = [
  'Duckling',
  'Duck',
  'Chonk Duck',
  'Rad Duck',
  'Turbo Duck',
  'Mega Duck',
  'Ultra Duck',
  'DUCK PRIME',
];
const TIER_INCOME = [1, 2, 4, 7, 12, 20, 33, 54];
const TIER_EMOJI = ['🐣', '🐥', '🦆', '😎', '🏎️', '💪', '🌟', '👑'];
const TIER_BG = [
  'from-sky-400/25 to-sky-500/10',
  'from-emerald-400/25 to-emerald-500/10',
  'from-lime-400/25 to-lime-500/10',
  'from-amber-400/25 to-amber-500/10',
  'from-orange-400/25 to-orange-500/10',
  'from-red-400/25 to-red-500/10',
  'from-fuchsia-400/25 to-fuchsia-500/10',
  'from-yellow-300/40 to-amber-500/20',
];

export function DuckMerge({ onScore }: GameProps) {
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [cells, setCells] = useState<(number | null)[]>(Array(16).fill(null));
  const [coins, setCoins] = useState(30);
  const [earned, setEarned] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [purchases, setPurchases] = useState(0);

  const income = cells.reduce<number>((sum, t) => sum + (t != null ? TIER_INCOME[t] : 0), 0);
  const incomeRef = useRef(income);
  incomeRef.current = income;
  const cost = 25 + purchases * 15;

  useEffect(() => {
    const iv = setInterval(() => {
      setCoins((c) => c + incomeRef.current);
      setEarned((e) => e + incomeRef.current);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const buy = () => {
    if (coins < cost) {
      toast.error(`Need ${cost} coins — your flock prints more every second`);
      return;
    }
    const empty = cells.map((c, i) => (c == null ? i : -1)).filter((i) => i >= 0);
    if (empty.length === 0) {
      toast.error('The pond is full — merge some ducks first');
      return;
    }
    const target = empty[Math.floor(Math.random() * empty.length)];
    const tier = Math.random() < 0.85 ? 0 : 1;
    setCells((cs) => cs.map((c, i) => (i === target ? tier : c)));
    setCoins((c) => c - cost);
    setPurchases((p) => p + 1);
    setSel(null);
  };

  const clickCell = (i: number) => {
    if (sel == null) {
      if (cells[i] != null) setSel(i);
      return;
    }
    if (i === sel) {
      setSel(null);
      return;
    }
    const from = cells[sel];
    if (from == null) {
      setSel(null);
      return;
    }
    if (cells[i] == null) {
      // move the duck to the empty spot
      setCells((cs) => cs.map((c, j) => (j === i ? from : j === sel ? null : c)));
      setSel(null);
      return;
    }
    if (cells[i] === from && from < TIER_NAMES.length - 1) {
      const next = from + 1;
      setCells((cs) => cs.map((c, j) => (j === i ? next : j === sel ? null : c)));
      setSel(null);
      if (next === TIER_NAMES.length - 1) toast.success('👑 DUCK PRIME has entered the pond!');
      return;
    }
    setSel(i);
  };

  const submit = () => {
    if (earned < 1) return;
    onScoreRef.current(Math.floor(earned));
    toast.success(`Banked ${Math.floor(earned)} as your score — the flock keeps working!`);
  };

  return (
    <div className="flex w-full max-w-[520px] flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-[var(--os-accent)]">🪙 {Math.floor(coins)} pond coins</span>
        <span className="text-white/60">+{income}/s · earned {Math.floor(earned)}</span>
      </div>
      <div className="grid w-full grid-cols-4 gap-2">
        {cells.map((tier, i) => (
          <button
            key={i}
            onClick={() => clickCell(i)}
            className={`flex aspect-square items-center justify-center rounded-2xl border transition ${
              tier == null
                ? 'border-dashed border-white/10 bg-white/[0.03] hover:border-white/25'
                : `border-white/15 bg-gradient-to-br ${TIER_BG[tier]} ${sel === i ? 'ring-2 ring-[var(--os-accent)]' : 'hover:border-white/35'}`
            }`}
            title={tier == null ? 'empty water' : `${TIER_NAMES[tier]} · +${TIER_INCOME[tier]}/s`}
          >
            {tier != null && (
              <span style={{ fontSize: 20 + tier * 3.5 }} className="select-none leading-none">
                {TIER_EMOJI[tier]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={buy}
          className="rounded-xl bg-[var(--os-accent)] px-5 py-2 text-sm font-semibold text-[#17131f]"
        >
          Buy duck ({cost} 🪙)
        </button>
        <button
          onClick={submit}
          disabled={earned < 1}
          className="rounded-xl border border-white/15 px-5 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50"
        >
          Submit score
        </button>
      </div>
      {sel != null && cells[sel] != null && (
        <div className="text-xs text-white/50">
          Selected {TIER_NAMES[cells[sel] as number]} — tap a matching duck to merge, or an empty spot to move
        </div>
      )}
      <div className="text-center text-[11px] leading-relaxed text-white/40">
        Tap two identical ducks to merge them into the next tier. Every duck on the pond prints
        coins each second — bigger tiers print way more. Score = total coins earned.
      </div>
    </div>
  );
}
