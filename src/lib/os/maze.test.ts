import { expect, it } from 'vitest';
import { bfsPath, carveRoom, generateMaze, isOpen, lineOfSight, mulberry32, randomOpenTile } from './maze';

const TILE = 40;

function buildMap() {
  const rng = mulberry32(7);
  const map = generateMaze(7, 4, TILE, rng);
  // same rooms the game carves
  carveRoom(map, 1, 5, 3, 3);
  carveRoom(map, 18, 5, 3, 3);
  carveRoom(map, 10, 5, 3, 3);
  return map;
}

function floodOpen(map: ReturnType<typeof generateMaze>, startIdx: number) {
  const seen = new Set<number>([startIdx]);
  const queue = [startIdx];
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = cur % map.cols;
    const cy = Math.floor(cur / map.cols);
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const ni = ny * map.cols + nx;
      if (map.solid[ni] || seen.has(ni)) continue;
      seen.add(ni);
      queue.push(ni);
    }
  }
  return seen.size;
}

// @kliv-spec-derived — from user intent: "a maze with game modes" — every corridor must connect
it('every open tile is reachable from the first open tile', () => {
  const map = buildMap();
  const openCount = map.solid.filter((s) => !s).length;
  const firstOpen = map.solid.findIndex((s) => !s);
  expect(firstOpen).toBeGreaterThanOrEqual(0);
  expect(floodOpen(map, firstOpen)).toBe(openCount);
});

// @kliv-spec-derived — the fight has to stay inside the walls
it('the border of the map is fully solid', () => {
  const map = buildMap();
  for (let tx = 0; tx < map.cols; tx++) {
    expect(isOpen(map, tx, 0)).toBe(false);
    expect(isOpen(map, tx, map.rows - 1)).toBe(false);
  }
  for (let ty = 0; ty < map.rows; ty++) {
    expect(isOpen(map, 0, ty)).toBe(false);
    expect(isOpen(map, map.cols - 1, ty)).toBe(false);
  }
});

// @kliv-spec-derived — bots must walk corridors, never through walls
it('paths stay on open tiles, start at the soldier and end at the goal', () => {
  const map = buildMap();
  const rng = mulberry32(99);
  for (let i = 0; i < 6; i++) {
    const from = randomOpenTile(map, rng);
    const to = randomOpenTile(map, rng);
    const path = bfsPath(map, from, to);
    expect(path.length).toBeGreaterThan(0);
    // first waypoint near the start, last at the goal
    expect(Math.hypot(path[0].x - to.x, path[0].y - to.y)).toBeLessThan(TILE * 40);
    const last = path[path.length - 1];
    expect(Math.hypot(last.x - to.x, last.y - to.y)).toBeLessThan(TILE * 1.6);
    // every waypoint sits on an open tile
    for (const p of path) {
      expect(isOpen(map, Math.floor(p.x / TILE), Math.floor(p.y / TILE))).toBe(true);
    }
    // steps are corridor-sized hops, not teleports
    for (let j = 1; j < path.length; j++) {
      expect(Math.hypot(path[j].x - path[j - 1].x, path[j].y - path[j - 1].y)).toBeLessThan(TILE * 4);
    }
  }
});

// @kliv-spec-derived — you should not be able to shoot through a wall
it('line of sight is blocked by walls between two open tiles', () => {
  const map = buildMap();
  let found = false;
  for (let ty = 1; ty < map.rows - 1 && !found; ty++) {
    for (let tx = 1; tx < map.cols - 2 && !found; tx++) {
      if (isOpen(map, tx, ty) && !isOpen(map, tx + 1, ty) && isOpen(map, tx + 2, ty)) {
        const a = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        const b = { x: (tx + 2.5) * TILE, y: (ty + 0.5) * TILE };
        expect(lineOfSight(map, a.x, a.y, b.x, b.y)).toBe(false);
        found = true;
      }
    }
  }
  expect(found).toBe(true);
  // and clear inside one open cell
  const p = randomOpenTile(map, mulberry32(3));
  expect(lineOfSight(map, p.x, p.y, p.x + 8, p.y + 8)).toBe(true);
});
