export const TASKBAR_H = 48;
export const MIN_W = 360;
export const MIN_H = 260;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OsWindow {
  id: string;
  appId: string;
  title: string;
  rect: Rect;
  prevRect: Rect | null;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Optional launch payload — e.g. the page a browser window should open on. */
  initial?: unknown;
}

export interface DesktopSize {
  w: number;
  h: number;
}

export type WindowAction =
  | { type: 'open'; id: string; appId: string; title: string; w: number; h: number; desktop: DesktopSize; mobile: boolean; initial?: unknown }
  | { type: 'focus'; id: string }
  | { type: 'close'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'toggleMaximize'; id: string; desktop: DesktopSize }
  | { type: 'move'; id: string; x: number; y: number; desktop: DesktopSize }
  | { type: 'resize'; id: string; rect: Rect; desktop: DesktopSize }
  | { type: 'snap'; id: string; rect: Rect; desktop: DesktopSize }
  | { type: 'unmaximizeToPointer'; id: string; pointerX: number; pointerY: number; desktop: DesktopSize };

function topZ(windows: OsWindow[]): number {
  return windows.reduce((m, w) => Math.max(m, w.z), 10);
}

/** Keep a window at least partly visible inside the desktop area. */
export function clampRect(rect: Rect, d: DesktopSize): Rect {
  const maxW = Math.max(MIN_W, d.w);
  const maxH = Math.max(MIN_H, d.h);
  const w = Math.round(Math.min(Math.max(rect.w, MIN_W), maxW));
  const h = Math.round(Math.min(Math.max(rect.h, MIN_H), maxH));
  const minX = 96 - w; // at least 96px of the window stays on screen
  const maxX = Math.max(minX, d.w - 96);
  const x = Math.round(Math.min(Math.max(rect.x, minX), maxX));
  const y = Math.round(Math.min(Math.max(rect.y, 0), Math.max(0, d.h - 48)));
  return { x, y, w, h };
}

function fullRect(d: DesktopSize): Rect {
  return { x: 0, y: 0, w: d.w, h: d.h };
}

export function windowReducer(state: OsWindow[], action: WindowAction): OsWindow[] {
  switch (action.type) {
    case 'open': {
      const existing = state.find((w) => w.appId === action.appId);
      if (existing) {
        return state.map((w) =>
          w.id === existing.id ? { ...w, minimized: false, z: topZ(state) + 1 } : w,
        );
      }
      const z = topZ(state) + 1;
      const count = state.length;
      const normal = clampRect(
        { x: 64 + (count % 6) * 34, y: 40 + (count % 6) * 28, w: action.w, h: action.h },
        action.desktop,
      );
      const maximized =
        action.mobile || normal.w >= action.desktop.w - 12 || normal.h >= action.desktop.h - 12;
      return [
        ...state,
        {
          id: action.id,
          appId: action.appId,
          title: action.title,
          rect: maximized ? fullRect(action.desktop) : normal,
          prevRect: maximized ? normal : null,
          z,
          minimized: false,
          maximized,
          initial: action.initial,
        },
      ];
    }
    case 'focus':
      return state.map((w) => (w.id === action.id ? { ...w, z: topZ(state) + 1 } : w));
    case 'restore':
      return state.map((w) =>
        w.id === action.id ? { ...w, z: topZ(state) + 1, minimized: false } : w,
      );
    case 'close':
      return state.filter((w) => w.id !== action.id);
    case 'minimize':
      return state.map((w) => (w.id === action.id ? { ...w, minimized: true } : w));
    case 'toggleMaximize':
      return state.map((w) => {
        if (w.id !== action.id) return w;
        if (w.maximized) {
          const restore = w.prevRect ?? clampRect(
            { x: action.desktop.w / 2 - 340, y: 40, w: 680, h: 460 },
            action.desktop,
          );
          return { ...w, maximized: false, rect: restore, prevRect: null, z: topZ(state) + 1 };
        }
        return { ...w, maximized: true, prevRect: w.rect, rect: fullRect(action.desktop), z: topZ(state) + 1 };
      });
    case 'move':
      return state.map((w) =>
        w.id === action.id
          ? { ...w, rect: clampRect({ ...w.rect, x: action.x, y: action.y }, action.desktop) }
          : w,
      );
    case 'resize':
      return state.map((w) =>
        w.id === action.id ? { ...w, rect: clampRect(action.rect, action.desktop) } : w,
      );
    case 'snap': {
      // Windows 11 snap layouts: place the window on an exact rect, unmaximized.
      const w = Math.max(MIN_W, Math.min(action.rect.w, action.desktop.w));
      const h = Math.max(MIN_H, Math.min(action.rect.h, action.desktop.h));
      return state.map((win) =>
        win.id === action.id
          ? {
              ...win,
              rect: {
                x: Math.max(0, Math.min(action.rect.x, Math.max(0, action.desktop.w - w))),
                y: Math.max(0, Math.min(action.rect.y, Math.max(0, action.desktop.h - h))),
                w,
                h,
              },
              prevRect: null,
              maximized: false,
            }
          : win,
      );
    }
    case 'unmaximizeToPointer': {
      const win = state.find((w) => w.id === action.id);
      if (!win) return state;
      const w = win.prevRect?.w ?? Math.min(680, action.desktop.w - 40);
      const h = win.prevRect?.h ?? 460;
      const ratio = Math.min(0.9, Math.max(0.1, action.pointerX / Math.max(1, action.desktop.w)));
      const rect = clampRect(
        { x: action.pointerX - w * ratio, y: Math.max(0, action.pointerY - 20), w, h },
        action.desktop,
      );
      return state.map((x) =>
        x.id === action.id ? { ...x, maximized: false, prevRect: null, rect, z: topZ(state) + 1 } : x,
      );
    }
    default:
      return state;
  }
}
