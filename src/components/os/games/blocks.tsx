import { useEffect, useRef, useState } from 'react';
import { Overlay, type GameProps } from './shared';

const COLS = 10;
const ROWS = 18;
const CELL = 30;
const W = COLS * CELL;
const H = ROWS * CELL;

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
];
const COLORS = ['#22d3ee', '#f5c518', '#a855f7', '#4ade80', '#f87171', '#60a5fa', '#fb923c'];
const LINE_SCORES = [0, 100, 300, 500, 800];

interface Piece {
  shape: number[][];
  x: number;
  y: number;
  color: number;
}

function rotateCW(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]).reverse());
}

function randomPiece(): Piece {
  const idx = Math.floor(Math.random() * SHAPES.length);
  return {
    shape: SHAPES[idx].map((r) => [...r]),
    x: Math.floor((COLS - SHAPES[idx][0].length) / 2),
    y: 0,
    color: idx,
  };
}

export function DuckBlocks({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 1 });
  const [next, setNext] = useState<Piece>(() => randomPiece());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    let cur = randomPiece();
    let queued = randomPiece();
    let dropT = 0;
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      score: 0,
      lines: 0,
      level: 1,
    };

    const speed = () => Math.max(0.12, 0.75 - (s.level - 1) * 0.06);

    const collide = (shape: number[][], px: number, py: number) => {
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const x = px + c;
          const y = py + r;
          if (x < 0 || x >= COLS || y >= ROWS) return true;
          if (y >= 0 && grid[y][x]) return true;
        }
      }
      return false;
    };

    const lockPiece = () => {
      for (let r = 0; r < cur.shape.length; r++) {
        for (let c = 0; c < cur.shape[r].length; c++) {
          if (cur.shape[r][c]) {
            const y = cur.y + r;
            if (y < 0) {
              gameOver();
              return;
            }
            grid[y][cur.x + c] = cur.color + 1;
          }
        }
      }
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r].every((v) => v > 0)) {
          grid.splice(r, 1);
          grid.unshift(Array(COLS).fill(0));
          cleared += 1;
          r += 1;
        }
      }
      if (cleared > 0) {
        s.score += LINE_SCORES[cleared] * s.level;
        s.lines += cleared;
        s.level = 1 + Math.floor(s.lines / 10);
        setHud({ score: s.score, lines: s.lines, level: s.level });
      }
      cur = queued;
      queued = randomPiece();
      setNext({ ...queued, shape: queued.shape.map((r) => [...r]) });
      if (collide(cur.shape, cur.x, cur.y)) gameOver();
    };

    const gameOver = () => {
      if (s.phase !== 'playing') return;
      s.phase = 'over';
      setPhase('over');
      onScoreRef.current(s.score);
    };

    const reset = () => {
      for (let r = 0; r < ROWS; r++) grid[r].fill(0);
      cur = randomPiece();
      queued = randomPiece();
      setNext({ ...queued, shape: queued.shape.map((r) => [...r]) });
      dropT = 0;
      s.phase = 'ready';
      s.score = 0;
      s.lines = 0;
      s.level = 1;
      setPhase('ready');
      setHud({ score: 0, lines: 0, level: 1 });
    };
    resetRef.current = reset;

    const move = (dx: number) => {
      if (!collide(cur.shape, cur.x + dx, cur.y)) cur.x += dx;
    };
    const rotate = () => {
      const rotated = rotateCW(cur.shape);
      for (const kick of [0, -1, 1, -2, 2]) {
        if (!collide(rotated, cur.x + kick, cur.y)) {
          cur.shape = rotated;
          cur.x += kick;
          return;
        }
      }
    };
    const softDrop = () => {
      if (!collide(cur.shape, cur.x, cur.y + 1)) {
        cur.y += 1;
        dropT = 0;
      } else {
        lockPiece();
      }
    };
    const hardDrop = () => {
      while (!collide(cur.shape, cur.x, cur.y + 1)) cur.y += 1;
      s.score += 2;
      lockPiece();
    };

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'Space' && s.phase === 'ready') {
        s.phase = 'playing';
        setPhase('playing');
        return;
      }
      if (s.phase !== 'playing' || e.repeat) return;
      if (e.code === 'ArrowLeft') move(-1);
      else if (e.code === 'ArrowRight') move(1);
      else if (e.code === 'ArrowDown') softDrop();
      else if (e.code === 'ArrowUp' || e.code === 'KeyX') rotate();
      else if (e.code === 'Space') hardDrop();
    };
    window.addEventListener('keydown', onKey);
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
        dropT += dt;
        if (dropT >= speed()) {
          dropT = 0;
          if (!collide(cur.shape, cur.x, cur.y + 1)) cur.y += 1;
          else lockPiece();
        }
      }

      ctx.fillStyle = '#0e1322';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, H);
        ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL);
        ctx.lineTo(W, y * CELL);
        ctx.stroke();
      }
      const cell = (x: number, y: number, ci: number, alpha = 1) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS[ci];
        ctx.fillRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, CELL - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x * CELL + 1.5, y * CELL + 1.5, CELL - 3, 5);
        ctx.globalAlpha = 1;
      };
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c]) cell(c, r, grid[r][c] - 1);
        }
      }
      if (s.phase !== 'over') {
        // ghost
        let gy = cur.y;
        while (!collide(cur.shape, cur.x, gy + 1)) gy += 1;
        for (let r = 0; r < cur.shape.length; r++) {
          for (let c = 0; c < cur.shape[r].length; c++) {
            if (cur.shape[r][c] && gy + r >= 0) cell(cur.x + c, gy + r, cur.color, 0.18);
          }
        }
        for (let r = 0; r < cur.shape.length; r++) {
          for (let c = 0; c < cur.shape[r].length; c++) {
            if (cur.shape[r][c] && cur.y + r >= 0) cell(cur.x + c, cur.y + r, cur.color);
          }
        }
      }

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.score}`, 10, 20);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="flex items-start gap-4">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="max-h-[70vh] touch-none rounded-2xl" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🧱 Duck Blocks</div>
            <div className="max-w-xs text-sm text-white/70">
              Stack the falling blocks and clear full lines. ← → move, ↑ rotate, ↓ soft drop,
              SPACE hard drop. Every 10 lines = next level, faster blocks.
            </div>
          </Overlay>
        )}
        {phase === 'over' && (
          <Overlay>
            <div className="text-xl font-bold text-white">Stacked out! 🧱</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{hud.score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Drop again
            </button>
          </Overlay>
        )}
      </div>
      <div className="flex w-28 flex-col gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <div className="mb-1 font-semibold uppercase tracking-wider text-white/40">Next</div>
          <div className="flex min-h-16 items-center justify-center">
            {next && (
              <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${next.shape[0].length}, 14px)` }}
              >
                {next.shape.flatMap((row, r) =>
                  row.map((v, c) => (
                    <div
                      key={`${r}-${c}`}
                      className="h-[14px] w-[14px] rounded-[3px]"
                      style={{ background: v ? COLORS[next.color] : 'transparent' }}
                    />
                  )),
                )}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Score</div>
          <div className="text-base font-bold text-[var(--os-accent)]">{hud.score}</div>
          <div className="mt-2 text-[10px] uppercase tracking-wider text-white/40">Lines</div>
          <div className="text-base font-bold text-white/85">{hud.lines}</div>
          <div className="mt-2 text-[10px] uppercase tracking-wider text-white/40">Level</div>
          <div className="text-base font-bold text-white/85">{hud.level}</div>
        </div>
      </div>
    </div>
  );
}
