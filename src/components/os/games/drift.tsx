import { useEffect, useRef, useState } from 'react';
import { drawDuck, Overlay, type GameProps } from './shared';

const W = 880;
const H = 560;
const LOT_W = 1800;
const LOT_H = 1300;
const ROAD_HW = 62;
const LAPS = 3;
const CAR_R = 13;

interface Vec {
  x: number;
  y: number;
}

const TRACK: Vec[] = [
  { x: 300, y: 250 },
  { x: 700, y: 200 },
  { x: 1050, y: 230 },
  { x: 1350, y: 320 },
  { x: 1420, y: 560 },
  { x: 1250, y: 760 },
  { x: 1000, y: 820 },
  { x: 820, y: 700 },
  { x: 640, y: 830 },
  { x: 380, y: 860 },
  { x: 220, y: 680 },
  { x: 260, y: 470 },
];

type DriftMode = 'freeride' | 'race' | 'race2p';

interface Car {
  x: number;
  y: number;
  h: number;
  fwd: number;
  lat: number;
  wpIdx: number;
  lap: number;
  finished: boolean;
  finishT: number;
  kind: 'p1' | 'p2' | 'bot';
  color: string;
  name: string;
  driftT: number;
  graceT: number;
  pending: number;
  combo: number;
  spin: number;
  aimX: number;
  aimY: number;
}

interface Skid {
  x: number;
  y: number;
  life: number;
}

interface Obstacle {
  x: number;
  y: number;
  r: number;
  kind: 'cone' | 'tire' | 'tree';
}

interface Controls {
  gas: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
}

const distToTrack = (x: number, y: number) => {
  let best = Infinity;
  for (let i = 0; i < TRACK.length; i++) {
    const a = TRACK[i];
    const b = TRACK[(i + 1) % TRACK.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / (abx * abx + aby * aby)));
    const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
    if (d < best) best = d;
  }
  return best;
};

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function DuckDrift({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const endRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [mode, setMode] = useState<DriftMode>('freeride');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [result, setResult] = useState<{ title: string; lines: string[]; score: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const keys = new Set<string>();
    const skids: Skid[] = [];
    const obstacles: Obstacle[] = [];
    // scatter obstacles off the racing line
    for (let i = 0; i < 34; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = 120 + Math.random() * (LOT_W - 240);
        const y = 120 + Math.random() * (LOT_H - 240);
        if (distToTrack(x, y) < 100) continue;
        const kind = Math.random() < 0.45 ? 'tree' : Math.random() < 0.6 ? 'cone' : 'tire';
        obstacles.push({ x, y, r: kind === 'tree' ? 10 : kind === 'tire' ? 13 : 9, kind });
        break;
      }
    }

    const cars: Car[] = [];
    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      clock: 0,
      raceT: 0,
      count: 0,
      banked: 0,
      pending: 0,
      combo: 1,
      driftT: 0,
      endLatch: 0,
      donuts: 0,
      donutFlash: 0,
      finalLines: [] as string[],
      title: '',
      score: 0,
    };

    const mkCar = (kind: Car['kind'], color: string, name: string): Car => ({
      x: 0,
      y: 0,
      h: 0,
      fwd: 0,
      lat: 0,
      wpIdx: 0,
      lap: 1,
      finished: false,
      finishT: 0,
      kind,
      color,
      name,
      driftT: 0,
      graceT: 0,
      pending: 0,
      combo: 1,
      spin: 0,
      aimX: 1,
      aimY: 0,
    });

    const reset = () => {
      cars.length = 0;
      skids.length = 0;
      s.raceT = 0;
      s.count = modeRef.current === 'freeride' ? 0 : 3.99;
      s.banked = 0;
      s.pending = 0;
      s.combo = 1;
      s.driftT = 0;
      s.endLatch = 0;
      s.donuts = 0;
      s.donutFlash = 0;
      s.finalLines = [];
      s.title = '';
      s.score = 0;
      if (modeRef.current === 'freeride') {
        const c = mkCar('p1', '#e11d48', 'You');
        c.x = 900;
        c.y = 680;
        c.h = -Math.PI / 2;
        cars.push(c);
      } else {
        const dir = Math.atan2(TRACK[1].y - TRACK[0].y, TRACK[1].x - TRACK[0].x);
        const px = Math.cos(dir + Math.PI / 2);
        const py = Math.sin(dir + Math.PI / 2);
        const slots: Array<[Car['kind'], string, string]> = [
          ['p1', '#e11d48', 'You'],
          ...((modeRef.current === 'race2p' ? [['p2', '#2563eb', 'P2']] : []) as Array<[Car['kind'], string, string]>),
          ['bot', '#16a34a', 'Waddles GT'],
          ['bot', '#f59e0b', 'Turbo Quack'],
        ];
        slots.forEach(([kind, color, name], i) => {
          const c = mkCar(kind, color, name);
          const back = 34 + Math.floor(i / 2) * 40;
          const side = i % 2 === 0 ? 20 : -20;
          c.x = TRACK[0].x - Math.cos(dir) * back + px * side;
          c.y = TRACK[0].y - Math.sin(dir) * back + py * side;
          c.h = dir;
          cars.push(c);
        });
      }
      s.phase = 'ready';
      setPhase('ready');
      setResult(null);
    };
    resetRef.current = reset;
    reset();

    const start = () => {
      if (s.phase !== 'ready') return;
      s.phase = 'playing';
      setPhase('playing');
    };
    startRef.current = start;

    const progressOf = (c: Car) => (c.lap * TRACK.length + c.wpIdx) * 1000 - Math.hypot(TRACK[c.wpIdx].x - c.x, TRACK[c.wpIdx].y - c.y);

    const standings = () => {
      return [...cars].sort((a, b) => {
        if (a.finished && b.finished) return a.finishT - b.finishT;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return progressOf(b) - progressOf(a);
      });
    };

    const finishRace = () => {
      const order = standings();
      const p1Rank = order.findIndex((c) => c.kind === 'p1') + 1;
      const pts = [1200, 700, 450, 250][Math.min(3, p1Rank - 1)];
      s.title = p1Rank === 1 ? 'P1 takes the win! 🏆' : `P1 finished #${p1Rank}`;
      s.finalLines = order.map((c, i) => `${i + 1}. ${c.name}${c.kind === 'p1' ? ' (You)' : c.kind === 'p2' ? ' (P2)' : ''}`);
      s.score = pts;
      s.phase = 'over';
      setPhase('over');
      setResult({ title: s.title, lines: s.finalLines, score: pts });
      onScoreRef.current(pts);
    };

    const endFreeride = () => {
      const total = Math.floor(s.banked + s.pending);
      s.title = 'Session banked 🪙';
      s.finalLines = [`${Math.floor(s.banked)} banked + ${Math.floor(s.pending)} pending`];
      s.score = total;
      s.phase = 'over';
      setPhase('over');
      setResult({ title: s.title, lines: s.finalLines, score: total });
      onScoreRef.current(total);
    };
    endRef.current = endFreeride;

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftRight', 'KeyE'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && s.phase === 'ready') start();
      if (e.code === 'KeyE' && s.phase === 'playing' && modeRef.current === 'freeride') endFreeride();
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', () => {
      if (s.phase === 'ready') start();
    });

    const step = (c: Car, ctl: Controls, dt: number, isPlayer: boolean) => {
      c.fwd += (ctl.gas ? 300 : ctl.brake ? -180 : 0) * dt;
      c.fwd *= 1 - (ctl.drift ? 0.26 : 0.34) * dt;
      const grass = distToTrack(c.x, c.y) > ROAD_HW;
      if (grass) {
        c.fwd *= 1 - 1.5 * dt;
        if (c.fwd > 185) c.fwd = 185;
      }
      c.fwd = Math.max(-90, Math.min(320, c.fwd));
      const steer = (ctl.left ? -1 : 0) + (ctl.right ? 1 : 0);
      // drifting loosens the whole car — faster rotation that bites at lower
      // speed, so SPACE + full steer at pace loops you into a donut
      const turnRate = ctl.drift ? 4.3 : 2.6;
      const bite = ctl.drift ? 95 : 130;
      const spinNow = steer * turnRate * dt * Math.min(1, Math.abs(c.fwd) / bite) * Math.sign(c.fwd || 1);
      c.h += spinNow;
      // hold SPACE and steer: the tail steps out and you DRIFT
      c.lat *= 1 - (ctl.drift ? 1.05 : 6.0) * dt;
      if (ctl.drift && steer !== 0) c.lat += steer * 165 * dt;
      // donut tracking — every full 360° while sliding is a donut
      if (ctl.drift) {
        c.spin += Math.abs(spinNow);
        c.graceT = 0;
      } else {
        c.graceT += dt;
        if (c.graceT > 0.8) c.spin = 0;
      }
      c.lat = Math.max(-220, Math.min(220, c.lat));
      const cos = Math.cos(c.h);
      const sin = Math.sin(c.h);
      c.x += (cos * c.fwd - sin * c.lat) * dt;
      c.y += (sin * c.fwd + cos * c.lat) * dt;

      // lot bounds
      if (c.x < 24 || c.x > LOT_W - 24 || c.y < 24 || c.y > LOT_H - 24) {
        c.x = Math.max(24, Math.min(LOT_W - 24, c.x));
        c.y = Math.max(24, Math.min(LOT_H - 24, c.y));
        c.fwd *= 0.5;
        c.lat *= 0.3;
      }
      // obstacles
      for (const o of obstacles) {
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < o.r + CAR_R && d > 0.01) {
          c.x = o.x + (dx / d) * (o.r + CAR_R);
          c.y = o.y + (dy / d) * (o.r + CAR_R);
          c.fwd *= 0.55;
          c.lat *= 0.4;
          if (isPlayer && c.kind === 'p1') {
            s.pending *= 0.5;
            s.driftT = 0;
          }
        }
      }

      const speed = Math.hypot(c.fwd, c.lat);
      const drifting = speed > 110 && Math.abs(c.lat) > 40;
      if (drifting) {
        c.driftT += dt;
        const backX = c.x - cos * 12;
        const backY = c.y - sin * 12;
        skids.push({ x: backX - sin * 8, y: backY + cos * 8, life: 1 });
        skids.push({ x: backX + sin * 8, y: backY - cos * 8, life: 1 });
        if (skids.length > 900) skids.splice(0, 2);
      }

      // donut! a full 360° while sliding = +150 style
      if (c.kind === 'p1' && c.spin >= Math.PI * 2) {
        c.spin -= Math.PI * 2;
        if (modeRef.current === 'freeride') {
          s.donuts += 1;
          s.donutFlash = 1.2;
          s.pending += 150;
        }
      }

      // freeride scoring for P1
      if (isPlayer && c.kind === 'p1' && modeRef.current === 'freeride') {
        if (drifting) {
          s.driftT += dt;
          s.combo = 1 + Math.min(4, s.driftT * 0.8);
          s.pending += Math.abs(c.lat) * dt * 0.6 * s.combo;
          s.endLatch = 0;
        } else {
          s.driftT = Math.max(0, s.driftT - dt * 2);
          if (s.pending > 0) {
            s.endLatch += dt;
            if (s.endLatch > 0.7) {
              s.banked += s.pending;
              s.pending = 0;
              s.combo = 1;
              s.endLatch = 0;
            }
          }
        }
      }
    };

    const botCtl = (c: Car): Controls => {
      const target = TRACK[(c.wpIdx + 1) % TRACK.length];
      const want = Math.atan2(target.y - c.y, target.x - c.x);
      let diff = want - c.h;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const p1c = cars[0];
      const behind = p1c ? progressOf(p1c) - progressOf(c) : 0;
      const hurry = behind > 400 ? 1.14 : behind < -400 ? 0.9 : 1;
      return {
        gas: true,
        brake: Math.abs(diff) > 1.15 && c.fwd > 170,
        left: diff < -0.06,
        right: diff > 0.06,
        drift: Math.abs(diff) > 0.55 && c.fwd > 200,
        ...(hurry !== 1 ? { gasHurry: hurry } : {}),
      } as Controls & { gasHurry?: number };
    };

    let camX = cars[0].x;
    let camY = cars[0].y;
    let zoom = 1.15;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      s.clock += dt;
      s.donutFlash = Math.max(0, s.donutFlash - dt);

      if (s.phase === 'playing') {
        if (s.count > 0) {
          s.count -= dt;
        } else {
          s.raceT += dt;
          for (const c of cars) {
            if (c.kind === 'p1') {
              step(
                c,
                {
                  gas: keys.has('KeyW'),
                  brake: keys.has('KeyS'),
                  left: keys.has('KeyA'),
                  right: keys.has('KeyD'),
                  drift: keys.has('Space'),
                },
                dt,
                true,
              );
            } else if (c.kind === 'p2') {
              step(
                c,
                {
                  gas: keys.has('ArrowUp'),
                  brake: keys.has('ArrowDown'),
                  left: keys.has('ArrowLeft'),
                  right: keys.has('ArrowRight'),
                  drift: keys.has('ShiftRight'),
                },
                dt,
                true,
              );
            } else {
              const ctl = botCtl(c);
              const hurry = (ctl as Controls & { gasHurry?: number }).gasHurry ?? 1;
              step(c, ctl, dt * hurry, false);
              if (c.fwd > 300) c.fwd = 300;
            }
            // waypoint / lap logic (race modes)
            if (modeRef.current !== 'freeride' && !c.finished) {
              const wp = TRACK[c.wpIdx];
              if (Math.hypot(c.x - wp.x, c.y - wp.y) < 80) {
                c.wpIdx = (c.wpIdx + 1) % TRACK.length;
                if (c.wpIdx === 0) {
                  c.lap += 1;
                  if (c.lap > LAPS) {
                    c.finished = true;
                    c.finishT = s.raceT;
                  }
                }
              }
            }
          }
          // race end: P1 done and everyone else settled (or 6s grace)
          if (modeRef.current !== 'freeride') {
            const p1c = cars[0];
            if (p1c.finished) {
              const allDone = cars.every((c) => c.finished);
              const graceOver = s.raceT - p1c.finishT > 6;
              if (allDone || graceOver) finishRace();
            }
          }
        }
      }

      // ---- camera ----
      const p1c = cars[0];
      const p2c = cars.find((c) => c.kind === 'p2');
      let targetX = p1c.x + Math.cos(p1c.h) * p1c.fwd * 0.22;
      let targetY = p1c.y + Math.sin(p1c.h) * p1c.fwd * 0.22;
      let targetZoom = 1.15;
      if (p2c && modeRef.current === 'race2p') {
        targetX = (p1c.x + p2c.x) / 2;
        targetY = (p1c.y + p2c.y) / 2;
        const spread = Math.hypot(p1c.x - p2c.x, p1c.y - p2c.y);
        targetZoom = Math.max(0.55, Math.min(1.15, 1.15 - spread / 1400));
      }
      camX += (targetX - camX) * Math.min(1, 5 * dt);
      camY += (targetY - camY) * Math.min(1, 5 * dt);
      zoom += (targetZoom - zoom) * Math.min(1, 3 * dt);
      const viewW = W / zoom;
      const viewH = H / zoom;
      camX = Math.max(viewW / 2 - 60, Math.min(LOT_W - viewW / 2 + 60, camX));
      camY = Math.max(viewH / 2 - 60, Math.min(LOT_H - viewH / 2 + 60, camY));

      // ---- draw world ----
      ctx.fillStyle = '#0d1420';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // grass lot + faint grid
      ctx.fillStyle = '#1e3a29';
      ctx.fillRect(0, 0, LOT_W, LOT_H);
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= LOT_W; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, LOT_H);
        ctx.stroke();
      }
      for (let y = 0; y <= LOT_H; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(LOT_W, y);
        ctx.stroke();
      }

      // road ribbon
      const road = new Path2D();
      road.moveTo(TRACK[0].x, TRACK[0].y);
      for (let i = 1; i < TRACK.length; i++) road.lineTo(TRACK[i].x, TRACK[i].y);
      road.closePath();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = (ROAD_HW + 6) * 2;
      ctx.stroke(road);
      ctx.strokeStyle = '#3b4048';
      ctx.lineWidth = ROAD_HW * 2;
      ctx.stroke(road);
      ctx.strokeStyle = 'rgba(250,204,21,0.65)';
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 26]);
      ctx.stroke(road);
      ctx.setLineDash([]);

      // start line
      const dir0 = Math.atan2(TRACK[1].y - TRACK[0].y, TRACK[1].x - TRACK[0].x);
      ctx.save();
      ctx.translate(TRACK[0].x, TRACK[0].y);
      ctx.rotate(dir0);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#111827';
        ctx.fillRect(-8, -ROAD_HW + (i * ROAD_HW * 2) / 8, 16, (ROAD_HW * 2) / 8);
      }
      ctx.restore();

      // skids
      for (const sk of skids) {
        if (sk.life <= 0) continue;
        ctx.fillStyle = `rgba(0,0,0,${0.42 * sk.life})`;
        ctx.beginPath();
        ctx.arc(sk.x, sk.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      while (skids.length > 0 && skids[0].life <= 0) skids.shift();

      // depth-sorted obstacles + cars
      const drawCone = (o: Obstacle) => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(o.x + 3, o.y + 4, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(o.x, o.y - 16);
        ctx.lineTo(o.x + 8, o.y + 4);
        ctx.lineTo(o.x - 8, o.y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(o.x - 5, o.y - 6, 10, 3);
      };
      const drawTire = (o: Obstacle) => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(o.x + 4, o.y + 5, 13, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        for (const dy of [0, -9, -18]) {
          ctx.fillStyle = '#1f2937';
          ctx.beginPath();
          ctx.arc(o.x, o.y + dy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#374151';
          ctx.beginPath();
          ctx.arc(o.x, o.y + dy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      const drawTree = (o: Obstacle) => {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(o.x + 5, o.y + 6, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(o.x - 4, o.y - 12, 8, 14);
        ctx.fillStyle = '#1e6b34';
        ctx.fillRect(o.x - 16, o.y - 34, 32, 24);
        ctx.fillStyle = '#2f9e50';
        ctx.fillRect(o.x - 12, o.y - 44, 24, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(o.x - 12, o.y - 44, 24, 4);
      };
      const drawCar = (c: Car) => {
        const slide = Math.max(-0.45, Math.min(0.45, -c.lat * 0.0016));
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(c.x + 6, c.y + 8, 22, 13, c.h, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.h + slide);
        // wheels at ground level
        ctx.fillStyle = '#10141c';
        ctx.fillRect(-16, -13, 10, 6);
        ctx.fillRect(-16, 7, 10, 6);
        ctx.fillRect(8, -13, 10, 6);
        ctx.fillRect(8, 7, 10, 6);
        // body base (dark sides) then raised top — the blocky 3D stack
        ctx.fillStyle = shade(c.color, -60);
        ctx.fillRect(-17, -10, 34, 20);
        ctx.fillStyle = c.color;
        ctx.fillRect(-17, -18, 34, 20);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(-17, -18, 34, 4);
        // cabin
        ctx.fillStyle = shade(c.color, -26);
        ctx.fillRect(-9, -27, 18, 10);
        ctx.fillStyle = 'rgba(210,235,255,0.7)';
        ctx.fillRect(-7, -26, 7, 8);
        // spoiler
        ctx.fillStyle = shade(c.color, -75);
        ctx.fillRect(-22, -16, 4, 14);
        // the duck on the roof
        drawDuck(ctx, 2, -30, 4.5);
        ctx.restore();
        if (c.kind === 'p1' || c.kind === 'p2') {
          ctx.fillStyle = c.kind === 'p1' ? 'rgba(255,255,255,0.9)' : '#93c5fd';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(c.kind === 'p1' ? 'P1' : 'P2', c.x, c.y - 40);
        }
      };
      const depthItems: Array<{ y: number; draw: () => void }> = [
        ...obstacles.map((o) => ({ y: o.y, draw: () => (o.kind === 'cone' ? drawCone(o) : o.kind === 'tire' ? drawTire(o) : drawTree(o)) })),
        ...cars.map((c) => ({ y: c.y, draw: () => drawCar(c) })),
      ];
      depthItems.sort((a, b) => a.y - b.y);
      for (const it of depthItems) it.draw();
      ctx.restore();

      // ---- HUD ----
      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      const driftNow = Math.abs(p1c.lat) > 40 && Math.hypot(p1c.fwd, p1c.lat) > 110;
      if (modeRef.current === 'freeride') {
        ctx.fillRect(10, 10, 260, 52);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`BANKED ${Math.floor(s.banked)}`, 20, 30);
        ctx.fillStyle = '#f9a8d4';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`🍩 ${s.donuts}`, 150, 30);
        ctx.fillStyle = driftNow ? '#4ade80' : 'rgba(255,255,255,0.45)';
        ctx.fillText(driftNow ? `DRIFTING ×${s.combo.toFixed(1)}  +${Math.floor(s.pending)}` : `pending ${Math.floor(s.pending)}`, 20, 52);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${Math.round(Math.hypot(p1c.fwd, p1c.lat) / 3)} mph`, W - 16, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px sans-serif';
        ctx.fillText('E = end & bank', W - 16, 50);
      } else {
        const order = standings();
        const p1Rank = order.findIndex((c) => c.kind === 'p1') + 1;
        ctx.fillRect(10, 10, 210, 52);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`LAP ${Math.min(LAPS, p1c.lap)}/${LAPS}`, 20, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`POS ${p1Rank}/${cars.length}`, 20, 52);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${s.raceT.toFixed(1)}s`, W - 16, 30);
        const p2c = cars.find((c) => c.kind === 'p2');
        if (p2c) {
          const p2Rank = order.findIndex((c) => c.kind === 'p2') + 1;
          ctx.fillStyle = '#93c5fd';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`P2 · LAP ${Math.min(LAPS, p2c.lap)}/${LAPS} · POS ${p2Rank}`, W - 16, 50);
        }
      }

      // minimap
      const mm = { x: W - 148, y: H - 118, w: 132, h: 94 };
      ctx.fillStyle = 'rgba(10,14,24,0.75)';
      ctx.fillRect(mm.x, mm.y, mm.w, mm.h);
      const mx = (x: number) => mm.x + (x / LOT_W) * mm.w;
      const my = (y: number) => mm.y + (y / LOT_H) * mm.h;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx(TRACK[0].x), my(TRACK[0].y));
      for (let i = 1; i < TRACK.length; i++) ctx.lineTo(mx(TRACK[i].x), my(TRACK[i].y));
      ctx.closePath();
      ctx.stroke();
      for (const c of cars) {
        ctx.fillStyle = c.kind === 'p1' ? '#ffffff' : c.kind === 'p2' ? '#93c5fd' : c.color;
        ctx.beginPath();
        ctx.arc(mx(c.x), my(c.y), c.kind === 'p1' ? 3.4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // countdown
      if (s.count > 0 && s.phase === 'playing') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f5c518';
        ctx.font = 'bold 84px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.ceil(s.count)), W / 2, H / 2 + 26);
      }

      // donut flash
      if (s.donutFlash > 0 && s.phase === 'playing') {
        ctx.fillStyle = `rgba(249,168,212,${Math.min(1, s.donutFlash)})`;
        ctx.font = 'bold 38px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🍩 DONUT!', W / 2, 116);
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

  useEffect(() => {
    resetRef.current();
  }, [mode]);

  const modeDesc: Record<DriftMode, string> = {
    freeride: 'Cruise the lot with no timer. Hold SPACE + steer to drift — spin full donuts 🍩 for +150 each. Press E to cash out.',
    race: '3 laps against 2 bot ducks. Hold SPACE + steer through corners to drift instead of normal turning.',
    race2p: 'Two ducks, one keyboard, 3 laps, 2 bots. P1: WASD + SPACE drift · P2: arrows + RIGHT SHIFT drift.',
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="max-w-full touch-none rounded-2xl" aria-label="Duck Drift track" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🏎️ DUCK DRIFT 3D</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {([['freeride', 'Freeride'], ['race', 'Race vs bots'], ['race2p', '2P Race']] as Array<[DriftMode, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    mode === id ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="max-w-md text-sm text-white/70">{modeDesc[mode]}</div>
            <button
              onClick={() => startRef.current()}
              className="mt-1 rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              {mode === 'freeride' ? 'Start cruising' : 'Start engines'}
            </button>
          </Overlay>
        )}
        {phase === 'over' && result && (
          <Overlay>
            <div className="text-xl font-bold text-white">{result.title}</div>
            {result.lines.map((l) => (
              <div key={l} className="text-sm text-white/70">
                {l}
              </div>
            ))}
            <div className="text-3xl font-bold text-[var(--os-accent)]">{result.score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Run it back
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Blocky 3D · hold SPACE and steer to drift · 🍩 donuts pay +150 · freeride, races and 2P on one keyboard</div>
    </div>
  );
}
