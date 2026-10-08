import { useEffect, useState } from 'react';
import type { BatteryState } from '@/lib/os/battery';

interface BatteryManagerLike {
  level: number;
  charging: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>;
};

/**
 * Live device battery for laptops and Chromebooks. Returns null until the
 * browser reports one (and forever, on browsers without battery support —
 * the tray then simply hides the indicator).
 */
export function useBattery(): BatteryState | null {
  const [state, setState] = useState<BatteryState | null>(null);

  useEffect(() => {
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== 'function') return;

    let alive = true;
    let bat: BatteryManagerLike | null = null;
    const update = () => {
      if (alive && bat) setState({ level: bat.level, charging: bat.charging });
    };

    nav
      .getBattery()
      .then((b) => {
        if (!alive) return;
        bat = b;
        update();
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
      })
      .catch(() => {
        // permission or hardware hiccup — leave the indicator hidden
      });

    return () => {
      alive = false;
      if (bat) {
        bat.removeEventListener('levelchange', update);
        bat.removeEventListener('chargingchange', update);
      }
    };
  }, []);

  return state;
}
