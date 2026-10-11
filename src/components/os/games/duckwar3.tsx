import { useEffect, useRef, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { drawDuck, Overlay, type GameProps } from './shared';
import { bfsPath, carveRoom, collides, generateMaze, lineOfSight, randomOpenTile, type MazeMap, type Vec } from '@/lib/os/maze';

const W = 880;
const H = 560;
const TILE = 40;
const PH = 520; // playfield height — HUD strip below
const R = 11; // soldier radius

const MODES = [
  { id: 'ctf', name: 'Capture the Flag', desc: 'Steal their flag, run it home through the maze. First to 3 caps.' },
  { id: 'tdm', name: 'Team Deathmatch', desc: 'Muzzle to muzzle in the corridors. First army to 30 kills.' },
  { id: 'koth', name: 'King of the Hill', desc: 'Hold the center plaza to 100 points before they do.' },
  { id: 'dom', name: 'Domination', desc: 'Own the zones, bleed their 150 tickets dry.' },
] as const;
type ModeId = (typeof MODES)[number]['id'];
type PlayerMode = 'solo' | 'coop' | 'versus';
type Team = 'blue' | 'gray';

const MODE_LIMIT: Record<ModeId, number> = { ctf: 300, tdm: 300, koth: 240, dom: 420 };

const DEFAULT_NAMES = [
  'Quackers', 'Featherstone', 'MallardMax', 'Waddles', 'SirQuack', 'PuddlePete', 'Beakman',
  'DuckNorris', 'ColonelCrumb', 'Eggbert', 'Henrietta', 'SoggyBread', 'Paddles', 'BillFord',
  'Miss Quackworth', 'General Waddle', 'Sgt. Peck', 'Crumb Commander',
];

const BLUE_HOME: Vec = { x: 100, y: 260 };
const GRAY_HOME: Vec = { x: 780, y: 260 };
const HILL: Vec = { x: 460, y: 260 };
const ZONE_ANCHORS: Vec[] = [
  { x: 200, y: 200 },
  { x: 460, y: 260 },
  { x: 680, y: 320 },
];

interface Soldier {
  team: Team;
  kind: 'p1' | 'p2' | 'bot';
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  respawn: number;
  name: string;
  cool: number;
  aim: number;
  retarget: number;
  hitT: number;
  bob: number;
  path: Vec[];
  pi: number;
  stuckT: number;
  lx: number;
  ly: number;
  objective: Vec;
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

interface Nade { sx: number; sy: number; tx: number; ty: number; t: number; }
interface Boom { x: number; y: number; t: number; }
interface FeedEntry { text: string; t: number; }
interface FlagState { team: Team; hx: number; hy: number; x: number; y: number; carrier: Soldier | null; dropT: number; }
interface Zone { x: number; y: number; owner: Team | null; prog: number; }

export function DuckWar3({ onScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const namesRef = useRef<string[]>([]);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [mode, setMode] = useState<ModeId>('ctf');
  const [pmode, setPmode] = useState<PlayerMode>('solo');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const pmodeRef = useRef(pmode);
  pmodeRef.current = pmode;
  const [result, setResult] = useState<{ win: boolean; score: number; detail: string } | null>(null);

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

    let map!: MazeMap;
    const soldiers: Soldier[] = [];
    const bullets: Bullet[] = [];
    const nades: Nade[] = [];
    const booms: Boom[] = [];
    const feed: FeedEntry[] = [];
    let flags: Record<Team, FlagState>;
    let zones: Zone[];
    let patches: { x: number; y: number; r: number }[] = [];

    const s = {
      phase: 'ready' as 'ready' | 'playing' | 'over',
      time: 0,
      kills: 0,
      obj: 0,
      p1Nades: 3,
      p2Nades: 3,
      capB: 0,
      capG: 0,
      killB: 0,
      killG: 0,
      hillB: 0,
      hillG: 0,
      tixB: 150,
      tixG: 150,
      nameCursor: 0,
      timeUp: false,
      clock: 0,
    };

    const namePool = () => {
      const pool = [...namesRef.current, ...DEFAULT_NAMES];
      const name = pool[s.nameCursor % pool.length];
      s.nameCursor += 1;
      return name;
    };

    const homeOf = (team: Team) => (team === 'blue' ? BLUE_HOME : GRAY_HOME);

    const spawnPos = (team: Team): Vec => {
      const home = homeOf(team);
      for (let i = 0; i < 8; i++) {
        const p = { x: home.x + (Math.random() - 0.5) * 96, y: home.y + (Math.random() - 0.5) * 96 };
        if (!collides(map, p.x, p.y, R)) return p;
      }
      return { x: home.x, y: home.y };
    };

    const makeSoldier = (team: Team, kind: Soldier['kind'] = 'bot'): Soldier => {
      const p = spawnPos(team);
      return {
        team,
        kind,
        x: p.x,
        y: p.y,
        hp: 100,
        dead: false,
        respawn: 0,
        name: kind === 'p1' ? 'You' : kind === 'p2' ? 'P2' : namePool(),
        cool: 0,
        aim: team === 'blue' ? 0 : Math.PI,
        retarget: Math.random() * 2,
        hitT: 0,
        bob: Math.random() * 10,
        path: [],
        pi: 0,
        stuckT: 0,
        lx: p.x,
        ly: p.y,
        objective: { x: p.x, y: p.y },
      };
    };

    const reset = () => {
      map = generateMaze(7, 4, TILE);
      carveRoom(map, 1, 5, 3, 3); // blue base
      carveRoom(map, 18, 5, 3, 3); // gray base
      carveRoom(map, 10, 5, 3, 3); // center plaza
      flags = {
        blue: { team: 'blue', hx: BLUE_HOME.x, hy: BLUE_HOME.y, x: BLUE_HOME.x, y: BLUE_HOME.y, carrier: null, dropT: 0 },
        gray: { team: 'gray', hx: GRAY_HOME.x, hy: GRAY_HOME.y, x: GRAY_HOME.x, y: GRAY_HOME.y, carrier: null, dropT: 0 },
      };
      zones = ZONE_ANCHORS.map((z) => ({ x: z.x, y: z.y, owner: null, prog: 0 }));
      patches = Array.from({ length: 22 }, () => ({ x: Math.random() * W, y: Math.random() * PH, r: 16 + Math.random() * 40 }));
      bullets.length = 0;
      nades.length = 0;
      booms.length = 0;
      feed.length = 0;
      soldiers.length = 0;
      s.time = MODE_LIMIT[modeRef.current];
      s.timeUp = false;
      s.kills = 0;
      s.obj = 0;
      s.p1Nades = 3;
      s.p2Nades = 3;
      s.capB = 0;
      s.capG = 0;
      s.killB = 0;
      s.killG = 0;
      s.hillB = 0;
      s.hillG = 0;
      s.tixB = 150;
      s.tixG = 150;
      soldiers.push(makeSoldier('blue', 'p1'));
      if (pmodeRef.current === 'coop') soldiers.push(makeSoldier('blue', 'p2'));
      if (pmodeRef.current === 'versus') soldiers.push(makeSoldier('gray', 'p2'));
      const blueBots = pmodeRef.current === 'solo' ? 7 : pmodeRef.current === 'coop' ? 6 : 8;
      const grayBots = pmodeRef.current === 'versus' ? 8 : 9;
      for (let i = 0; i < blueBots; i++) soldiers.push(makeSoldier('blue'));
      for (let i = 0; i < grayBots; i++) soldiers.push(makeSoldier('gray'));
      s.phase = 'ready';
      setPhase('ready');
      setResult(null);
    };
    resetRef.current = reset;
    reset();

    const p1 = () => soldiers[0];
    const p2 = () => soldiers.find((x) => x.kind === 'p2');

    const pushFeed = (text: string) => {
      feed.unshift({ text, t: 4 });
      if (feed.length > 5) feed.pop();
    };

    const fire = (shooter: Soldier, tx: number, ty: number, spread: number, dmg: number) => {
      const a = Math.atan2(ty - shooter.y, tx - shooter.x) + (Math.random() - 0.5) * spread;
      const speed = shooter.kind === 'bot' ? 520 : 640;
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

    const dropFlagIfCarrier = (sol: Soldier) => {
      for (const team of ['blue', 'gray'] as Team[]) {
        const f = flags[team];
        if (f.carrier === sol) {
          f.carrier = null;
          f.x = sol.x;
          f.y = sol.y;
          f.dropT = 6;
          pushFeed(`${sol.name} dropped the ${team} flag!`);
        }
      }
    };

    const damage = (target: Soldier, dmg: number, shooter: Soldier) => {
      if (target.dead || shooter.team === target.team) return;
      target.hp -= dmg;
      target.hitT = 0.12;
      if (target.hp > 0) return;
      target.dead = true;
      target.respawn = 3.5;
      dropFlagIfCarrier(target);
      if (modeRef.current === 'tdm' || modeRef.current === 'dom') {
        if (target.team === 'blue') s.killG += 1;
        else s.killB += 1;
      }
      if (shooter.kind === 'p1' && target.kind !== 'p1') {
        s.kills += 1;
        pushFeed(`You 🦆 ${target.name}`);
      } else if (target.kind === 'p1') {
        pushFeed(`${shooter.name} downed you — redeploying…`);
      } else {
        pushFeed(`${shooter.name} 🦆 ${target.name}`);
      }
    };

    const throwNade = (sol: Soldier, tx: number, ty: number, isP1: boolean) => {
      if (sol.dead) return;
      if (isP1 ? s.p1Nades <= 0 : s.p2Nades <= 0) return;
      if (isP1) s.p1Nades -= 1;
      else s.p2Nades -= 1;
      const d = Math.hypot(tx - sol.x, ty - sol.y) || 1;
      const capped = Math.min(260, d);
      nades.push({
        sx: sol.x,
        sy: sol.y,
        tx: sol.x + ((tx - sol.x) / d) * capped,
        ty: sol.y + ((ty - sol.y) / d) * capped,
        t: 0,
      });
    };

    const finish = (win: boolean) => {
      if (s.phase !== 'playing') return;
      s.phase = 'over';
      const detail =
        modeRef.current === 'ctf'
          ? `Flags ${s.capB}–${s.capG}`
          : modeRef.current === 'tdm'
            ? `Kills ${s.killB}–${s.killG}`
            : modeRef.current === 'koth'
              ? `Hill ${Math.floor(s.hillB)}–${Math.floor(s.hillG)}`
              : `Tickets ${Math.ceil(Math.max(0, s.tixB))}–${Math.ceil(Math.max(0, s.tixG))}`;
      const score = s.kills * 100 + Math.floor(s.obj) + (win ? 1500 : 250);
      setResult({ win, score, detail });
      setPhase('over');
      onScoreRef.current(score);
    };

    // decisive winner check — also settles sudden death after time runs out
    const leader = (): Team | null => {
      const m = modeRef.current;
      if (m === 'ctf') return s.capB === s.capG ? null : s.capB > s.capG ? 'blue' : 'gray';
      if (m === 'tdm') return s.killB === s.killG ? null : s.killB > s.killG ? 'blue' : 'gray';
      if (m === 'koth') return s.hillB === s.hillG ? null : s.hillB > s.hillG ? 'blue' : 'gray';
      return s.tixB === s.tixG ? null : s.tixB > s.tixG ? 'blue' : 'gray';
    };
    const checkWin = () => {
      const m = modeRef.current;
      if (m === 'ctf' && s.capB >= 3) return finish(true);
      if (m === 'ctf' && s.capG >= 3) return finish(false);
      if (m === 'tdm' && s.killB >= 30) return finish(true);
      if (m === 'tdm' && s.killG >= 30) return finish(false);
      if (m === 'koth' && s.hillB >= 100) return finish(true);
      if (m === 'koth' && s.hillG >= 100) return finish(false);
      if (m === 'dom' && s.tixG <= 0) return finish(true);
      if (m === 'dom' && s.tixB <= 0) return finish(false);
      if (s.timeUp) {
        const l = leader();
        if (l) finish(l === 'blue');
      }
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
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyG', 'Period', 'Comma', 'Slash'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' && s.phase === 'ready') start();
      if (e.code === 'KeyG' && s.phase === 'playing') throwNade(p1(), mouse.x, mouse.y, true);
      const two = p2();
      if (e.code === 'Comma' && s.phase === 'playing' && two) {
        throwNade(two, two.x + Math.cos(two.aim) * 240, two.y + Math.sin(two.aim) * 240, false);
      }
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
        throwNade(p1(), p.x, p.y, true);
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

    const moveWithWalls = (sol: Soldier, dx: number, dy: number) => {
      const nx = sol.x + dx;
      if (!collides(map, nx, sol.y, R)) sol.x = nx;
      const ny = sol.y + dy;
      if (!collides(map, sol.x, ny, R)) sol.y = ny;
    };

    const botObjective = (sol: Soldier): Vec => {
      const m = modeRef.current;
      if (m === 'ctf') {
        const enemyFlag = flags[sol.team === 'blue' ? 'gray' : 'blue'];
        const ownFlag = flags[sol.team];
        if (enemyFlag.carrier === sol) return homeOf(sol.team);
        if (ownFlag.carrier) return { x: ownFlag.carrier.x, y: ownFlag.carrier.y };
        if (sol.retarget % 2 < 1 || ownFlag.dropT > 0) return { x: ownFlag.x, y: ownFlag.y };
        return { x: enemyFlag.x, y: enemyFlag.y };
      }
      if (m === 'koth') {
        return { x: HILL.x + (Math.random() - 0.5) * 70, y: HILL.y + (Math.random() - 0.5) * 70 };
      }
      if (m === 'dom') {
        const open = zones.filter((z) => z.owner !== sol.team);
        if (open.length) {
          open.sort((a, b) => Math.hypot(a.x - sol.x, a.y - sol.y) - Math.hypot(b.x - sol.x, b.y - sol.y));
          return { x: open[0].x + (Math.random() - 0.5) * 40, y: open[0].y + (Math.random() - 0.5) * 40 };
        }
        return { x: zones[Math.floor(Math.random() * zones.length)].x, y: zones[0].y };
      }
      // tdm — hunt the nearest enemy
      let best: Soldier | null = null;
      let bestD = Infinity;
      for (const other of soldiers) {
        if (other.dead || other.team === sol.team) continue;
        const d = Math.hypot(other.x - sol.x, other.y - sol.y);
        if (d < bestD) {
          bestD = d;
          best = other;
        }
      }
      return best ? { x: best.x, y: best.y } : randomOpenTile(map);
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      s.clock += dt;

      if (s.phase === 'playing') {
        s.time -= dt;
        if (s.time <= 0 && !s.timeUp) {
          s.time = 0;
          const l = leader();
          if (l) finish(l === 'blue');
          else {
            s.timeUp = true;
            pushFeed('OVERTIME — next lead wins!');
          }
        }

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
              sol.path = [];
              if (sol.kind === 'p1') s.p1Nades = 3;
              if (sol.kind === 'p2') s.p2Nades = 3;
            }
            continue;
          }
          sol.cool -= dt;

          if (sol.kind === 'p1' || sol.kind === 'p2') {
            const isP1 = sol.kind === 'p1';
            let dx = 0;
            let dy = 0;
            if (isP1) {
              if (keys.has('KeyW')) dy -= 1;
              if (keys.has('KeyS')) dy += 1;
              if (keys.has('KeyA')) dx -= 1;
              if (keys.has('KeyD')) dx += 1;
            } else {
              if (keys.has('ArrowUp')) dy -= 1;
              if (keys.has('ArrowDown')) dy += 1;
              if (keys.has('ArrowLeft')) dx -= 1;
              if (keys.has('ArrowRight')) dx += 1;
            }
            const len = Math.hypot(dx, dy) || 1;
            moveWithWalls(sol, (dx / len) * 170 * dt, (dy / len) * 170 * dt);
            if (isP1) {
              sol.aim = Math.atan2(mouse.y - sol.y, mouse.x - sol.x);
              if (mouse.down && sol.cool <= 0) {
                fire(sol, mouse.x, mouse.y, 0.05, 30);
                sol.cool = 0.3;
              }
            } else {
              if (dx !== 0 || dy !== 0) sol.aim = Math.atan2(dy, dx);
              if ((keys.has('Period') || keys.has('Slash')) && sol.cool <= 0) {
                fire(sol, sol.x + Math.cos(sol.aim) * 200, sol.y + Math.sin(sol.aim) * 200, 0.06, 30);
                sol.cool = 0.32;
              }
            }
            if (sol.hitT <= 0 && sol.hp < 100) sol.hp = Math.min(100, sol.hp + 9 * dt);
            continue;
          }

          // --- bot brain ---
          sol.retarget -= dt;
          sol.stuckT += dt;
          if (sol.stuckT > 0.9) {
            if (Math.hypot(sol.x - sol.lx, sol.y - sol.ly) < 10) {
              sol.path = [];
              sol.retarget = 0;
            }
            sol.stuckT = 0;
            sol.lx = sol.x;
            sol.ly = sol.y;
          }
          if (sol.retarget <= 0) {
            sol.retarget = 1.2 + Math.random() * 1.4;
            sol.objective = botObjective(sol);
            sol.path = [];
          }
          if (Math.hypot(sol.objective.x - (sol.path.length ? sol.path[sol.path.length - 1].x : sol.x), sol.objective.y - (sol.path.length ? sol.path[sol.path.length - 1].y : sol.y)) > 90) {
            sol.path = [];
            sol.objective = botObjective(sol);
          }
          if (!sol.path.length) {
            sol.path = bfsPath(map, { x: sol.x, y: sol.y }, sol.objective);
            sol.pi = 0;
          }

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
          const carrying = flags.blue.carrier === sol || flags.gray.carrier === sol;
          if (enemy && enemyD < 240 && lineOfSight(map, sol.x, sol.y, enemy.x, enemy.y)) {
            sol.aim = Math.atan2(enemy.y - sol.y, enemy.x - sol.x);
            if (sol.cool <= 0 && enemyD < 230) {
              fire(sol, enemy.x, enemy.y, 0.16, 14);
              sol.cool = 0.75 + Math.random() * 0.45;
            }
            if (!carrying) {
              // strafe a little while engaging
              const side = sol.bob > 5 ? 1 : -1;
              moveWithWalls(sol, Math.cos(sol.aim + (Math.PI / 2) * side) * 34 * dt, Math.sin(sol.aim + (Math.PI / 2) * side) * 34 * dt);
            }
          } else {
            const wp = sol.path[sol.pi];
            if (wp) {
              const d = Math.hypot(wp.x - sol.x, wp.y - sol.y);
              if (d < 18) sol.pi += 1;
              else {
                const spd = carrying ? 100 : 92;
                moveWithWalls(sol, ((wp.x - sol.x) / d) * spd * dt, ((wp.y - sol.y) / d) * spd * dt);
              }
              const next = sol.path[sol.pi] ?? sol.objective;
              sol.aim = Math.atan2(next.y - sol.y, next.x - sol.x);
            } else {
              const d = Math.hypot(sol.objective.x - sol.x, sol.objective.y - sol.y) || 1;
              if (d > 26) moveWithWalls(sol, ((sol.objective.x - sol.x) / d) * 80 * dt, ((sol.objective.y - sol.y) / d) * 80 * dt);
              sol.aim = Math.atan2(sol.objective.y - sol.y, sol.objective.x - sol.x);
            }
          }
        }

        // --- bullets (walls stop them) ---
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          let hit = false;
          for (const sol of soldiers) {
            if (sol.dead || sol.team === b.team) continue;
            if (Math.hypot(sol.x - b.x, sol.y - b.y) < R) {
              damage(sol, b.dmg, b.shooter);
              hit = true;
              break;
            }
          }
          if (hit || b.life <= 0) {
            bullets.splice(i, 1);
            continue;
          }
          if (b.x < 0 || b.x > W || b.y < 0 || b.y > PH) {
            bullets.splice(i, 1);
            continue;
          }
          const tx = Math.floor(b.x / TILE);
          const ty = Math.floor(b.y / TILE);
          if (tx < 0 || ty < 0 || tx >= map.cols || ty >= map.rows || map.solid[ty * map.cols + tx]) {
            bullets.splice(i, 1);
          }
        }

        // --- grenades (lobbed over the walls) ---
        for (let i = nades.length - 1; i >= 0; i--) {
          const n = nades[i];
          n.t += dt / 0.9;
          if (n.t >= 1) {
            booms.push({ x: n.tx, y: n.ty, t: 0 });
            for (const sol of soldiers) {
              if (sol.dead) continue;
              const d = Math.hypot(sol.x - n.tx, sol.y - n.ty);
              if (d < 78) damage(sol, 95 * (1 - d / 78) + 15, n.sx < 0 ? p1() : p1());
            }
            nades.splice(i, 1);
          }
        }
        for (let i = booms.length - 1; i >= 0; i--) {
          booms[i].t += dt;
          if (booms[i].t > 0.5) booms.splice(i, 1);
        }

        // --- mode rules ---
        const m = modeRef.current;
        if (m === 'ctf') {
          for (const team of ['blue', 'gray'] as Team[]) {
            const f = flags[team];
            if (f.carrier) {
              f.x = f.carrier.x;
              f.y = f.carrier.y;
            } else if (f.dropT > 0) {
              f.dropT -= dt;
              if (f.dropT <= 0) {
                f.x = f.hx;
                f.y = f.hy;
                pushFeed(`${team.toUpperCase()} flag returned home`);
              }
            }
          }
          for (const sol of soldiers) {
            if (sol.dead) continue;
            for (const team of ['blue', 'gray'] as Team[]) {
              const f = flags[team];
              if (Math.hypot(sol.x - f.x, sol.y - f.y) > 24) continue;
              if (f.carrier) continue;
              if (sol.team !== team) {
                if (f.dropT > 0 || f.x !== f.hx || f.y !== f.hy) {
                  f.carrier = sol;
                  f.dropT = 0;
                  pushFeed(`${sol.name} grabbed the ${team.toUpperCase()} flag!`);
                } else {
                  f.carrier = sol;
                  pushFeed(`${sol.name} grabbed the ${team.toUpperCase()} flag!`);
                }
              } else if (f.dropT > 0) {
                f.x = f.hx;
                f.y = f.hy;
                f.dropT = 0;
                pushFeed(`${team.toUpperCase()} flag returned home`);
              }
            }
            const carrying = flags.blue.carrier === sol || flags.gray.carrier === sol;
            if (carrying) {
              const own = flags[sol.team];
              const home = homeOf(sol.team);
              const ownHome = !own.carrier && own.dropT <= 0 && own.x === own.hx && own.y === own.hy;
              if (ownHome && Math.hypot(sol.x - home.x, sol.y - home.y) < 34) {
                const enemyFlag = flags[sol.team === 'blue' ? 'gray' : 'blue'];
                enemyFlag.carrier = null;
                enemyFlag.x = enemyFlag.hx;
                enemyFlag.y = enemyFlag.hy;
                if (sol.team === 'blue') s.capB += 1;
                else s.capG += 1;
                pushFeed(`${sol.team === 'blue' ? 'BLUE' : 'GRAY'} CAPTURES! ${s.capB}–${s.capG}`);
                if (sol.kind === 'p1') s.obj += 250;
              }
            }
          }
        } else if (m === 'koth') {
          let nb = 0;
          let ng = 0;
          for (const sol of soldiers) {
            if (sol.dead) continue;
            if (Math.hypot(sol.x - HILL.x, sol.y - HILL.y) < 70) {
              if (sol.team === 'blue') nb += 1;
              else ng += 1;
            }
          }
          if (nb > 0 && ng === 0) {
            s.hillB += 8 * dt;
            const a = p1();
            if (!a.dead && Math.hypot(a.x - HILL.x, a.y - HILL.y) < 70) s.obj += 20 * dt;
          } else if (ng > 0 && nb === 0) {
            s.hillG += 8 * dt;
          }
        } else if (m === 'dom') {
          for (const z of zones) {
            let nb = 0;
            let ng = 0;
            for (const sol of soldiers) {
              if (sol.dead) continue;
              if (Math.hypot(sol.x - z.x, sol.y - z.y) < 55) {
                if (sol.team === 'blue') nb += 1;
                else ng += 1;
              }
            }
            z.prog = Math.max(-100, Math.min(100, z.prog + (nb - ng) * 24 * dt));
            const was = z.owner;
            if (z.prog >= 100) z.owner = 'blue';
            else if (z.prog <= -100) z.owner = 'gray';
            else if (Math.abs(z.prog) < 8) z.owner = null;
            if (z.owner !== was && z.owner) {
              pushFeed(`${z.owner === 'blue' ? 'BLUE' : 'GRAY'} holds the zone`);
              const a = p1();
              if (z.owner === 'blue' && !a.dead && Math.hypot(a.x - z.x, a.y - z.y) < 55) s.obj += 150;
            }
          }
          const bOwn = zones.filter((z) => z.owner === 'blue').length;
          const gOwn = zones.filter((z) => z.owner === 'gray').length;
          if (bOwn >= 2) s.tixG -= (bOwn - 1) * 1.7 * dt;
          if (gOwn >= 2) s.tixB -= (gOwn - 1) * 1.7 * dt;
        }

        checkWin();
        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t -= dt;
          if (feed[i].t <= 0) feed.splice(i, 1);
        }
      }

      // ==================== draw ====================
      // floor
      ctx.fillStyle = '#2c4a33';
      ctx.fillRect(0, 0, W, PH);
      for (const p of patches) {
        ctx.fillStyle = 'rgba(0,0,0,0.07)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // tile checker
      for (let ty = 0; ty < map.rows; ty++) {
        for (let tx = 0; tx < map.cols; tx++) {
          if (map.solid[ty * map.cols + tx]) continue;
          if ((tx + ty) % 2 === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.045)';
            ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          }
        }
      }
      // base tints
      ctx.fillStyle = 'rgba(59,130,246,0.08)';
      ctx.fillRect(1 * TILE, 5 * TILE, 3 * TILE, 3 * TILE);
      ctx.fillStyle = 'rgba(152,161,173,0.08)';
      ctx.fillRect(18 * TILE, 5 * TILE, 3 * TILE, 3 * TILE);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(10 * TILE, 5 * TILE, 3 * TILE, 3 * TILE);

      // walls as extruded blocks (top-down 2.5D)
      const WALL_H = 12;
      for (let ty = 0; ty < map.rows; ty++) {
        for (let tx = 0; tx < map.cols; tx++) {
          if (!map.solid[ty * map.cols + tx]) continue;
          const x = tx * TILE;
          const y = ty * TILE;
          // top face
          ctx.fillStyle = '#4a4438';
          ctx.fillRect(x, y - WALL_H, TILE, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x, y - WALL_H, TILE, 3);
          // front face only when the tile below is open (vertical runs merge)
          const belowOpen = ty + 1 < map.rows && !map.solid[(ty + 1) * map.cols + tx];
          const belowEdge = ty + 1 === map.rows;
          if (belowOpen || belowEdge) {
            ctx.fillStyle = '#2e2921';
            ctx.fillRect(x, y + TILE - WALL_H, TILE, WALL_H);
          }
        }
      }

      const m = modeRef.current;
      // mode objects
      if (m === 'ctf') {
        for (const team of ['blue', 'gray'] as Team[]) {
          const f = flags[team];
          const bob = Math.sin(s.clock * 4 + (team === 'blue' ? 0 : 2)) * 3;
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(f.x, f.y + 6, 12, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#d4d4d8';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x, f.y - 30 + bob);
          ctx.stroke();
          ctx.fillStyle = team === 'blue' ? '#3b82f6' : '#98a1ad';
          ctx.beginPath();
          ctx.moveTo(f.x, f.y - 30 + bob);
          ctx.lineTo(f.x + 22, f.y - 24 + bob);
          ctx.lineTo(f.x, f.y - 18 + bob);
          ctx.closePath();
          ctx.fill();
          if (f.dropT > 0) {
            ctx.strokeStyle = `rgba(255,220,120,${0.5 + 0.4 * Math.sin(s.clock * 8)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(f.x, f.y, 16, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      } else if (m === 'koth') {
        ctx.fillStyle = 'rgba(250,204,21,0.10)';
        ctx.beginPath();
        ctx.arc(HILL.x, HILL.y, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(250,204,21,0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(HILL.x, HILL.y, 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('KOTH', HILL.x, HILL.y - 76);
      } else if (m === 'dom') {
        zones.forEach((z, i) => {
          ctx.strokeStyle = 'rgba(185,160,107,0.7)';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(z.x, z.y, 55, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (z.owner) {
            ctx.fillStyle = z.owner === 'blue' ? 'rgba(59,130,246,0.12)' : 'rgba(152,161,173,0.12)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, 55, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = 'bold 13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String.fromCharCode(65 + i), z.x, z.y - 60);
          if (Math.abs(z.prog) > 4 && Math.abs(z.prog) < 100) {
            ctx.strokeStyle = z.prog > 0 ? '#60a5fa' : '#cbd5e1';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(z.x, z.y, 61, -Math.PI / 2, -Math.PI / 2 + (Math.abs(z.prog) / 100) * Math.PI * 2);
            ctx.stroke();
          }
        });
      }

      // soldiers
      for (const sol of soldiers) {
        if (sol.dead) continue;
        const bob = Math.sin(s.clock * 6 + sol.bob) * 1.5;
        const y = sol.y + bob;
        drawDuck(ctx, sol.x, y, 9);
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
        if (sol.kind === 'p1') {
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sol.x, y, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('YOU', sol.x, y - 20);
        } else if (sol.kind === 'p2') {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sol.x, y, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('P2', sol.x, y - 20);
        } else if (sol.team === 'gray') {
          ctx.fillStyle = 'rgba(226,232,240,0.6)';
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
        // carried flag on the back
        if (flags.blue.carrier === sol || flags.gray.carrier === sol) {
          const t: Team = flags.blue.carrier === sol ? 'blue' : 'gray';
          ctx.fillStyle = t === 'blue' ? '#3b82f6' : '#98a1ad';
          ctx.fillRect(sol.x - 14, y - 16, 8, 6);
        }
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

      // ---------- HUD ----------
      ctx.fillStyle = '#0b0f1c';
      ctx.fillRect(0, PH, W, H - PH);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(12,16,29,0.72)';
      ctx.fillRect(10, 10, 190, 40);
      ctx.fillRect(W - 200, 10, 190, 40);
      ctx.fillRect(W / 2 - 55, 10, 110, 26);
      const modeName = MODES.find((x) => x.id === m)?.name ?? '';
      ctx.fillStyle = '#9fb3d9';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')} · ${modeName}`, W / 2, 27);

      const bar = (x: number, w: number, frac: number, color: string) => {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, 36, w, 8);
        ctx.fillStyle = color;
        ctx.fillRect(x, 36, w * Math.max(0, Math.min(1, frac)), 8);
      };
      ctx.textAlign = 'left';
      ctx.font = 'bold 12px sans-serif';
      if (m === 'ctf') {
        ctx.fillStyle = '#7fb2ff';
        ctx.fillText(`BLUE ${s.capB} caps`, 20, 26);
        bar(20, 170, s.capB / 3, '#2f5fd0');
        ctx.fillStyle = '#d7dee8';
        ctx.fillText(`GRAY ${s.capG} caps`, W - 190, 26);
        bar(W - 190, 170, s.capG / 3, '#8b95a3');
      } else if (m === 'tdm') {
        ctx.fillStyle = '#7fb2ff';
        ctx.fillText(`BLUE ${s.killB} kills`, 20, 26);
        bar(20, 170, s.killB / 30, '#2f5fd0');
        ctx.fillStyle = '#d7dee8';
        ctx.fillText(`GRAY ${s.killG} kills`, W - 190, 26);
        bar(W - 190, 170, s.killG / 30, '#8b95a3');
      } else if (m === 'koth') {
        ctx.fillStyle = '#7fb2ff';
        ctx.fillText(`HILL ${Math.floor(s.hillB)}`, 20, 26);
        bar(20, 170, s.hillB / 100, '#2f5fd0');
        ctx.fillStyle = '#d7dee8';
        ctx.fillText(`HILL ${Math.floor(s.hillG)}`, W - 190, 26);
        bar(W - 190, 170, s.hillG / 100, '#8b95a3');
      } else {
        ctx.fillStyle = '#7fb2ff';
        ctx.fillText(`BLUE ${Math.ceil(Math.max(0, s.tixB))} tix`, 20, 26);
        bar(20, 170, s.tixB / 150, '#2f5fd0');
        ctx.fillStyle = '#d7dee8';
        ctx.fillText(`GRAY ${Math.ceil(Math.max(0, s.tixG))} tix`, W - 190, 26);
        bar(W - 190, 170, s.tixG / 150, '#8b95a3');
      }

      ctx.textAlign = 'right';
      ctx.font = '11px sans-serif';
      feed.forEach((f, i) => {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, f.t)})`;
        ctx.fillText(f.text, W - 14, 66 + i * 16);
      });

      // bottom HUD
      const a = p1();
      ctx.fillStyle = 'rgba(12,16,29,0.85)';
      ctx.fillRect(10, PH + 4, 300, 28);
      ctx.textAlign = 'left';
      ctx.fillStyle = a.dead ? '#ef4444' : '#4ade80';
      ctx.fillText(a.dead ? 'REDEPLOYING…' : `HP ${Math.ceil(a.hp)}`, 20, PH + 22);
      ctx.fillStyle = '#a3e635';
      ctx.fillText(`🧨 ${s.p1Nades}`, 110, PH + 22);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`K ${s.kills}`, 165, PH + 22);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`PTS ${Math.floor(s.kills * 100 + s.obj)}`, 215, PH + 22);
      const two = p2();
      if (two) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(12,16,29,0.85)';
        ctx.fillRect(W - 230, PH + 4, 220, 28);
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`P2 ${two.dead ? 'REDEPLOY…' : `HP ${Math.ceil(two.hp)}`} · 🧨${s.p2Nades}`, W - 20, PH + 22);
      }

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

  // fresh maze when the menu selections change
  useEffect(() => {
    resetRef.current();
  }, [mode, pmode]);

  const controls =
    pmode === 'solo'
      ? 'WASD move · mouse aim · hold click fire · G / right-click grenade (3 per life, lobs over walls)'
      : 'P1: WASD + mouse, G grenade · P2: arrows move, . or / fire, , grenade';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} className="max-w-full touch-none rounded-2xl" aria-label="Duck War maze battlefield" />
        {phase === 'ready' && (
          <Overlay>
            <div className="text-2xl font-bold text-white">🪖 DUCK WAR — MAZE ARENA</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    mode === m.id ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <div className="max-w-md text-sm text-white/70">{MODES.find((m) => m.id === mode)?.desc} Fresh maze every round.</div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {([['solo', '1 Player'], ['coop', '2P Co-op'], ['versus', '2P Versus']] as Array<[PlayerMode, string]>).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPmode(id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    pmode === id ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="text-xs text-white/50">{controls}</div>
            <div className="text-xs text-white/40">Kills 100 pts · objectives 150–250 pts · victory 1500 pts</div>
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
            <div className="text-sm text-white/70">{result.detail}</div>
            <div className="text-3xl font-bold text-[var(--os-accent)]">{result.score}</div>
            <button
              onClick={() => resetRef.current()}
              className="rounded-xl bg-[var(--os-accent)] px-6 py-2 text-sm font-semibold text-[#17131f]"
            >
              Redeploy — new maze
            </button>
          </Overlay>
        )}
      </div>
      <div className="text-xs text-white/45">
        Maze arena · {MODES.length} game modes · solo or 2-player on one keyboard · score saves when the battle ends
      </div>
    </div>
  );
}
