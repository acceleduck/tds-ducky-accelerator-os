import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { GameProps } from './shared';

const SUITS = [
  { g: '♠', red: false },
  { g: '♥', red: true },
  { g: '♦', red: true },
  { g: '♣', red: false },
];
const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

interface PCard {
  v: number; // 2..14
  s: number;
}

function freshDeck(): PCard[] {
  const deck: PCard[] = [];
  for (let s = 0; s < 4; s++) for (let v = 2; v <= 14; v++) deck.push({ v, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const POKER_PAYTABLE: { name: string; mult: number }[] = [
  { name: 'Royal Flush', mult: 250 },
  { name: 'Straight Flush', mult: 50 },
  { name: 'Four of a Kind', mult: 25 },
  { name: 'Full House', mult: 9 },
  { name: 'Flush', mult: 6 },
  { name: 'Straight', mult: 4 },
  { name: 'Three of a Kind', mult: 3 },
  { name: 'Two Pair', mult: 2 },
  { name: 'Jacks or Better', mult: 1 },
];

function evaluatePoker(hand: PCard[]): { name: string; mult: number } | null {
  const values = hand.map((c) => c.v).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const countList = [...counts.values()].sort((a, b) => b - a);
  const flush = hand.every((c) => c.s === hand[0].s);
  const uniq = [...new Set(values)];
  let straight = uniq.length === 5 && uniq[4] - uniq[0] === 4;
  const wheel = uniq.length === 5 && uniq[0] === 2 && uniq[1] === 3 && uniq[2] === 4 && uniq[3] === 5 && uniq[4] === 14;
  if (wheel) straight = true;
  const high = values[4];
  if (flush && straight && high === 14 && uniq[0] === 10) return POKER_PAYTABLE[0];
  if (flush && straight) return POKER_PAYTABLE[1];
  if (countList[0] === 4) return POKER_PAYTABLE[2];
  if (countList[0] === 3 && countList[1] === 2) return POKER_PAYTABLE[3];
  if (flush) return POKER_PAYTABLE[4];
  if (straight) return POKER_PAYTABLE[5];
  if (countList[0] === 3) return POKER_PAYTABLE[6];
  if (countList[0] === 2 && countList[1] === 2) return POKER_PAYTABLE[7];
  if (countList[0] === 2) {
    const pairV = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pairV >= 11 || pairV === 14) return POKER_PAYTABLE[8];
  }
  return null;
}

function DuckPoker({ onScore }: GameProps) {
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [deck, setDeck] = useState<PCard[]>([]);
  const [hand, setHand] = useState<PCard[]>([]);
  const [holds, setHolds] = useState<boolean[]>([false, false, false, false, false]);
  const [phase, setPhase] = useState<'idle' | 'hold' | 'result'>('idle');
  const [chips, setChips] = useState(500);
  const [message, setMessage] = useState('Ante is 50 chips — deal to start.');
  const chipsRef = useRef(500);
  chipsRef.current = chips;

  const deal = () => {
    if (chipsRef.current < 50) {
      setMessage('Not enough chips — bank your score to reset to 500.');
      return;
    }
    const d = freshDeck();
    const h = d.splice(0, 5);
    setDeck(d);
    setHand(h);
    setHolds([false, false, false, false, false]);
    setChips((c) => c - 50);
    setPhase('hold');
    setMessage('Tap cards to hold, then draw.');
  };

  const draw = () => {
    const d = [...deck];
    const next = hand.map((c, i) => (holds[i] ? c : d.pop()!));
    setDeck(d);
    setHand(next);
    const result = evaluatePoker(next);
    if (result) {
      const payout = 50 * result.mult;
      setChips((c) => c + payout);
      setMessage(`${result.name}! Won ${payout} chips (×${result.mult}).`);
    } else {
      setMessage('No paying hand — deal again.');
    }
    setPhase('result');
  };

  const bank = () => {
    onScoreRef.current(chips);
    toast.success(`Banked ${chips} chips as your score!`);
    setChips(500);
    setMessage('Ante is 50 chips — deal to start.');
    setPhase('idle');
    setHand([]);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-sm font-semibold text-white/85">🃏 Duck Poker — Jacks or Better</div>
      <div className="text-lg font-bold text-[var(--os-accent)]">🪙 {chips} chips</div>
      <div className="flex flex-wrap justify-center gap-2">
        {(hand.length > 0 ? hand : Array.from({ length: 5 })).map((c, i) => {
          const card = c as PCard | undefined;
          const held = holds[i];
          return (
            <button
              key={i}
              onClick={() => {
                if (phase !== 'hold') return;
                setHolds((h) => h.map((v, j) => (j === i ? !v : v)));
              }}
              className={`relative flex h-28 w-20 flex-col items-center justify-center rounded-xl border text-2xl font-bold transition ${
                card
                  ? held
                    ? 'border-[var(--os-accent)] bg-white ring-2 ring-[var(--os-accent)]'
                    : 'border-white/20 bg-white hover:border-white/50'
                  : 'border-dashed border-white/20 bg-white/5'
              } ${card && SUITS[card.s].red ? 'text-red-600' : 'text-[#17131f]'}`}
            >
              {card ? (
                <>
                  <span>{RANK_NAMES[card.v - 2]}</span>
                  <span className="text-3xl">{SUITS[card.s].g}</span>
                </>
              ) : (
                <span className="text-white/20">?</span>
              )}
              {held && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--os-accent)] px-2 py-0.5 text-[9px] font-bold text-[#17131f]">
                  HELD
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {(phase === 'idle' || phase === 'result') && (
          <button
            onClick={deal}
            className="rounded-xl bg-[var(--os-accent)] px-6 py-2.5 text-sm font-semibold text-[#17131f]"
          >
            Deal (50)
          </button>
        )}
        {phase === 'hold' && (
          <button
            onClick={draw}
            className="rounded-xl bg-[var(--os-accent)] px-6 py-2.5 text-sm font-semibold text-[#17131f]"
          >
            Draw
          </button>
        )}
        <button
          onClick={bank}
          className="rounded-xl border border-white/15 px-6 py-2.5 text-sm text-white/80 hover:bg-white/10"
        >
          Bank score
        </button>
      </div>
      <div className="max-w-md text-center text-xs text-white/50">{message}</div>
      <div className="grid w-full max-w-md grid-cols-3 gap-1 text-[10px] text-white/40">
        {POKER_PAYTABLE.map((p) => (
          <div key={p.name} className="flex justify-between rounded bg-white/[0.03] px-2 py-1">
            <span>{p.name}</span>
            <span className="text-[var(--os-accent)]">×{p.mult}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DuckPoker };
