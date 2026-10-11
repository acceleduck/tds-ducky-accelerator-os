export interface Vec {
  x: number;
  y: number;
}

export interface MazeMap {
  cols: number; // tile columns
  rows: number; // tile rows
  tile: number; // px per tile
  solid: boolean[]; // cols*rows, true = wall
}

/** Deterministic rng for tests (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (map: MazeMap, tx: number, ty: number) => ty * map.cols + tx;

export function inBounds(map: MazeMap, tx: number, ty: number) {
  return tx >= 0 && ty >= 0 && tx < map.cols && ty < map.rows;
}

export function isOpen(map: MazeMap, tx: number, ty: number) {
  return inBounds(map, tx, ty) && !map.solid[at(map, tx, ty)];
}

/**
 * Maze on a coarse cell grid stamped into tiles: every cell is a 2x2 open
 * block, walls between cells are 1 tile thick (grid pattern wall, open, open,
 * wall, open, open, ...). Corridors are therefore 2 tiles wide.
 */
export function generateMaze(cellCols: number, cellRows: number, tile: number, rng: () => number = Math.random): MazeMap {
  const cols = cellCols * 3 + 1;
  const rows = cellRows * 3 + 1;
  const solid = new Array<boolean>(cols * rows).fill(true);
  const map: MazeMap = { cols, rows, tile, solid };

  const openCell = (cx: number, cy: number) => {
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        if (inBounds(map, 3 * cx + 1 + i, 3 * cy + 1 + j)) solid[at(map, 3 * cx + 1 + i, 3 * cy + 1 + j)] = false;
      }
    }
  };
  const openWall = (cx: number, cy: number, dx: number, dy: number) => {
    if (dx === 1) {
      const tx = 3 * cx + 3;
      for (let j = 0; j < 2; j++) if (inBounds(map, tx, 3 * cy + 1 + j)) solid[at(map, tx, 3 * cy + 1 + j)] = false;
    } else if (dx === -1) {
      const tx = 3 * cx;
      for (let j = 0; j < 2; j++) if (inBounds(map, tx, 3 * cy + 1 + j)) solid[at(map, tx, 3 * cy + 1 + j)] = false;
    } else if (dy === 1) {
      const ty = 3 * cy + 3;
      for (let i = 0; i < 2; i++) if (inBounds(map, 3 * cx + 1 + i, ty)) solid[at(map, 3 * cx + 1 + i, ty)] = false;
    } else if (dy === -1) {
      const ty = 3 * cy;
      for (let i = 0; i < 2; i++) if (inBounds(map, 3 * cx + 1 + i, ty)) solid[at(map, 3 * cx + 1 + i, ty)] = false;
    }
  };

  const visited = Array.from({ length: cellRows }, () => new Array<boolean>(cellCols).fill(false));
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0][0] = true;
  openCell(0, 0);
  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cellCols || ny >= cellRows || visited[ny][nx]) continue;
      visited[ny][nx] = true;
      openCell(nx, ny);
      openWall(cx, cy, dx, dy);
      stack.push([nx, ny]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }

  // Braid: knock out some interior walls so the maze has loops — better flow for a shooter.
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      if (!solid[at(map, tx, ty)]) continue;
      const horiz = !solid[at(map, tx - 1, ty)] && !solid[at(map, tx + 1, ty)];
      const vert = !solid[at(map, tx, ty - 1)] && !solid[at(map, tx, ty + 1)];
      if ((horiz || vert) && rng() < 0.22) solid[at(map, tx, ty)] = false;
    }
  }
  return map;
}

/** Open a rectangular room of tiles (clamped to bounds). */
export function carveRoom(map: MazeMap, tx: number, ty: number, w: number, h: number) {
  for (let y = ty; y < ty + h; y++) {
    for (let x = tx; x < tx + w; x++) {
      if (inBounds(map, x, y)) map.solid[at(map, x, y)] = false;
    }
  }
}

export function solidAtPx(map: MazeMap, x: number, y: number) {
  const tx = Math.floor(x / map.tile);
  const ty = Math.floor(y / map.tile);
  return !isOpen(map, tx, ty);
}

/** Circle vs wall tiles (AABB approximation) — used for soldier/car movement. */
export function collides(map: MazeMap, x: number, y: number, r: number) {
  const t = map.tile;
  const x0 = Math.floor((x - r) / t);
  const x1 = Math.floor((x + r) / t);
  const y0 = Math.floor((y - r) / t);
  const y1 = Math.floor((y + r) / t);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isOpen(map, tx, ty)) return true;
    }
  }
  return false;
}

/** Sample along the segment — true when nothing solid blocks it. */
export function lineOfSight(map: MazeMap, x1: number, y1: number, x2: number, y2: number) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (solidAtPx(map, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

export function randomOpenTile(map: MazeMap, rng: () => number = Math.random): Vec {
  for (let i = 0; i < 600; i++) {
    const tx = Math.floor(rng() * map.cols);
    const ty = Math.floor(rng() * map.rows);
    if (isOpen(map, tx, ty)) return { x: (tx + 0.5) * map.tile, y: (ty + 0.5) * map.tile };
  }
  return { x: map.tile * 1.5, y: map.tile * 1.5 };
}

function nearestOpen(map: MazeMap, tx: number, ty: number): [number, number] {
  if (isOpen(map, tx, ty)) return [tx, ty];
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isOpen(map, tx + dx, ty + dy)) return [tx + dx, ty + dy];
      }
    }
  }
  return [1, 1];
}

/** BFS through corridors, returned as pixel waypoints with light smoothing. */
export function bfsPath(map: MazeMap, from: Vec, to: Vec): Vec[] {
  const [sx, sy] = nearestOpen(map, Math.floor(from.x / map.tile), Math.floor(from.y / map.tile));
  const [gx, gy] = nearestOpen(map, Math.floor(to.x / map.tile), Math.floor(to.y / map.tile));
  const start = at(map, sx, sy);
  const goal = at(map, gx, gy);
  if (start === goal) return [{ x: to.x, y: to.y }];

  const prev = new Int32Array(map.cols * map.rows).fill(-2);
  prev[start] = -1;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % map.cols;
    const cy = Math.floor(cur / map.cols);
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!isOpen(map, nx, ny)) continue;
      const ni = at(map, nx, ny);
      if (prev[ni] !== -2) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -2) return [];

  const tiles: number[] = [];
  for (let cur = goal; cur !== -1; cur = prev[cur]) tiles.push(cur);
  tiles.reverse();
  let pts: Vec[] = tiles.map((i) => ({
    x: ((i % map.cols) + 0.5) * map.tile,
    y: (Math.floor(i / map.cols) + 0.5) * map.tile,
  }));
  pts[pts.length - 1] = { x: to.x, y: to.y };
  if (pts.length > 1 && Math.hypot(pts[0].x - from.x, pts[0].y - from.y) < map.tile * 0.8) pts = pts.slice(1);

  if (pts.length <= 1) return pts;

  // light smoothing: drop waypoints that are reachable in a straight line
  const out: Vec[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + 3);
    while (j > i + 1 && !lineOfSight(map, pts[i].x, pts[i].y, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out.slice(0, 220);
}
