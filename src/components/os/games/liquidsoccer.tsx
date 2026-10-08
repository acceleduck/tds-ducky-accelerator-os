import { useEffect, useRef, useState } from 'react';
import { Overlay, type GameProps } from './shared';

export function LiquidSoccer({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [score, setScore] = useState({ me: 0, ai: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 560;
    const H = 380;
    const GROUND = H - 26;
    const GOAL_W = 88;
    const GOAL_H = 100;
    const R = 17;
    const BR = 9;
    const keys = new Set<string>();
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      me: { x: 150, y: GROUND, vy: 0 },
      ai: { x: W - 150, y: GROUND, vy: 0 },
      ball: { x: W / 2, y: GROUND - BR, vx: 0, vy: 0 },
      goals: { me: 0, ai: 0 },
    };
    const resetPositions = () => {
      s.me = { x: 150, y: GROUND, vy: 0 };
      s.ai = { x: W - 150, y: GROUND, vy: 0 };
      s.ball = { x: W / 2, y: GROUND - 120, vx: 0, vy: 0 };
    };
    const reset = () => {
      s.phase = 'ready';
      s.goals = { me: 0, ai: 0 };
      resetPositions();
      setPhase('ready');
      setScore({ me: 0, ai: 0 });
    };
    resetRef.current = reset;

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'ArrowUp') && s.phase === 'ready') {
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

    const goal = (who: 'me' | 'ai') => {
      s.goals[who] += 1;
      setScore({ ...s.goals });
      resetPositions();
      if (s.goals.me >= 5 || s.goals.ai >= 5) {
        s.phase = 'over';
        setPhase('over');
        onScoreRef.current(Math.max(0, s.goals.me * 100 - s.goals.ai * 20));
      }
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.028, (now - last) / 1000);
      last = now;
      const G = 1250;
      if (s.phase === 'playing') {
        // player input
        if (keys.has('ArrowLeft') || keys.has('KeyA')) s.me.x -= 265 * dt;
        if (keys.has('ArrowRight') || keys.has('KeyD')) s.me.x += 265 * dt;
        const kick = keys.has('Space') || keys.has('ArrowUp');
        if (kick && s.me.y >= GROUND - 1) s.me.vy = -470;
        // ai
        const targetX = s.ball.x + (s.ball.x < W / 2 ? 26 : -26);
        s.ai.x += Math.sign(targetX - s.ai.x) * Math.min(135, Math.abs(targetX - s.ai.x) / dt) * dt;
        if (Math.abs(s.ball.x - s.ai.x) < 46 && s.ball.y > GROUND - 90 && s.ai.y >= GROUND - 1 && Math.random() < 0.03)
          s.ai.vy = -470;
        // physics
        for (const b of [s.me, s.ai]) {
          b.vy += G * dt;
          b.y = Math.min(GROUND, b.y + b.vy * dt);
          if (b.y >= GROUND) b.vy = 0;
        }
        s.me.x = Math.min(W - R, Math.max(R, s.me.x));
        s.ai.x = Math.min(W - R, Math.max(R, s.ai.x));
        s.ball.vy += G * dt;
        s.ball.x += s.ball.vx * dt;
        s.ball.y += s.ball.vy * dt;
        if (s.ball.y > GROUND - BR) {
          s.ball.y = GROUND - BR;
          s.ball.vy = -Math.abs(s.ball.vy) * 0.68;
          s.ball.vx *= 0.96;
        }
        if (s.ball.x < BR) {
          s.ball.x = BR;
          s.ball.vx = Math.abs(s.ball.vx) * 0.7;
        }
        if (s.ball.x > W - BR) {
          s.ball.x = W - BR;
          s.ball.vx = -Math.abs(s.ball.vx) * 0.7;
        }
        if (s.ball.y < BR) {
          s.ball.y = BR;
          s.ball.vy = Math.abs(s.ball.vy) * 0.7;
        }
        // blob-ball collisions
        for (const b of [s.me, s.ai]) {
          const dx = s.ball.x - b.x;
          const dy = s.ball.y - (b.y - 10);
          const d = Math.hypot(dx, dy);
          if (d < R + BR && d > 0.01) {
            const nx = dx / d;
            const ny = dy / d;
            s.ball.x = b.x + nx * (R + BR + 1);
            s.ball.y = b.y - 10 + ny * (R + BR + 1);
            s.ball.vx = nx * 320 + b.vy * 0.2 + (Math.random() - 0.5) * 60;
            s.ball.vy = -Math.abs(ny * 280) - 240 - Math.abs(b.vy) * 0.25;
          }
        }
        // goals
        if (s.ball.x < GOAL_W - BR && s.ball.y > GROUND - GOAL_H + BR) goal('ai');
        if (s.ball.x > W - GOAL_W + BR && s.ball.y > GROUND - GOAL_H + BR) goal('me');
      }
      // draw
      ctx.fillStyle = '#1b7a41';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0e5c2f';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      // goals
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, GROUND - GOAL_H, GOAL_W - 4, GOAL_H);
      ctx.strokeRect(W - GOAL_W, GROUND - GOAL_H, GOAL_W - 4, GOAL_H);
      // ball
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, BR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17131f';
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, 3, 0, Math.PI * 2);
      ctx.fill();
      // blobs (squash = "liquid" feel)
      const blob = (b: { x: number; y: number; vy: number }, fill: string) => {
        const squash = Math.max(0.7, Math.min(1.3, 1 - b.vy / 1400));
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y - R * squash, R, R * squash, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        const look = Math.sign(s.ball.x - b.x) * 4;
        ctx.beginPath();
        ctx.arc(b.x - 5 + look, b.y - R * squash - 6, 3, 0, Math.PI * 2);
        ctx.arc(b.x + 5 + look, b.y - R * squash - 6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#17131f';
        ctx.beginPath();
        ctx.arc(b.x - 5 + look, b.y - R * squash - 6, 1.4, 0, Math.PI * 2);
        ctx.arc(b.x + 5 + look, b.y - R * squash - 6, 1.4, 0, Math.PI * 2);
        ctx.fill();
      };
      blob(s.me, '#f5c518');
      blob(s.ai, '#8a5cf5');
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${s.goals.me} : ${s.goals.ai}`, W / 2, 26);
      ctx.textAlign = 'left';
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
        <canvas ref={canvasRef} width={560} height={380} className="max-w-full touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">💧 Liquid Soccer</div>
            <div className="max-w-xs text-sm text-white/70">
              Wobbly one-button soccer vs the purple duck. ← → to shuffle, Space to launch. First to
              5 goals wins.
            </div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">
              {score.me > score.ai ? 'You win! 🏆' : 'Purple takes it 💧'}
            </div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">
              {score.me} : {score.ai}
            </div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Rematch
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">
        You {score.me} : {score.ai} AI · score = goals×100 − conceded×20
      </div>
    </div>
  );
}
