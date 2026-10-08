import { describe, it, expect } from 'vitest';
import { windowReducer } from './windowReducer';

const openOn = (desktop: { w: number; h: number }) =>
  windowReducer([], {
    type: 'open',
    id: 'w1',
    appId: 'a',
    title: 'App',
    w: 600,
    h: 400,
    desktop,
    mobile: false,
  });

// @kliv-spec-derived — from user intent: "make it more windows 11 like" (snap layouts)
describe('window snap layouts', () => {
  const desk = { w: 1000, h: 500 };

  it('snaps a window to the left half of the desktop', () => {
    let s = openOn(desk);
    s = windowReducer(s, { type: 'snap', id: 'w1', rect: { x: 0, y: 0, w: 500, h: 500 }, desktop: desk });
    expect(s[0].rect).toEqual({ x: 0, y: 0, w: 500, h: 500 });
    expect(s[0].maximized).toBe(false);
  });

  it('snapping unmaximizes a maximized window', () => {
    let s = openOn(desk);
    s = windowReducer(s, { type: 'toggleMaximize', id: 'w1', desktop: desk });
    expect(s[0].maximized).toBe(true);
    s = windowReducer(s, { type: 'snap', id: 'w1', rect: { x: 500, y: 0, w: 500, h: 500 }, desktop: desk });
    expect(s[0].maximized).toBe(false);
    expect(s[0].rect.x).toBe(500);
  });

  it('keeps a snapped window inside the desktop', () => {
    let s = openOn(desk);
    s = windowReducer(s, { type: 'snap', id: 'w1', rect: { x: 900, y: 400, w: 400, h: 300 }, desktop: desk });
    expect(s[0].rect.x + s[0].rect.w).toBeLessThanOrEqual(desk.w);
    expect(s[0].rect.y + s[0].rect.h).toBeLessThanOrEqual(desk.h);
  });

  it('never snaps below the minimum window size', () => {
    let s = openOn(desk);
    s = windowReducer(s, { type: 'snap', id: 'w1', rect: { x: 0, y: 0, w: 100, h: 80 }, desktop: desk });
    expect(s[0].rect.w).toBeGreaterThanOrEqual(360);
    expect(s[0].rect.h).toBeGreaterThanOrEqual(260);
  });
});
