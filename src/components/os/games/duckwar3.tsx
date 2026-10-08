import { useEffect, useRef, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { drawDuck, Overlay, type GameProps } from './shared';

const W = 880;
const H = 560;
const CAP_R = 80;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const POINTS = [
  { x: 110, y: 120 },
  { x: 440, y: 96 },
  { x: 770, y: 120 },
  { x: 275, y: 440 },
  { x: 605, y: 440 },
];
const DEFAULT_NAMES = [
  'Quackers', 'Featherstone', 'MallardMax', 'Waddles', 'SirQuack', 'PuddlePete', 'Beakman',
  'DuckNorris', 'ColonelCrumb', 'Eggbert', 'Henrietta', 'SoggyBread', 'Paddles', 'BillFord',
  'Miss Quackworth', 'General Waddle', 'Sgt. Peck', 'Crumb Commander',
];

type Team = 'blue' | 'gray';

interface Soldier {
  team: Team;
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  respawn: number;
  name: string;
  isPlayer: boolean;
  cool: number;
  obj: number;
  aim: number;
  retarget: number;
  hitT: number;
  bob: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: Team;
  dmg: number;
  life: number;
  shooter: Soldier;
}

interface Nade {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
}

interface Boom {
  x: number;
  y: number;
  t: number;
}

interface FeedEntry {
  text: string;
  t: number;
}

export function DuckWar3({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const namesRef = useRef<string[]>([]);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [result, setResult] = useState<{ win: boolean; score: number; kills: number; caps: number } | null>(null);

  // Real duck names from the leaderboard reinforce the bot armies.
  useEffect(() => {
    let alive = true;
    db.query<{ player_name: string }>('game_scores', { order: 'score.desc', limit: '14' })
      .then((rows) => {
        if (alive && rows.length) namesRef.current = rows.map((r) => r.player_name);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const keys = new Set<string>();
    const mouse = { x: W / 2, y: H / 2, down: false };

    const pts = POINTS.map((p) => ({ ...p, owner: null as Team | null, prog: 0 }));
    pts[0].owner = 'blue';
    pts[0].prog = 100;
    pts[2].owner = 'gray';
    pts[2].prog = -100;

    const tickets = { blue: 150, gray: 150 };
    const soldiers: Soldier[] = [];
    const bullets: Bullet[] = [];
    const nades: Nade[] = [];
    const booms: Boom[] = [];
    const feed: FeedEntry[] = [];
    const patches: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < 26; i++) {
      patches.push({ x: Math.random() * W, y: Math.random() * H, r: 18 + Math.random() * 46 });
    }

    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      time: 0,
      kills: 0,
      caps: 0,
      playerNades: 3,
      nameCursor: 0,
    };

    const namePool = () => {
      const pool = [...namesRef.current, ...DEFAULT_NAMES];
      const name = pool[s.nameCursor % pool.length];
      s.nameCursor += 1;
      return name;
    };

    const homeOf = (team: Team) => (team === 'blue' ? pts[0] : pts[2]);

    const spawnPos = (team: Team) => {
      const owned = pts.filter((p) => p.owner === team);
      const base = owned.length ? owned[Math.floor(Math.random() * owned.length)] : homeOf(team);
      return {
        x: Math.min(W - 20, Math.max(20, base.x + (Math.random() - 0.5) * 120)),
        y: Math.min(H - 20, Math.max(20, base.y + (Math.random() - 0.5) * 120)),
      };
    };

    const makeSoldier = (team: Team, isPlayer = false, name?: string): Soldier => {
      const p = spawnPos(team);
      return {
        team,
        x: p.x,
        y: p.y,
        hp: 100,
        dead: false,
        respawn: 0,
        name: isPlayer ? 'You' : (name ?? namePool()),
        isPlayer,
        cool: 0,
        obj: Math.floor(Math.random() * pts.length),
        aim: team === 'blue' ? 0 : Math.PI,
        retarget: Math.random() * 3,
        hitT: 0,
        bob: Math.random() * 10,
      };
    };

    const reset = () => {
      for (const p of pts) {
        p.owner = null;
        p.prog = 0;
      }
      pts[0].owner = 'blue';
      pts[0].prog = 100;
      pts[2].owner = 'gray';
      pts[2].prog = -100;
      tickets.blue = 150;
      tickets.gray = 150;
      soldiers.length = 0;
      bullets.length = 0;
      nades.length = 0;
      booms.length = 0;
      feed.length = 0;
      s.time = 0;
      s.kills = 0;
      s.caps = 0;
      s.playerNades = 3;
      soldiers.push(makeSoldier('blue', true));
      for (let i = 0; i < 10; i++) soldiers.push(makeSoldier('blue'));
      for (let i = 0; i < 11; i++) soldiers.push(makeSoldier('gray'));
      s.phase = 'ready';
      setPhase('ready');
      setResult(null);
    };
    resetRef.current = reset;
    reset();

    const player = () => soldiers[0];

    const pushFeed = (text: string) => {
      feed.unshift({ text, t: 4 });
      if (feed.length > 5) feed.pop();
    };

    const fire = (shooter: Soldier, tx: number, ty: number, spread: number, dmg: number) => {
      const a = Math.atan2(ty - shooter.y, tx - shooter.x) + (Math.random() - 0.5) * spread;
      const speed = shooter.isPlayer ? 640 : 520;
      bullets.push({
        x: shooter.x + Math.cos(a) * 12,
        y: shooter.y + Math.sin(a) * 12,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        team: shooter.team,
        dmg,
        life: 1.1,
        shooter,
      });
    };

    const damage = (target: Soldier, dmg: number, shooter: Soldier) => {
      if (target.dead) return;
      target.hp -= dmg;
      target.hitT = 0.12;
      if (target.hp > 0) return;
      target.dead = true;
      target.respawn = 3.5;
      tickets[target.team] -= 1;
      if (shooter.isPlayer && !target.isPlayer) {
        s.kills += 1;
        pushFeed(`You 🦆 ${target.name}`);
      } else if (target.isPlayer) {
        pushFeed(`${shooter.name} downed you — redeploying…`);
      } else {
        pushFeed(`${shooter.name} 🦆 ${target.name}`);
      }
    };

    const throwNade = (tx: number, ty: number) => {
      const p = player();
      if (p.dead || s.playerNades <= 0) return;
      s.playerNades -= 1;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      const capped = Math.min(280, d);
      nades.push({
        sx: p.x,
        sy: p.y,
        tx: p.x + ((tx - p.x) / d) * capped,
        ty: p.y + ((ty - p.y) / d) * capped,
        t: 0,
      });
    };

    const finish = (win: boolean) => {
      if (s.phase !== 'playing') return;
      s.phase = 'over';
      const score = s.kills * 100 + s.caps * 250 + (win ? 1500 : 250);
      setResult({ win, score, kills: s.kills, caps: s.caps });
      setPhase('over');
      onScoreRef.current(score);
    };

    const start = () => {
      if (s.phase !== 'ready') return;
      s.phase = 'playing';
      setPhase('playing');
    };
    startRef.current = start;

    const toCanvas = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      };
    };

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyG'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && s.phase === 'ready') start();
      if (e.code === 'KeyG' && s.phase === 'playing') throwNade(mouse.x, mouse.y);
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMove = (e: PointerEvent) => {
      const p = toCanvas(e);
      mouse.x = p.x;
      mouse.y = p.y;
    };
    const onDown = (e: PointerEvent) => {
      if (s.phase === 'ready') {
        start();
        return;
      }
      const p = toCanvas(e);
      mouse.x = p.x;
      mouse.y = p.y;
      if (e.button === 2) {
        throwNade(p.x, p.y);
        return;
      }
      mouse.down = true;
    };
    const onUp = () => {
      mouse.down = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      s.time += dt;

      if (s.phase === 'playing') {
        // --- soldiers ---
        for (const sol of soldiers) {
          sol.hitT = Math.max(0, sol.hitT - dt);
          if (sol.dead) {
            sol.respawn -= dt;
            if (sol.respawn <= 0) {
              const p = spawnPos(sol.team);
              sol.x = p.x;
              sol.y = p.y;
              sol.hp = 100;
              sol.dead = false;
              sol.cool = 0.4;
              if (sol.isPlayer) s.playerNades = 3;
            }
            continue;
          }
          sol.cool -= dt;
          if (sol.isPlayer) {
            let dx = 0;
            let dy = 0;
            if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
            if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
            if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
            if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
            const len = Math.hypot(dx, dy) || 1;
            sol.x = Math.min(W - 14, Math.max(14, sol.x + (dx / len) * 165 * dt));
            sol.y = Math.min(H - 14, Math.max(14, sol.y + (dy / len) * 165 * dt));
            sol.aim = Math.atan2(mouse.y - sol.y, mouse.x - sol.x);
            if (mouse.down && sol.cool <= 0) {
              fire(sol, mouse.x, mouse.y, 0.05, 30);
              sol.cool = 0.3;
            }
            if (sol.hitT <= 0 && sol.hp < 100) sol.hp = Math.min(100, sol.hp + 9 * dt);
          } else {
            // bot brain
            sol.retarget -= dt;
            if (sol.retarget <= 0) {
              sol.retarget = 3 + Math.random() * 3;
              const targets = pts.filter((p) => p.owner !== sol.team);
              const pool = targets.length ? targets : pts;
              if (Math.random() < 0.3) {
                sol.obj = Math.floor(Math.random() * pool.length);
              } else {
                let best = 0;
                let bestD = Infinity;
                pool.forEach((p, i) => {
                  const d = Math.hypot(p.x - sol.x, p.y - sol.y);
                  if (d < bestD) {
                    bestD = d;
                    best = i;
                  }
                });
                sol.obj = best;
              }
              sol.obj = pts.indexOf(pool[sol.obj] ?? pts[0]);
            }
            const target = pts[sol.obj] ?? pts[0];
            let enemy: Soldier | null = null;
            let enemyD = Infinity;
            for (const other of soldiers) {
              if (other.dead || other.team === sol.team) continue;
              const d = Math.hypot(other.x - sol.x, other.y - sol.y);
              if (d < enemyD) {
                enemyD = d;
                enemy = other;
              }
            }
            if (enemy && enemyD < 250) {
              sol.aim = Math.atan2(enemy.y - sol.y, enemy.x - sol.x);
              if (sol.cool <= 0 && enemyD < 235) {
                fire(sol, enemy.x, enemy.y, 0.16, 14);
                sol.cool = 0.7 + Math.random() * 0.5;
              }
            } else {
              const d = Math.hypot(target.x - sol.x, target.y - sol.y) || 1;
              if (d > CAP_R * 0.7) {
                sol.x += ((target.x - sol.x) / d) * 88 * dt;
                sol.y += ((target.y - sol.y) / d) * 88 * dt;
              }
              sol.aim = Math.atan2(target.y - sol.y, target.x - sol.x);
            }
          }
        }

        // --- bullets ---
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          let hit = false;
          for (const sol of soldiers) {
            if (sol.dead || sol.team === b.team) continue;
            if (Math.hypot(sol.x - b.x, sol.y - b.y) < 11) {
              damage(sol, b.dmg, b.shooter);
              hit = true;
              break;
            }
          }
          if (hit || b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) bullets.splice(i, 1);
        }

        // --- grenades ---
        for (let i = nades.length - 1; i >= 0; i--) {
          const n = nades[i];
          n.t += dt / 0.9;
          if (n.t >= 1) {
            booms.push({ x: n.tx, y: n.ty, t: 0 });
            for (const sol of soldiers) {
              if (sol.dead || sol.team === 'blue') continue;
              const d = Math.hypot(sol.x - n.tx, sol.y - n.ty);
              if (d < 78) damage(sol, 95 * (1 - d / 78) + 15, player());
            }
            nades.splice(i, 1);
          }
        }
        for (let i = booms.length - 1; i >= 0; i--) {
          booms[i].t += dt;
          if (booms[i].t > 0.5) booms.splice(i, 1);
        }

        // --- capture points ---
        for (const p of pts) {
          let nb = 0;
          let ng = 0;
          for (const sol of soldiers) {
            if (sol.dead) continue;
            if (Math.hypot(sol.x - p.x, sol.y - p.y) < CAP_R) {
              if (sol.team === 'blue') nb += 1;
              else ng += 1;
            }
          }
          p.prog = Math.max(-100, Math.min(100, p.prog + (nb - ng) * 24 * dt));
          const wasOwner = p.owner;
          if (p.prog >= 100) p.owner = 'blue';
          else if (p.prog <= -100) p.owner = 'gray';
          else if (Math.abs(p.prog) < 8) p.owner = null;
          if (p.owner !== wasOwner && p.owner) {
            const side = p.owner === 'blue' ? 'BLUE' : 'GRAY';
            pushFeed(`${side} holds ${LETTERS[pts.indexOf(p)]}`);
            if (p.owner === 'blue' && !player().dead && Math.hypot(player().x - p.x, player().y - p.y) < CAP_R) {
              s.caps += 1;
            }
          }
        }
        const blueOwned = pts.filter((p) => p.owner === 'blue').length;
        const grayOwned = pts.filter((p) => p.owner === 'gray').length;
        if (blueOwned >= 3) tickets.gray -= dt;
        if (grayOwned >= 3) tickets.blue -= dt;
        if (tickets.gray <= 0) finish(true);
        else if (tickets.blue <= 0) finish(false);

        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t -= dt;
          if (feed[i].t <= 0) feed.splice(i, 1);
        }
      }

      // ===== draw =====
      ctx.fillStyle = '#2c4a33';
      ctx.fillRect(0, 0, W, H);
      for (const p of patches) {
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#4a4438';
      ctx.fillRect(0, H / 2 - 24, W, 48);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.setLineDash([12, 14]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        ctx.strokeStyle = 'rgba(185,160,107,0.7)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, CAP_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // flag
        const flagColor = p.owner === 'blue' ? '#3b82f6' : p.owner === 'gray' ? '#98a1ad' : '#f4f4f5';
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - 30);
        ctx.stroke();
        ctx.fillStyle = flagColor;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 30);
        ctx.lineTo(p.x + 22, p.y - 24);
        ctx.lineTo(p.x, p.y - 18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(LETTERS[i], p.x, p.y - 36);
        // capture progress ring
        if (Math.abs(p.prog) > 4 && Math.abs(p.prog) < 100) {
          ctx.strokeStyle = p.prog > 0 ? '#60a5fa' : '#cbd5e1';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, CAP_R + 6, -Math.PI / 2, -Math.PI / 2 + (Math.abs(p.prog) / 100) * Math.PI * 2);
          ctx.stroke();
        }
      }

      for (const sol of soldiers) {
        if (sol.dead) continue;
        const bob = Math.sin(s.time * 6 + sol.bob) * 1.5;
        const y = sol.y + bob;
        drawDuck(ctx, sol.x, y, 9);
        // helmet over the head
        ctx.fillStyle = sol.team === 'blue' ? '#2f5fd0' : '#5b6470';
        ctx.beginPath();
        ctx.arc(sol.x + 3, y - 8, 5.5, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(sol.x - 3.5, y - 8.5, 13, 2);
        if (sol.hitT > 0) {
          ctx.strokeStyle = 'rgba(255,80,80,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sol.x, y, 13, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (sol.isPlayer) {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sol.x, y, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('YOU', sol.x, y - 20);
        } else if (sol.team === 'gray') {
          ctx.fillStyle = 'rgba(226,232,240,0.65)';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(sol.name, sol.x, y - 18);
        }
        // gun toward aim
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sol.x, y);
        ctx.lineTo(sol.x + Math.cos(sol.aim) * 14, y + Math.sin(sol.aim) * 14);
        ctx.stroke();
      }

      for (const b of bullets) {
        ctx.strokeStyle = b.team === 'blue' ? '#ffd166' : '#f0a8a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
        ctx.stroke();
      }
      for (const n of nades) {
        const t = n.t;
        const x = n.sx + (n.tx - n.sx) * t;
        const y = n.sy + (n.ty - n.sy) * t - Math.sin(t * Math.PI) * 34;
        ctx.fillStyle = '#3f6212';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const bm of booms) {
        const t = bm.t / 0.5;
        ctx.strokeStyle = `rgba(249,115,22,${1 - t})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, 12 + t * 62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(253,186,116,${0.35 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(bm.x, bm.y, 10 + t * 54, 0, Math.PI * 2);
        ctx.fill();
      }

      // HUD
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      ctx.fillRect(10, 10, 170, 44);
      ctx.fillRect(W - 180, 10, 170, 44);
      ctx.fillStyle = '#7fb2ff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`BLUE ${Math.max(0, Math.ceil(tickets.blue))}`, 20, 28);
      ctx.fillStyle = '#2f5fd0';
      ctx.fillRect(20, 34, 150 * Math.max(0, tickets.blue / 150), 10);
      ctx.fillStyle = '#d7dee8';
      ctx.fillText(`GRAY ${Math.max(0, Math.ceil(tickets.gray))}`, W - 170, 28);
      ctx.fillStyle = '#8b95a3';
      ctx.fillRect(W - 170, 34, 150 * Math.max(0, tickets.gray / 150), 10);

      ctx.textAlign = 'right';
      ctx.font = '11px sans-serif';
      feed.forEach((f, i) => {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, f.t)})`;
        ctx.fillText(f.text, W - 14, 74 + i * 16);
      });

      const p = player();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      ctx.fillRect(10, H - 42, 210, 32);
      ctx.fillStyle = p.dead ? '#ef4444' : '#4ade80';
      ctx.fillText(p.dead ? 'REDEPLOYING…' : `HP ${Math.ceil(p.hp)}`, 20, H - 27);
      ctx.fillStyle = '#a3e635';
      ctx.fillText(`🧨 ${s.playerNades}`, 120, H - 27);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`K ${s.kills} · CAP ${s.caps}`, 160, H - 27);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="max-w-full touch-none rounded-2xl" aria-label="Duck War 3 battlefield" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🪖 DUCK WAR 3</div>
            <div className="max-w-md text-sm text-white/70">
              1943. Blue Battalion vs the Gray Guard. Hold capture flags to bleed their tickets —
              first army to run out of tickets loses. Your squadmates are battle bots (some named
              after real Ducks on the leaderboard).
            </div>
            <div className="text-xs text-white/50">WASD move · mouse aim · click/hold fire · G or right-click grenade (3 per life)</div>
            <div className="text-xs text-white/40">Kills 100 pts · flag captures 250 pts · victory 1500 pts</div>
            <button
              onClick={() => startRef.current()}
              className="mt-1 rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Deploy
            </button>
          </Overlay>
        )}
        {phase === 'over' && result && (
          <Overlay>
            <div className="text-xl font-bold text-white">{result.win ? 'VICTORY! 🎖️' : 'Defeat… 🎖️'}</div>
            <div className="text-sm text-white/70">
              {result.kills} kills · {result.caps} captures
            </div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{result.score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Redeploy
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">Ticket war · 5 flags · squad bots · score saves when the battle ends</div>
    </div>
  );
}
