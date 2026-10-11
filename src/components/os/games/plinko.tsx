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
const MAX_LIVE = 12;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  slot: number; // -1 pending the house, -2 voided
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
  const [auto, setAuto] = useState(false);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const betRef = useRef(bet);
  betRef.current = bet;
  const bestRef = useRef(0);
  const dropRef = useRef<() => void>(() => {});
  const balRef = useRef<number | null>(null);
  const liveRef = useRef(0);
  const autoRef = useRef(false);
  const lastThrottleRef = useRef(0);

  useEffect(() => {
    if (typeof coins?.balance === 'number') balRef.current = coins.balance;
  }, [coins?.balance]);

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

    const balls: Ball[] = [];
    const flash = new Array(PLINKO_MULTS.length).fill(0);

    const drop = () => {
      const c = coinsRef.current;
      if (!c) {
        toast.error('DuckCoins are warming up — try again in a second');
        return;
      }
      const stake = betRef.current;
      const bal = balRef.current;
      if (bal != null && bal < stake) {
        toast.error('Not enough DuckCoins — win some in the arcade first');
        autoRef.current = false;
        setAuto(false);
        return;
      }
      if (liveRef.current >= MAX_LIVE) {
        const now = performance.now();
        if (now - lastThrottleRef.current > 1600) {
          lastThrottleRef.current = now;
          toast('Easy, featherweight — let a few balls land 🦆');
        }
        return;
      }
      liveRef.current += 1;
      if (balRef.current != null) balRef.current -= stake;
      const ball: Ball = {
        x: W / 2 + (Math.random() - 0.5) * 110,
        y: -10 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 60,
        vy: 0,
        slot: -1,
        mult: 0,
        payout: 0,
        snapT: 0,
        fromX: 0,
      };
      balls.push(ball);
      void c.spin(stake).then((res) => {
        liveRef.current -= 1;
        if (!res.ok) {
          ball.slot = -2; // voided — refund already applied by the house
          if (typeof res.balance === 'number') balRef.current = res.balance;
          toast.error(res.message);
          return;
        }
        balRef.current = res.balance;
        ball.slot = res.slot;
        ball.mult = res.mult;
        ball.payout = res.payout;
        const net = res.payout - stake;
        setHistory((h) => [{ mult: res.mult, net }, ...h].slice(0, 10));
        if (res.mult >= 2) toast.success(`×${res.mult}! +${res.payout} DuckCoins 🪙`);
        if (res.payout > bestRef.current) {
          bestRef.current = res.payout;
          onScoreRef.current(res.payout);
        }
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

    let autoT = 0;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.03, (now - last) / 1000);
      last = now;
      if (autoRef.current) {
        autoT += dt;
        if (autoT >= 0.7) {
          autoT = 0;
          drop();
        }
      }

      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.slot === -2) {
          balls.splice(i, 1);
          continue;
        }
        const targetX = b.slot >= 0 ? b.slot * binW + binW / 2 : W / 2;
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
              b.vx = b.vx * 0.5 + (Math.random() - 0.5) * 55 + (targetX - b.x) * (b.slot >= 0 ? 0.05 : 0.012);
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
          // still waiting on the house? bob just above the bins
          if (b.slot < 0 && b.y > BIN_Y - 6) {
            b.y = BIN_Y - 6;
            b.vy = -Math.abs(b.vy) * 0.3;
            b.vx *= 0.94;
          }
        } else if (b.slot >= 0) {
          // settling into the bin the house already paid
          if (b.snapT === 0) b.fromX = b.x;
          b.snapT += dt / 0.22;
          const t = Math.min(1, b.snapT);
          b.x = b.fromX + (targetX - b.fromX) * t;
          b.y = BIN_Y + 14 + Math.sin(t * Math.PI) * -6;
          if (t >= 1) {
            flash[b.slot] = 0.6;
            balls.splice(i, 1);
          }
        } else {
          b.y = BIN_Y - 6;
          b.vy = 0;
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
      for (const b of balls) {
        ctx.fillStyle = b.slot === -1 ? 'rgba(245,197,24,0.6)' : '#f5c518';
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
          🪙 {balance == null ? '…' : balance.toLocaleString()} DuckCoins
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
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => dropRef.current()}
          className="rounded-xl bg-[var(--os-accent)] px-8 py-2.5 text-sm font-semibold text-[#17131f]"
        >
          Drop — bet {bet} 🪙
        </button>
        <button
          onClick={() => {
            const next = !auto;
            autoRef.current = next;
            setAuto(next);
          }}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
            auto ? 'bg-red-500 text-white' : 'bg-white/[0.08] text-white/80 hover:bg-white/15'
          }`}
        >
          {auto ? '■ Stop auto' : '▶ Auto-bet'}
        </button>
      </div>
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
              ×{h.mult} {h.net >= 0 ? '+' : ''}
              {h.net}
            </span>
          ))}
        </div>
      )}
      <div className="max-w-[380px] text-center text-xs text-white/45">
        Space / click to drop — spam it, up to {MAX_LIVE} balls in the air. Auto-bet fires a drop every 0.7s until you
        stop it or the coins run out. The pond house settles every ball; the center bin pays ×2.5.
      </div>
    </div>
  );
}
