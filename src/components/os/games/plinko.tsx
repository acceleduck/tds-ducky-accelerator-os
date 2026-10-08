import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PLINKO_BETS, PLINKO_MULTS } from '@/lib/os/coins';
import type { GameProps } from './shared';

const W = 380;
const H = 540;
const BALL_R = 7;
const PEG_R = 5;
const BIN_Y = H - 58;
const binW = W / PLINKO_MULTS.length;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  slot: number;
  mult: number;
  payout: number;
  snapT: number;
  fromX: number;
}

interface HistEntry {
  mult: number;
  net: number;
}

export function PlinkoPond({ onScore, coins }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const coinsRef = useRef(coins);
  coinsRef.current = coins;

  const [bet, setBet] = useState<number>(PLINKO_BETS[1]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const busyRef = useRef(false);
  const betRef = useRef(bet);
  betRef.current = bet;
  const bestRef = useRef(0);
  const dropRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pegs: { x: number; y: number }[] = [];
    for (let row = 0; row < 9; row++) {
      const count = 3 + row;
      const spacing = 38;
      for (let i = 0; i < count; i++) {
        pegs.push({ x: W / 2 + (i - (count - 1) / 2) * spacing, y: 66 + row * 46 });
      }
    }

    let ball: Ball | null = null;
    const flash = new Array(PLINKO_MULTS.length).fill(0);

    const land = (b: Ball) => {
      flash[b.slot] = 0.6;
    };

    const drop = () => {
      if (busyRef.current || ball) return;
      const c = coinsRef.current;
      if (!c) {
        toast.error('DuckCoins are warming up — try again in a second');
        return;
      }
      busyRef.current = true;
      setBusy(true);
      void c.spin(betRef.current).then((res) => {
        // The house settles instantly — the falling ball is just the show.
        busyRef.current = false;
        setBusy(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const net = res.payout - betRef.current;
        setHistory((h) => [{ mult: res.mult, net }, ...h].slice(0, 8));
        if (res.mult >= 2) toast.success(`×${res.mult}! +${res.payout} DuckCoins 🪙`);
        if (res.payout > bestRef.current) {
          bestRef.current = res.payout;
          onScoreRef.current(res.payout);
        }
        ball = {
          x: W / 2 + (Math.random() - 0.5) * 110,
          y: -10,
          vx: (Math.random() - 0.5) * 60,
          vy: 0,
          slot: res.slot,
          mult: res.mult,
          payout: res.payout,
          snapT: 0,
          fromX: 0,
        };
      });
    };
    dropRef.current = drop;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', drop);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      const b = ball;
      if (b) {
        const targetX = b.slot * binW + binW / 2;
        if (b.y < BIN_Y + 6) {
          // falling — physics with a gentle pull toward the house's chosen bin
          b.vy += 1350 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          for (const p of pegs) {
            const dx = b.x - p.x;
            const dy = b.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d < BALL_R + PEG_R && d > 0.01) {
              const nx = dx / d;
              const ny = dy / d;
              b.x = p.x + nx * (BALL_R + PEG_R + 0.5);
              b.y = p.y + ny * (BALL_R + PEG_R + 0.5);
              const dot = b.vx * nx + b.vy * ny;
              b.vx -= 2 * dot * nx;
              b.vy -= 2 * dot * ny;
              b.vx = b.vx * 0.5 + (Math.random() - 0.5) * 55 + (targetX - b.x) * 0.05;
              b.vy = Math.abs(b.vy) * 0.35 + 40;
            }
          }
          if (b.x < BALL_R) {
            b.x = BALL_R;
            b.vx = Math.abs(b.vx) * 0.7;
          }
          if (b.x > W - BALL_R) {
            b.x = W - BALL_R;
            b.vx = -Math.abs(b.vx) * 0.7;
          }
          if (b.y >= BIN_Y + 6) {
            b.fromX = b.x;
            b.snapT = 0;
          }
        } else {
          // settling into the bin the house already paid
          b.snapT += dt / 0.22;
          const t = Math.min(1, b.snapT);
          b.x = b.fromX + (targetX - b.fromX) * t;
          b.y = BIN_Y + 14 + Math.sin(t * Math.PI) * -6;
          if (t >= 1) {
            land(b);
            ball = null;
          }
        }
      }
      // draw
      ctx.fillStyle = '#101426';
      ctx.fillRect(0, 0, W, H);
      for (const p of pegs) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < PLINKO_MULTS.length; i++) {
        const m = PLINKO_MULTS[i];
        const hot = flash[i] > 0;
        if (flash[i] > 0) flash[i] -= dt;
        ctx.fillStyle = hot ? '#ffffff' : m >= 2.5 ? '#e8b004' : m >= 1 ? '#2f9e44' : m >= 0.5 ? '#3a4157' : '#7a2f2f';
        ctx.fillRect(i * binW + 2, BIN_Y, binW - 4, H - BIN_Y - 6);
        ctx.fillStyle = '#0c101d';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m > 0 ? `×${m}` : '×0', i * binW + binW / 2, BIN_Y + 22);
      }
      ctx.textAlign = 'left';
      if (b) {
        ctx.fillStyle = '#f5c518';
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(b.x - 2, b.y - 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const balance = coins?.balance;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-[380px] flex-wrap items-center justify-between gap-2">
        <span className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-[var(--os-accent)]">
          🪙 {balance == null ? '…' : balance} DuckCoins
        </span>
        <div className="flex gap-1">
          {PLINKO_BETS.map((b) => (
            <button
              key={b}
              onClick={() => setBet(b)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                bet === b ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="max-w-full touch-none rounded-2xl" aria-label="Plinko board" />
      <button
        onClick={() => dropRef.current()}
        disabled={busy}
        className="rounded-xl bg-[var(--os-accent)] px-8 py-2.5 text-sm font-semibold text-[#17131f] disabled:opacity-50"
      >
        {busy ? 'Dropping…' : `Drop — bet ${bet} 🪙`}
      </button>
      {history.length > 0 && (
        <div className="flex max-w-[380px] flex-wrap justify-center gap-1.5" aria-label="drop results">
          {history.map((h, i) => (
            <span
              key={i}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                h.net > 0
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : h.net < 0
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-white/[0.06] text-white/60'
              }`}
            >
              Last: ×{h.mult} {h.net >= 0 ? '+' : ''}
              {h.net}
            </span>
          ))}
        </div>
      )}
      <div className="max-w-[380px] text-center text-xs text-white/45">
        Space / tap to drop. Bets and wins are settled by the pond house — the center bin pays ×2.5,
        edges pay nothing. Your best single win posts to the leaderboard.
      </div>
    </div>
  );
}
