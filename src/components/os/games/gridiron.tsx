import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

export function GridironDuck({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [points, setPoints] = useState(0);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = 420;
    const H = 560;
    const keys = new Set<string>();
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      px: W / 2,
      speed: 170,
      dist: 0,
      points: 0,
      tackles: 0,
      tds: 0,
      spawnT: 0,
      eggT: 0,
      flashT: 0,
      flashText: '',
      defenders: [] as { x: number; y: number; dy: number }[],
      eggs: [] as { x: number; y: number; dy: number }[],
    };
    const clearField = () => {
      s.defenders = [];
      s.eggs = [];
      s.spawnT = 0;
      s.eggT = 0;
    };
    const reset = () => {
      s.phase = 'ready';
      s.px = W / 2;
      s.speed = 170;
      s.dist = 0;
      s.points = 0;
      s.tackles = 0;
      s.tds = 0;
      clearField();
      setPhase('ready');
      setPoints(0);
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

    const gameOver = () => {
      s.phase = 'over';
      setPhase('over');
      onScoreRef.current(s.points);
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (s.phase === 'playing') {
        s.dist += s.speed * dt;
        if (keys.has('ArrowLeft') || keys.has('KeyA')) s.px -= 300 * dt;
        if (keys.has('ArrowRight') || keys.has('KeyD')) s.px += 300 * dt;
        s.px = Math.min(W - 20, Math.max(20, s.px));
        s.spawnT += dt;
        s.eggT += dt;
        if (s.spawnT > 0.55) {
          s.spawnT = 0;
          s.defenders.push({ x: 25 + Math.random() * (W - 50), y: -20, dy: s.speed * (0.9 + Math.random() * 0.35) });
        }
        if (s.eggT > 2.3) {
          s.eggT = 0;
          s.eggs.push({ x: 25 + Math.random() * (W - 50), y: -20, dy: s.speed * 0.95 });
        }
        for (const d of s.defenders) d.y += d.dy * dt;
        for (const e of s.eggs) e.y += e.dy * dt;
        s.defenders = s.defenders.filter((d) => d.y < H + 30);
        s.eggs = s.eggs.filter((e) => e.y < H + 30);
        for (const d of s.defenders) {
          if (Math.hypot(s.px - d.x, H - 96 - d.y) < 22) {
            s.tackles += 1;
            s.flashT = 0.6;
            s.flashText = 'TACKLE!';
            setFlash('TACKLE!');
            clearField();
            if (s.tackles >= 4) gameOver();
            break;
          }
        }
        for (let i = s.eggs.length - 1; i >= 0; i--) {
          if (Math.hypot(s.px - s.eggs[i].x, H - 96 - s.eggs[i].y) < 20) {
            s.eggs.splice(i, 1);
            s.points += 1;
            setPoints(s.points);
          }
        }
        if (s.dist >= 1500) {
          s.dist = 0;
          s.tds += 1;
          s.points += 7;
          s.tackles = 0;
          s.speed += 25;
          setPoints(s.points);
          s.flashT = 0.9;
          s.flashText = 'TOUCHDOWN! 🏈';
          setFlash('TOUCHDOWN! 🏈');
          clearField();
        }
        if (s.flashT > 0) {
          s.flashT -= dt;
          if (s.flashT <= 0) {
            s.flashText = '';
            setFlash('');
          }
        }
      }
      // draw field
      ctx.fillStyle = '#1e6f38';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#22793d';
      const stripeH = 56;
      const off = s.dist % (stripeH * 2);
      for (let y = -off; y < H; y += stripeH * 2) ctx.fillRect(0, y, W, stripeH);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      for (let y = -off; y < H; y += stripeH) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.font = 'bold 11px sans-serif';
      const yards = Math.floor(s.dist / 15) % 100;
      ctx.fillText(`${yards} yd`, W / 2 - 18, 24);
      for (const e of s.eggs) {
        ctx.fillStyle = '#f5c518';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 7, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const d of s.defenders) {
        ctx.fillStyle = '#d63838';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(d.x - 12, d.y - 3, 24, 3);
        ctx.fillStyle = '#17131f';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      drawDuck(ctx, s.px, H - 96, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${s.points} pts`, 10, 22);
      ctx.fillText(`tackles ${s.tackles}/4`, 10, 42);
      ctx.fillText(`TD ×${s.tds}`, 10, 62);
      if (s.flashT > 0 && s.flashText) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.flashText, W / 2, H / 2);
        ctx.textAlign = 'left';
      }
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
        <canvas ref={canvasRef} width={420} height={560} className="max-w-full touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🏈 Gridiron Duck</div>
            <div className="max-w-xs text-sm text-white/70">
              Run the field: dodge red helmets with ← →, grab golden eggs, and go 100 yards for a
              touchdown. Four tackles and you punt.
            </div>
            <div className="text-xs text-white/40">{flash}</div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Turnover on quacks 🏈</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{points}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Next game
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">{points} pts · arrow keys to juke</div>
    </div>
  );
}
