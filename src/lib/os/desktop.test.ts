import { describe, expect, it } from 'vitest';
import {
  clampPos,
  defaultPos,
  GRID,
  linkKeyFor,
  linkLabel,
  nextFreePos,
  overlaps,
  rowsPerColumn,
  validateLinkInput,
} from './desktop';

// @kliv-spec-derived — from user intent: "make the icons movable"
describe('desktop icon grid', () => {
  it('places icons top-left first and fills each column downward', () => {
    expect(defaultPos(0, 4)).toEqual({ x: GRID.x, y: GRID.y });
    expect(defaultPos(1, 4)).toEqual({ x: GRID.x, y: GRID.y + GRID.h });
    expect(defaultPos(4, 4)).toEqual({ x: GRID.x + GRID.w, y: GRID.y });
  });

  it('never leaves a dragged icon off screen', () => {
    expect(clampPos({ x: -50, y: -50 }, { w: 1000, h: 700 })).toEqual({ x: 0, y: 0 });
    expect(clampPos({ x: 5000, y: 5000 }, { w: 1000, h: 700 })).toEqual({ x: 916, y: 616 });
  });

  it('detects when two icons sit on top of each other', () => {
    expect(overlaps({ x: 12, y: 12 }, { x: 40, y: 40 })).toBe(true);
    expect(overlaps({ x: 12, y: 12 }, { x: 12, y: 12 + GRID.h })).toBe(false);
  });

  it('gives a new icon the first slot nobody covers', () => {
    const rows = rowsPerColumn(460);
    const taken = [defaultPos(0, rows), defaultPos(1, rows), defaultPos(2, rows)];
    expect(nextFreePos(taken, { w: 1200, h: 460 })).toEqual(defaultPos(3, rows));
  });

  it('skips a slot an icon was dragged onto', () => {
    const rows = rowsPerColumn(460);
    const taken = [defaultPos(0, rows), { x: GRID.x, y: GRID.y + GRID.h }];
    const next = nextFreePos(taken, { w: 1200, h: 460 });
    expect(overlaps(next, taken[0])).toBe(false);
    expect(overlaps(next, taken[1])).toBe(false);
  });
});

// @kliv-spec-derived — from user intent: "add an 'add app' option for people to add custom links"
describe('custom link shortcuts', () => {
  it('accepts bare domains and full urls', () => {
    expect(validateLinkInput('', 'example.com')).toBeNull();
    expect(validateLinkInput('News', 'https://news.example.com/feed')).toBeNull();
  });

  it('rejects empty boxes, plain words, and overlong names', () => {
    expect(validateLinkInput('', '')).toMatch(/enter a web address/i);
    expect(validateLinkInput('', 'not a url')).not.toBeNull();
    expect(validateLinkInput('A very long app name over the cap', 'example.com')).not.toBeNull();
  });

  it('falls back to the site host when no name is typed', () => {
    expect(linkLabel('', 'https://www.example.com/page')).toBe('example.com');
    expect(linkLabel('My Site', 'https://example.com')).toBe('My Site');
  });

  it('derives a stable key from the host', () => {
    expect(linkKeyFor('https://www.example.com/x?y=1')).toBe('link:example.com');
  });
});
