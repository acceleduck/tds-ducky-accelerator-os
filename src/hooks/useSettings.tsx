import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { DEFAULT_WISP_ENDPOINT } from '@/lib/os/servers';
import { DEFAULT_RINGTONE } from '@/lib/os/ringtone';

export type WallpaperFit = 'cover' | 'contain' | 'tile';

export interface OsSettings {
  accent: string;
  wallpaper: string;
  customWallpaper: string;
  wallpaperFit: WallpaperFit;
  proxyEndpoint: string;
  callRingtone: string;
}

export const ACCENTS = [
  { id: 'ddg', name: 'DuckDuckGo Orange', hex: '#de5833' },
  { id: 'duck', name: 'Ducky Yellow', hex: '#f5c518' },
  { id: 'pond', name: 'Pond Blue', hex: '#4cc2ff' },
  { id: 'grape', name: 'Grape Purple', hex: '#b18aff' },
  { id: 'mint', name: 'Mint', hex: '#3ddc97' },
  { id: 'flamingo', name: 'Flamingo', hex: '#ff7eb6' },
];

export const WALLPAPERS = [
  { id: 'bloom', name: 'Duck Bloom' },
  { id: 'midnight', name: 'Midnight Pond' },
  { id: 'dusk', name: 'Pond at Dusk' },
  { id: 'tide', name: 'Deep Tide' },
];

export const WALLPAPER_FITS: { id: WallpaperFit; name: string }[] = [
  { id: 'cover', name: 'Fill' },
  { id: 'contain', name: 'Fit' },
  { id: 'tile', name: 'Tile' },
];

const DEFAULTS: OsSettings = { accent: 'ddg', wallpaper: 'bloom', customWallpaper: '', wallpaperFit: 'cover', proxyEndpoint: DEFAULT_WISP_ENDPOINT, callRingtone: DEFAULT_RINGTONE };

/** Inline style for a user-chosen custom background, or null when a preset is active. */
export function wallpaperStyle(s: OsSettings): CSSProperties | null {
  if (s.wallpaper !== 'custom' || !s.customWallpaper) return null;
  const tile = s.wallpaperFit === 'tile';
  return {
    backgroundImage: `url("${s.customWallpaper}")`,
    backgroundSize: tile ? 'auto' : s.wallpaperFit,
    backgroundRepeat: tile ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
  };
}

interface SettingsApi {
  settings: OsSettings;
  accentHex: string;
  ready: boolean;
  update: (patch: Partial<OsSettings>) => void;
}

const SettingsCtx = createContext<SettingsApi | null>(null);

interface SettingsRow {
  _row_id: number;
  accent: string;
  wallpaper: string;
  custom_wallpaper?: string | null;
  wallpaper_fit?: string | null;
  proxy_endpoint?: string | null;
  call_ringtone?: string | null;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<OsSettings>(DEFAULTS);
  const [rowId, setRowId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const fromRow = (r: SettingsRow): OsSettings => ({
    accent: r.accent ?? DEFAULTS.accent,
    wallpaper: r.wallpaper ?? DEFAULTS.wallpaper,
    customWallpaper: r.custom_wallpaper ?? '',
    wallpaperFit:
      r.wallpaper_fit === 'contain' || r.wallpaper_fit === 'tile' ? r.wallpaper_fit : 'cover',
    proxyEndpoint: r.proxy_endpoint?.trim() || DEFAULTS.proxyEndpoint,
    callRingtone: r.call_ringtone?.trim() || DEFAULTS.callRingtone,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await db.query<SettingsRow>('user_settings', { limit: '1' });
        if (!alive) return;
        if (rows.length > 0) {
          setRowId(rows[0]._row_id);
          setSettings(fromRow(rows[0]));
        } else {
          const row = await db.insertOne<{ _row_id: number }>('user_settings', {
            accent: DEFAULTS.accent,
            wallpaper: DEFAULTS.wallpaper,
            custom_wallpaper: DEFAULTS.customWallpaper,
            wallpaper_fit: DEFAULTS.wallpaperFit,
            proxy_endpoint: DEFAULTS.proxyEndpoint,
            call_ringtone: DEFAULTS.callRingtone,
          });
          if (!alive) return;
          setRowId(row._row_id);
        }
      } catch {
        // anonymous or offline: keep defaults
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const accentHex = useMemo(
    () => ACCENTS.find((a) => a.id === settings.accent)?.hex ?? ACCENTS[0].hex,
    [settings.accent],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--os-accent', accentHex);
    root.style.setProperty('--os-accent-soft', `${accentHex}29`);
  }, [accentHex]);

  const update = useCallback(
    (patch: Partial<OsSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (rowId != null) {
          db.update(
            'user_settings',
            { _row_id: `eq.${rowId}` },
            {
              accent: next.accent,
              wallpaper: next.wallpaper,
              custom_wallpaper: next.customWallpaper,
              wallpaper_fit: next.wallpaperFit,
              proxy_endpoint: next.proxyEndpoint,
              call_ringtone: next.callRingtone,
            },
          ).catch(() => {});
        }
        return next;
      });
    },
    [rowId],
  );

  const api = useMemo<SettingsApi>(
    () => ({ settings, accentHex, ready, update }),
    [settings, accentHex, ready, update],
  );

  return <SettingsCtx.Provider value={api}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
