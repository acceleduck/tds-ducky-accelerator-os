import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

const W = 420;
const H = 560;

interface Enemy {
  x: number;
  y: number;
  alive: boolean;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function DuckBlaster({ onScore }: GameProps) {
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
    const keys = new Set<string>();
    const stars: { x: number; y: number; s: number }[] = [];
    for (let i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.6 });

    const ship = { x: W / 2, cool: 0, inv: 0, lives: 3 };
    let enemies: Enemy[] = [];
    let bullets: { x: number; y: number }[] = [];
    let ebullets: { x: number; y: number; vy: number }[] = [];
    let parts: Particle[] = [];
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      wave: 0,
      score: 0,
      stepT: 0,
      stepEvery: 1.5,
      shootT: 0,
      wobble: 0,
    };

    const spawnWave = () => {
      s.wave += 1;
      s.stepEvery = Math.max(0.55, 1.5 - s.wave * 0.09);
      enemies = [];
      const rows = Math.min(5, 2 + s.wave);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 8; c++) {
          enemies.push({ x: 46 + c * 44 + (r % 2) * 10, y: 70 + r * 42, alive: true });
        }
      }
    };

    const boom = (x: number, y: number, color: string) => {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 160;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3 });
      }
      parts.forEach((p) => {
        if (p.life > 0.6) (p as Particle & { c?: string }).c = color;
      });
    };

    const reset = () => {
      ship.x = W / 2;
      ship.cool = 0;
      ship.inv = 0;
      ship.lives = 3;
      bullets = [];
      ebullets = [];
      parts = [];
      s.phase = 'ready';
      s.wave = 0;
      s.score = 0;
      s.stepT = 0;
      s.shootT = 0;
      setPhase('ready');
      setScore(0);
    };
    resetRef.current = reset;

    const gameOver = () => {
      if (s.phase !== 'playing') return;
      s.phase = 'over';
      setPhase('over');
      onScoreRef.current(s.score);
    };

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && s.phase === 'ready') {
        s.phase = 'playing';
        spawnWave();
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
        spawnWave();
        setPhase('playing');
      }
    });

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      s.wobble += dt;

      for (const st of stars) {
        st.y += st.s * 26 * dt;
        if (st.y > H) {
          st.y = -2;
          st.x = Math.random() * W;
        }
      }

      if (s.phase === 'playing') {
        ship.cool -= dt;
        ship.inv = Math.max(0, ship.inv - dt);
        if (keys.has('ArrowLeft') || keys.has('KeyA')) ship.x -= 330 * dt;
        if (keys.has('ArrowRight') || keys.has('KeyD')) ship.x += 330 * dt;
        ship.x = Math.max(24, Math.min(W - 24, ship.x));
        if (keys.has('Space') && ship.cool <= 0) {
          bullets.push({ x: ship.x, y: H - 64 });
          ship.cool = 0.17;
        }

        s.stepT += dt;
        if (s.stepT > s.stepEvery) {
          s.stepT = 0;
          for (const e of enemies) e.y += 16;
        }
        s.shootT += dt;
        const shootEvery = Math.max(0.32, 1.15 - s.wave * 0.08);
        if (s.shootT > shootEvery) {
          s.shootT = 0;
          const alive = enemies.filter((e) => e.alive);
          if (alive.length) {
            const shooter = alive[Math.floor(Math.random() * alive.length)];
            ebullets.push({ x: shooter.x, y: shooter.y + 14, vy: 190 + s.wave * 12 });
          }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.y -= 560 * dt;
          if (b.y < -10) {
            bullets.splice(i, 1);
            continue;
          }
          for (const e of enemies) {
            if (!e.alive) continue;
            if (Math.hypot(e.x - b.x, e.y - b.y) < 15) {
              e.alive = false;
              bullets.splice(i, 1);
              s.score += 25 + s.wave * 5;
              setScore(s.score);
              boom(e.x, e.y, '#4ade80');
              break;
            }
          }
        }
        for (let i = ebullets.length - 1; i >= 0; i--) {
          const b = ebullets[i];
          b.y += b.vy * dt;
          if (b.y > H + 10) {
            ebullets.splice(i, 1);
            continue;
          }
          if (ship.inv <= 0 && Math.hypot(ship.x - b.x, (H - 52) - b.y) < 15) {
            ebullets.splice(i, 1);
            ship.lives -= 1;
            ship.inv = 2;
            boom(ship.x, H - 52, '#f5c518');
            if (ship.lives <= 0) gameOver();
          }
        }
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0) parts.splice(i, 1);
        }

        if (enemies.every((e) => !e.alive)) {
          s.score += 100 * s.wave;
          setScore(s.score);
          spawnWave();
        }
        for (const e of enemies) {
          if (e.alive && e.y > H - 80) {
            gameOver();
            break;
          }
        }
      }

      // draw
      ctx.fillStyle = '#0a0f1e';
      ctx.fillRect(0, 0, W, H);
      for (const st of stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + st.s * 0.25})`;
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }

      const wob = Math.sin(s.wobble * 2.2) * 5;
      for (const e of enemies) {
        if (!e.alive) continue;
        const x = e.x + wob;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.ellipse(x, e.y, 13, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x - 5, e.y - 3, 3.4, 0, Math.PI * 2);
        ctx.arc(x + 5, e.y - 3, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(x - 5, e.y - 3, 1.5, 0, Math.PI * 2);
        ctx.arc(x + 5, e.y - 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#14532d';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, e.y + 5, 4, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }

      ctx.fillStyle = '#f87171';
      for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 8, 3, 10);
      ctx.fillStyle = '#a3e635';
      for (const b of ebullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of parts) {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, p.life)})`;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }

      if (s.phase !== 'over') {
        const blink = ship.inv > 0 && Math.floor(ship.inv * 10) % 2 === 0;
        if (!blink) {
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.moveTo(ship.x, H - 72);
          ctx.lineTo(ship.x + 22, H - 44);
          ctx.lineTo(ship.x - 22, H - 44);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#64748b';
          ctx.fillRect(ship.x - 12, H - 44, 24, 6);
          drawDuck(ctx, ship.x, H - 52, 7);
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.score}`, 10, 22);
      ctx.fillText(`WAVE ${s.wave}`, 10, 40);
      ctx.textAlign = 'right';
      ctx.fillText('❤'.repeat(Math.max(0, ship.lives)), W - 10, 22);

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
            <div className="text-2xl font-bold text-white">🚀 Duck Blaster</div>
            <div className="max-w-xs text-sm text-white/70">
              The grumpy space frogs are descending. ← → (or A/D) to fly, SPACE to fire. Three
              lives, endless waves — each wave is faster and angrier.
            </div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Splashed! 🐸</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Back to the cockpit
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Wave survive bonus 100×wave · DuckCoins on game over</div>
    </div>
  );
}
