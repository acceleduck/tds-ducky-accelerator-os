// @kliv-spec-derived — from user intent: "windows open, drag, minimize and maximize without losing their place"
import { describe, it, expect } from 'vitest';
import { windowReducer } from './windowReducer';

const DESKTOP = { w: 1280, h: 752 };

function openWin(id: string, appId = 'a', state: Parameters<typeof windowReducer>[0] = []) {
  return windowReducer(state, {
    type: 'open',
    id,
    appId,
    title: appId,
    w: 500,
    h: 400,
    desktop: DESKTOP,
    mobile: false,
  });
}

describe('window manager', () => {
  it('opens a new window fully inside the desktop', () => {
    const s = openWin('w1');
    expect(s).toHaveLength(1);
    expect(s[0].z).toBeGreaterThan(0);
    expect(s[0].rect.w).toBe(500);
    expect(s[0].rect.x).toBeGreaterThanOrEqual(0);
    expect(s[0].rect.x + s[0].rect.w).toBeLessThanOrEqual(DESKTOP.w);
    expect(s[0].rect.y).toBeGreaterThanOrEqual(0);
  });

  it('re-focuses an existing app instead of opening a duplicate', () => {
    let s = openWin('w1', 'proxy');
    s = windowReducer(s, { type: 'minimize', id: 'w1' });
    s = openWin('w2', 'proxy', s);
    expect(s).toHaveLength(1);
    expect(s[0].id).toBe('w1');
    expect(s[0].minimized).toBe(false);
  });

  it('minimize keeps the window; close removes it', () => {
    let s = openWin('w1');
    s = windowReducer(s, { type: 'minimize', id: 'w1' });
    expect(s).toHaveLength(1);
    expect(s[0].minimized).toBe(true);
    s = windowReducer(s, { type: 'close', id: 'w1' });
    expect(s).toHaveLength(0);
  });
  // @kliv-spec-derived — from user report: "apps stay shut after you close/minimize them"
  it('restores a minimized window when it is restored again (taskbar click)', () => {
    let s = openWin('w1');
    s = windowReducer(s, { type: 'minimize', id: 'w1' });
    expect(s[0].minimized).toBe(true);
    s = windowReducer(s, { type: 'restore', id: 'w1' });
    expect(s[0].minimized).toBe(false);
    expect(s[0].z).toBeGreaterThan(10);
  });

  // @kliv-spec-derived — focus alone must not un-minimize, or a window's own
  // press-to-focus handler would undo every minimize
  it('keeps a window minimized when it is merely focused', () => {
    let s = openWin('w1');
    s = windowReducer(s, { type: 'minimize', id: 'w1' });
    s = windowReducer(s, { type: 'focus', id: 'w1' });
    expect(s[0].minimized).toBe(true);
  });

  it('maximize fills the desktop and restore returns the previous rect', () => {
    let s = openWin('w1');
    const before = { ...s[0].rect };
    s = windowReducer(s, { type: 'toggleMaximize', id: 'w1', desktop: DESKTOP });
    expect(s[0].maximized).toBe(true);
    expect(s[0].rect).toEqual({ x: 0, y: 0, w: DESKTOP.w, h: DESKTOP.h });
    s = windowReducer(s, { type: 'toggleMaximize', id: 'w1', desktop: DESKTOP });
    expect(s[0].maximized).toBe(false);
    expect(s[0].rect).toEqual(before);
  });

  it('keeps at least part of a dragged window on screen', () => {
    let s = openWin('w1');
    s = windowReducer(s, { type: 'move', id: 'w1', x: -5000, y: -5000, desktop: DESKTOP });
    expect(s[0].rect.x).toBeGreaterThan(-s[0].rect.w);
    expect(s[0].rect.y).toBeGreaterThanOrEqual(0);
  });

  it('never shrinks below the minimum size', () => {
    let s = openWin('w1');
    s = windowReducer(s, {
      type: 'resize',
      id: 'w1',
      rect: { x: 50, y: 50, w: 10, h: 10 },
      desktop: DESKTOP,
    });
    expect(s[0].rect.w).toBeGreaterThanOrEqual(340);
    expect(s[0].rect.h).toBeGreaterThanOrEqual(260);
  });
});
