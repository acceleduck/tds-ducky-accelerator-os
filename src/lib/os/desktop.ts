import { isProbablyUrl, normalizeUrl } from './browser';

/** A saved desktop row: a moved built-in app (url null) or a custom link. */
export interface DesktopItem {
  key: string;
  label: string;
  url: string | null;
  emoji: string | null;
  x: number;
  y: number;
  rowId: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  w: number;
  h: number;
}

/** Rough on-screen size of one desktop icon button. */
export const ICON = { w: 84, h: 84 };
/** Grid origin and pitch — column-first, top-left, like a classic desktop. */
export const GRID = { x: 12, y: 12, w: 88, h: 92 };

/** How many icons stack in one column before wrapping to the next. */
export function rowsPerColumn(desktopHeight: number): number {
  return Math.max(1, Math.floor((desktopHeight - GRID.y - 8) / GRID.h));
}

/** Grid slot for the nth icon (index order: built-ins, then links). */
export function defaultPos(index: number, rows: number): Point {
  const col = Math.floor(index / rows);
  const row = index % rows;
  return { x: GRID.x + col * GRID.w, y: GRID.y + row * GRID.h };
}

/** Keep an icon fully on screen after a drag. */
export function clampPos(p: Point, bounds: Bounds): Point {
  const maxX = Math.max(0, bounds.w - ICON.w);
  const maxY = Math.max(0, bounds.h - ICON.h);
  return {
    x: Math.min(Math.max(0, Math.round(p.x)), maxX),
    y: Math.min(Math.max(0, Math.round(p.y)), maxY),
  };
}

/** True when two icons would sit on top of each other. */
export function overlaps(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < ICON.w && Math.abs(a.y - b.y) < ICON.h;
}

/** First free grid slot given the positions already taken. */
export function nextFreePos(taken: Point[], bounds: Bounds): Point {
  const rows = rowsPerColumn(bounds.h);
  const cols = Math.max(1, Math.floor((bounds.w - GRID.x) / GRID.w));
  const total = rows * cols + taken.length + 1;
  for (let i = 0; i < total; i += 1) {
    const p = defaultPos(i, rows);
    if (!taken.some((t) => overlaps(p, t))) return p;
  }
  return defaultPos(taken.length, rows);
}

/** Returns an error message when the Add-app form can't be submitted. */
export function validateLinkInput(label: string, url: string): string | null {
  if (!url.trim()) return 'Enter a web address, like example.com';
  if (!isProbablyUrl(url.trim())) return 'That doesn’t look like a web address yet';
  if (label.trim().length > 24) return 'Keep the name under 24 characters';
  return null;
}

/** Display name for a link: the typed label, or the site's host. */
export function linkLabel(label: string, url: string): string {
  const typed = label.trim();
  if (typed) return typed.slice(0, 24);
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
    return host.slice(0, 24);
  } catch {
    return 'Shortcut';
  }
}

/** Stable key for a link row, derived from its host. */
export function linkKeyFor(url: string): string {
  try {
    const host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
    return `link:${host.replace(/[^a-z0-9.-]/gi, '-')}`;
  } catch {
    return 'link:shortcut';
  }
}

/** Host for the DuckDuckGo favicon service. */
export function hostOfLink(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname;
  } catch {
    return '';
  }
}

export const LINK_EMOJI = ['🔗', '⚡', '🎮', '🎬', '🎵', '📚', '🛒', '📰'];
