import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

export function FactoryFright({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over' | 'won'>('ready');
  const [gears, setGears] = useState(0);
  const [finalScore, setFinalScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 560;
    const H = 430;
    const keys = new Set<string>();
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over' | 'won',
      px: W / 2,
      py: H / 2,
      chasers: [] as { x: number; y: number }[],
      gears: [] as { x: number; y: number; taken: boolean }[],
      collected: 0,
      elapsed: 0,
    };
    const spawn = () => {
      s.chasers = [
        { x: 40, y: 40 },
        { x: W - 40, y: 40 },
        { x: 40, y: H - 40 },
      ];
      s.gears = [];
      for (let i = 0; i < 6; i++) {
        s.gears.push({ x: 50 + Math.random() * (W - 100), y: 50 + Math.random() * (H - 100), taken: false });
      }
    };
    const reset = () => {
      s.phase = 'ready';
      s.px = W / 2;
      s.py = H / 2;
      s.collected = 0;
      s.elapsed = 0;
      spawn();
      setPhase('ready');
      setGears(0);
    };
    resetRef.current = reset;
    reset();

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', () => {
      if (s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
      }
    });

    const finish = (won: boolean) => {
      const base = s.collected * 100 + Math.round(s.elapsed * 8);
      const total = won ? base + 600 : base;
      s.phase = won ? 'won' : 'over';
      setPhase(won ? 'won' : 'over');
      setFinalScore(total);
      onScoreRef.current(total);
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (s.phase === 'playing') {
        s.elapsed += dt;
        const speed = 235;
        let dx = 0;
        let dy = 0;
        if (keys.has('ArrowLeft') || keys.has('KeyA')) dx -= 1;
        if (keys.has('ArrowRight') || keys.has('KeyD')) dx += 1;
        if (keys.has('ArrowUp') || keys.has('KeyW')) dy -= 1;
        if (keys.has('ArrowDown') || keys.has('KeyS')) dy += 1;
        const len = Math.hypot(dx, dy) || 1;
        s.px = Math.min(W - 18, Math.max(18, s.px + (dx / len) * speed * dt));
        s.py = Math.min(H - 18, Math.max(18, s.py + (dy / len) * speed * dt));
        for (const c of s.chasers) {
          const cd = Math.hypot(s.px - c.x, s.py - c.y) || 1;
          const cs = 100 + s.collected * 24;
          c.x += ((s.px - c.x) / cd) * cs * dt;
          c.y += ((s.py - c.y) / cd) * cs * dt;
          if (cd < 18) finish(false);
        }
        for (const g of s.gears) {
          if (!g.taken && Math.hypot(s.px - g.x, s.py - g.y) < 19) {
            g.taken = true;
            s.collected += 1;
            setGears(s.collected);
          }
        }
        if (s.collected >= 6 && Math.hypot(s.px - (W - 46), s.py - (H - 40)) < 26) finish(true);
      }
      // draw
      ctx.fillStyle = '#141021';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // door
      const open = s.collected >= 6;
      ctx.fillStyle = open ? '#2fbf71' : '#5c4a2a';
      ctx.fillRect(W - 66, H - 64, 40, 48);
      ctx.strokeStyle = open ? '#8ff5bd' : '#7a6236';
      ctx.strokeRect(W - 66, H - 64, 40, 48);
      if (open) {
        ctx.fillStyle = '#8ff5bd';
        ctx.font = '10px sans-serif';
        ctx.fillText('EXIT', W - 60, H - 36);
      }
      // gears
      for (const g of s.gears) {
        if (g.taken) continue;
        ctx.fillStyle = '#f5c518';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#141021';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // chasers
      for (const c of s.chasers) {
        ctx.fillStyle = '#8a5cf5';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(c.x - 4, c.y - 3, 2.6, 0, Math.PI * 2);
        ctx.arc(c.x + 4, c.y - 3, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(c.x - 5, c.y + 5);
        ctx.lineTo(c.x - 2, c.y + 8);
        ctx.lineTo(c.x + 1, c.y + 5);
        ctx.lineTo(c.x + 4, c.y + 8);
        ctx.stroke();
      }
      drawDuck(ctx, s.px, s.py, 13);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '12px sans-serif';
      ctx.fillText(`gears ${s.collected}/6`, 10, 20);
      ctx.fillText(`${s.elapsed.toFixed(0)}s`, 10, 38);
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
        <canvas ref={canvasRef} width={560} height={430} className="max-w-full touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🏭 Factory Fright</div>
            <div className="max-w-xs text-sm text-white/70">
              Grab all 6 gears and reach the exit — without the toy gang catching you. They get
              faster with every gear. WASD / arrows to move.
            </div>
            <div className="text-xs text-white/40">Inspired by spooky toy-factory games — 100% original ducks</div>
          </Overlay>
        )}
        {(phase === 'over' || phase === 'won') && (
          <Overlay>
            <div className="text-xl font-bold text-white">
              {phase === 'won' ? 'Escaped! 🎉' : 'Caught! 👾'}
            </div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{finalScore}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Try again
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Gears {gears}/6 · score saves automatically at the end</div>
    </div>
  );
}
