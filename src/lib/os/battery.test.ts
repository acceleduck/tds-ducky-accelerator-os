import { describe, it, expect } from 'vitest';
import { batteryColor, batteryLabel, batteryPercent, batteryVariant } from './battery';

// @kliv-spec-derived — from user intent: "if you're on a laptop make it show charge" —
// the tray must show a correct percentage and a charging/level icon that matches it.
describe('battery tray', () => {
  it('converts device level to whole percents and clamps garbage values', () => {
    expect(batteryPercent(0.62)).toBe(62);
    expect(batteryPercent(1)).toBe(100);
    expect(batteryPercent(0)).toBe(0);
    expect(batteryPercent(1.7)).toBe(100);
    expect(batteryPercent(-3)).toBe(0);
  });

  it('prefers the charging state whatever the level', () => {
    expect(batteryVariant(5, true)).toBe('charging');
    expect(batteryVariant(100, true)).toBe('charging');
  });

  it('steps the icon down with the charge', () => {
    expect(batteryVariant(95, false)).toBe('full');
    expect(batteryVariant(62, false)).toBe('medium');
    expect(batteryVariant(18, false)).toBe('low');
  });

  it('flags low and critical charge in warm and red tints', () => {
    expect(batteryColor(10, false)).toBe('#ff6b6b');
    expect(batteryColor(25, false)).toBe('#ffb84d');
    expect(batteryColor(70, false)).toBe('rgba(255,255,255,0.8)');
    expect(batteryColor(70, true)).toBe('#3ddc97');
  });

  it('labels the tooltip with percent and charging', () => {
    expect(batteryLabel(62, true)).toBe('62% · charging');
    expect(batteryLabel(9, false)).toBe('9%');
  });
});
