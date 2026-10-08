import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

export function DuckDash({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 420;
    const H = 600;
    const PIPE_W = 64;
    const GAP = 182;
    const SPEED = 215;
    const GRAV = 1500;
    const FLAP = -430;
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      y: H / 2,
      vy: 0,
      t: 0,
      lastPipe: -99,
      pipes: [] as { x: number; gapY: number; passed: boolean }[],
      score: 0,
    };
    resetRef.current = () => {
      s.phase = 'ready';
      s.y = H / 2;
      s.vy = 0;
      s.t = 0;
      s.lastPipe = -99;
      s.pipes = [];
      s.score = 0;
      setPhase('ready');
      setScore(0);
    };
    const flap = () => {
      if (s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
        s.vy = FLAP;
      } else if (s.phase === 'playing') {
        s.vy = FLAP;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', flap);

    const gameOver = () => {
      if (s.phase !== 'playing') return;
      s.phase = 'over';
      setPhase('over');
      onScoreRef.current(s.score);
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      s.t += dt;
      if (s.phase === 'playing') {
        s.vy += GRAV * dt;
        s.y += s.vy * dt;
        if (s.t - s.lastPipe > 1.42) {
          s.lastPipe = s.t;
          s.pipes.push({ x: W + 40, gapY: 105 + Math.random() * (H - 310), passed: false });
        }
        for (const p of s.pipes) {
          p.x -= SPEED * dt;
          if (!p.passed && p.x + PIPE_W < 80) {
            p.passed = true;
            s.score += 1;
            setScore(s.score);
          }
        }
        s.pipes = s.pipes.filter((p) => p.x > -90);
        const r = 15;
        if (s.y + r >= H - 14 || s.y - r <= 0) gameOver();
        for (const p of s.pipes) {
          if (
            80 + r > p.x &&
            80 - r < p.x + PIPE_W &&
            (s.y - r < p.gapY || s.y + r > p.gapY + GAP)
          )
            gameOver();
        }
      }
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1a2f55');
      grad.addColorStop(1, '#0c1730');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      for (const p of s.pipes) {
        ctx.fillStyle = '#2f9e44';
        ctx.fillRect(p.x, 0, PIPE_W, p.gapY);
        ctx.fillRect(p.x, p.gapY + GAP, PIPE_W, H - p.gapY - GAP - 14);
        ctx.fillStyle = '#37b24d';
        ctx.fillRect(p.x - 3, p.gapY - 16, PIPE_W + 6, 16);
        ctx.fillRect(p.x - 3, p.gapY + GAP, PIPE_W + 6, 16);
      }
      ctx.fillStyle = '#16325c';
      ctx.fillRect(0, H - 14, W, 14);
      drawDuck(ctx, 80, s.y, 15, Math.max(-0.5, Math.min(0.9, s.vy / 600)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', flap);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas ref={canvasRef} width={420} height={600} className="max-w-full touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🦆 Duck Dash</div>
            <div className="text-sm text-white/70">Space or tap to flap. Mind the pipes.</div>
            <div className="text-xs text-white/40">Each pipe passed = 1 point</div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Splash! 💦</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Fly again
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Score {score} · saved to the leaderboard on splash</div>
    </div>
  );
}
