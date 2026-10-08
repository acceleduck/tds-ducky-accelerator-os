import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

const W = 560;
const H = 420;
const DURATION = 60;

interface Skid {
  x: number;
  y: number;
  life: number;
}

const CONES = [
  { x: 120, y: 110 }, { x: 280, y: 90 }, { x: 440, y: 120 },
  { x: 90, y: 300 }, { x: 470, y: 300 }, { x: 200, y: 350 },
  { x: 350, y: 220 }, { x: 160, y: 220 }, { x: 420, y: 380 },
];

export function DuckDrift({ onScore }: GameProps) {
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
    const car = { x: W / 2, y: H / 2, h: -Math.PI / 2, fwd: 0, lat: 0 };
    const skids: Skid[] = [];
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      time: DURATION,
      score: 0,
      driftT: 0,
      combo: 1,
      hitFlash: 0,
    };

    const reset = () => {
      car.x = W / 2;
      car.y = H / 2;
      car.h = -Math.PI / 2;
      car.fwd = 0;
      car.lat = 0;
      skids.length = 0;
      s.phase = 'ready';
      s.time = DURATION;
      s.score = 0;
      s.driftT = 0;
      s.combo = 1;
      setPhase('ready');
      setScore(0);
    };
    resetRef.current = reset;

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
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

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      if (s.phase === 'playing') {
        s.time -= dt;
        s.hitFlash = Math.max(0, s.hitFlash - dt);
        const gas = keys.has('ArrowUp') || keys.has('KeyW');
        const brake = keys.has('ArrowDown') || keys.has('KeyS');
        const left = keys.has('ArrowLeft') || keys.has('KeyA');
        const right = keys.has('ArrowRight') || keys.has('KeyD');
        const hand = keys.has('Space');

        car.fwd += (gas ? 280 : brake ? -170 : 0) * dt;
        car.fwd *= 1 - 0.32 * dt;
        car.fwd = Math.max(-90, Math.min(320, car.fwd));
        const steer = (left ? -1 : 0) + (right ? 1 : 0);
        car.h += steer * 2.7 * dt * Math.min(1, Math.abs(car.fwd) / 130) * Math.sign(car.fwd || 1);

        // lateral slip: handbrake keeps the slide alive
        car.lat *= 1 - (hand ? 1.0 : 5.5) * dt;
        if (hand && steer !== 0) car.lat += steer * 130 * dt;

        const cos = Math.cos(car.h);
        const sin = Math.sin(car.h);
        car.x += (cos * car.fwd - sin * car.lat) * dt;
        car.y += (sin * car.fwd + cos * car.lat) * dt;
        if (car.x < 16 || car.x > W - 16 || car.y < 16 || car.y > H - 16) {
          car.x = Math.max(16, Math.min(W - 16, car.x));
          car.y = Math.max(16, Math.min(H - 16, car.y));
          car.fwd *= 0.5;
          car.lat *= 0.3;
          s.driftT = 0;
        }

        const speed = Math.hypot(car.fwd, car.lat);
        const drifting = speed > 110 && Math.abs(car.lat) > 42;
        if (drifting) {
          s.driftT += dt;
          s.combo = 1 + Math.min(3.5, s.driftT * 0.7);
          s.score += Math.abs(car.lat) * dt * 0.5 * s.combo;
          setScore(Math.floor(s.score));
          skids.push({ x: car.x - cos * 10, y: car.y - sin * 10, life: 1 });
          skids.push({ x: car.x + cos * 10, y: car.y + sin * 10, life: 1 });
          if (skids.length > 600) skids.splice(0, 2);
        } else {
          s.driftT = Math.max(0, s.driftT - dt * 2);
        }

        for (const cone of CONES) {
          if (Math.hypot(car.x - cone.x, car.y - cone.y) < 17) {
            car.fwd *= 0.55;
            car.lat *= 0.3;
            s.driftT = 0;
            s.score = Math.max(0, s.score - 15);
            s.hitFlash = 0.4;
          }
        }

        if (s.time <= 0) {
          s.phase = 'over';
          setPhase('over');
          onScoreRef.current(Math.floor(s.score));
        }
      }

      // draw
      ctx.fillStyle = '#1c1e26';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 56) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(245,197,24,0.25)';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, W - 48, H - 48);

      for (const sk of skids) {
        sk.life -= 0.004;
        if (sk.life <= 0) continue;
        ctx.fillStyle = `rgba(0,0,0,${0.5 * sk.life})`;
        ctx.beginPath();
        ctx.arc(sk.x, sk.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      while (skids.length > 0 && skids[0].life <= 0) skids.shift();

      for (const cone of CONES) {
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(cone.x, cone.y - 9);
        ctx.lineTo(cone.x + 7, cone.y + 6);
        ctx.lineTo(cone.x - 7, cone.y + 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(cone.x - 4.5, cone.y - 2, 9, 2.5);
      }

      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.h);
      ctx.fillStyle = s.hitFlash > 0 ? '#fecaca' : '#e11d48';
      ctx.fillRect(-16, -9, 32, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-15, -11, 8, 3.5);
      ctx.fillRect(-15, 7.5, 8, 3.5);
      ctx.fillRect(8, -11, 8, 3.5);
      ctx.fillRect(8, 7.5, 8, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-4, -7, 10, 14);
      drawDuck(ctx, 6, -0.5, 4.6, Math.PI / 2);
      ctx.restore();

      // drift meter
      const drifting = Math.abs(car.lat) > 42 && Math.hypot(car.fwd, car.lat) > 110;
      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      ctx.fillRect(10, 10, 190, 46);
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.floor(s.score)} pts`, 20, 28);
      ctx.fillStyle = drifting ? '#4ade80' : 'rgba(255,255,255,0.4)';
      ctx.fillText(drifting ? `DRIFT ×${s.combo.toFixed(1)}` : 'keep sliding…', 20, 48);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${Math.max(0, s.time).toFixed(0)}s`, W - 16, 30);

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
            <div className="text-2xl font-bold text-white">🏎️ Duck Drift</div>
            <div className="max-w-xs text-sm text-white/70">
              Slide the pond lot for 60 seconds. ↑ gas, ↓ brake, ← → steer, SPACE handbrake to
              kick the tail out. Longer slides = bigger combo. Cones kill your combo.
            </div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Time! 🏁</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Burn more rubber
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Slide points bank into your final score · DuckCoins on finish</div>
    </div>
  );
}
