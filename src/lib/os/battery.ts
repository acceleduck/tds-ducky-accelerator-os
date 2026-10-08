export interface BatteryState {
  /** 0..1 as reported by the device. */
  level: number;
  charging: boolean;
}

/** Device level (0..1) → whole percent, clamped to 0..100. */
export function batteryPercent(level: number): number {
  return Math.max(0, Math.min(100, Math.round(level * 100)));
}

export type BatteryVariant = 'charging' | 'full' | 'medium' | 'low';

/** Which icon and color the tray should show for a given charge. */
export function batteryVariant(pct: number, charging: boolean): BatteryVariant {
  if (charging) return 'charging';
  if (pct >= 80) return 'full';
  if (pct >= 40) return 'medium';
  return 'low';
}

/** Color for the icon — critical charge gets a warning tint. */
export function batteryColor(pct: number, charging: boolean): string {
  if (charging) return '#3ddc97';
  if (pct < 15) return '#ff6b6b';
  if (pct < 30) return '#ffb84d';
  return 'rgba(255,255,255,0.8)';
}

/** Tooltip text, e.g. "62% · charging". */
export function batteryLabel(pct: number, charging: boolean): string {
  return `${pct}%${charging ? ' · charging' : ''}`;
}
