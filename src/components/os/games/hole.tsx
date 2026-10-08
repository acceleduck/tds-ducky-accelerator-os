import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

const W = 560;
const H = 420;
const DURATION = 75;
const ITEM_COUNT = 44;

interface Tier {
  v: number;
  r: number;
  kind: 'crumb' | 'duck' | 'cone' | 'cart' | 'house';
}

const TIERS: Tier[] = [
  { v: 1, r: 5, kind: 'crumb' },
  { v: 3, r: 8, kind: 'duck' },
  { v: 8, r: 12, kind: 'cone' },
  { v: 20, r: 16, kind: 'cart' },
  { v: 50, r: 24, kind: 'house' },
];

interface Item {
  x: number;
  y: number;
  tier: number;
  sink: number; // 0 = alive, >0 = sinking progress
}

function rollTier(): number {
  const r = Math.random();
  if (r < 0.4) return 0;
  if (r < 0.68) return 1;
  if (r < 0.84) return 2;
  if (r < 0.94) return 3;
  return 4;
}

export function DuckHole({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [eaten, setEaten] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const keys = new Set<string>();
    const hole = { x: W / 2, y: H / 2, r: 16 };
    let target: { x: number; y: number } | null = null;
    const items: Item[] = [];
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      time: DURATION,
      absorbed: 0,
      respawnT: 0,
    };

    const seedItems = () => {
      items.length = 0;
      for (let i = 0; i < ITEM_COUNT; i++) {
        items.push({
          x: 24 + Math.random() * (W - 48),
          y: 24 + Math.random() * (H - 48),
          tier: rollTier(),
          sink: 0,
        });
      }
    };

    const reset = () => {
      hole.x = W / 2;
      hole.y = H / 2;
      hole.r = 16;
      target = null;
      s.phase = 'ready';
      s.time = DURATION;
      s.absorbed = 0;
      seedItems();
      setPhase('ready');
      setEaten(0);
    };
    resetRef.current = reset;
    reset();

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target = {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      };
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', () => {
      if (s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
      }
    });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      if (s.phase === 'playing') {
        s.time -= dt;
        // move (keys or pointer)
        let dx = 0;
        let dy = 0;
        if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
        if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
        if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
        if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1;
          hole.x += (dx / len) * 200 * dt;
          hole.y += (dy / len) * 200 * dt;
        } else if (target) {
          hole.x += (target.x - hole.x) * Math.min(1, 7 * dt);
          hole.y += (target.y - hole.y) * Math.min(1, 7 * dt);
        }
        hole.x = Math.max(hole.r, Math.min(W - hole.r, hole.x));
        hole.y = Math.max(hole.r, Math.min(H - hole.r, hole.y));

        s.respawnT += dt;
        if (s.respawnT > 2.2 && items.length < ITEM_COUNT) {
          s.respawnT = 0;
          items.push({
            x: 24 + Math.random() * (W - 48),
            y: 24 + Math.random() * (H - 48),
            tier: Math.random() < 0.8 ? 0 : 1,
            sink: 0,
          });
        }

        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          const tier = TIERS[it.tier];
          if (it.sink > 0) {
            it.sink += dt / 0.35;
            if (it.sink >= 1) {
              s.absorbed += tier.v;
              hole.r = 16 + Math.sqrt(s.absorbed) * 1.05;
              setEaten(s.absorbed);
              items.splice(i, 1);
            }
            continue;
          }
          const d = Math.hypot(it.x - hole.x, it.y - hole.y);
          if (d < hole.r * 0.9 && tier.r <= hole.r * 0.92) {
            it.sink = 0.001;
          }
        }

        if (s.time <= 0) {
          s.phase = 'over';
          setPhase('over');
          onScoreRef.current(s.absorbed);
        }
      }

      // draw
      ctx.fillStyle = '#16203a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      for (const it of items) {
        const tier = TIERS[it.tier];
        const k = it.sink > 0 ? 1 - it.sink : 1;
        const x = it.sink > 0 ? it.x + (hole.x - it.x) * it.sink : it.x;
        const y = it.sink > 0 ? it.y + (hole.y - it.y) * it.sink : it.y;
        const r = tier.r * k;
        if (r < 0.5) continue;
        ctx.globalAlpha = k;
        if (tier.kind === 'crumb') {
          ctx.fillStyle = '#c9a86b';
          ctx.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
        } else if (tier.kind === 'duck') {
          drawDuck(ctx, x, y, r);
        } else if (tier.kind === 'cone') {
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.8, y + r * 0.7);
          ctx.lineTo(x - r * 0.8, y + r * 0.7);
          ctx.closePath();
          ctx.fill();
        } else if (tier.kind === 'cart') {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x - r * 0.7, y + r * 0.45, r * 0.45, r * 0.3);
          ctx.fillRect(x + r * 0.3, y + r * 0.45, r * 0.45, r * 0.3);
        } else {
          ctx.fillStyle = '#b45309';
          ctx.fillRect(x - r * 0.8, y - r * 0.2, r * 1.6, r * 1.1);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(x - r, y - r * 0.2);
          ctx.lineTo(x, y - r);
          ctx.lineTo(x + r, y - r * 0.2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      const rim = ctx.createRadialGradient(hole.x, hole.y, hole.r * 0.2, hole.x, hole.y, hole.r * 1.25);
      rim.addColorStop(0, 'rgba(0,0,0,0.95)');
      rim.addColorStop(0.75, 'rgba(0,0,0,0.9)');
      rim.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, hole.r * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(139,92,246,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      ctx.fillRect(10, 10, 200, 42);
      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.absorbed} absorbed · size ${Math.round(hole.r)}`, 20, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(`${Math.max(0, s.time).toFixed(0)}s`, 20, 45);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="max-w-full touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🕳️ Duck Hole</div>
            <div className="max-w-xs text-sm text-white/70">
              You are the hole. Swallow crumbs, ducks, cones, carts and whole houses — anything
              smaller than you. Grow big enough to eat the map in 75 seconds. Move with mouse or
              WASD.
            </div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Feast over 🕳️</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{eaten}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Open wide again
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Everything you swallow adds to your score · DuckCoins on finish</div>
    </div>
  );
}
