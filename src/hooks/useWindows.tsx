import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { windowReducer, TASKBAR_H } from '@/lib/os/windowReducer';
import type { OsWindow, Rect } from '@/lib/os/windowReducer';

interface WindowsApi {
  windows: OsWindow[];
  desktopSize: { w: number; h: number };
  mobile: boolean;
  openApp: (appId: string, title: string, w: number, h: number, initial?: unknown) => void;
  focusWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  toggleMaximize: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, rect: Rect) => void;
  /** Snap a window to a preset rect (Windows 11 snap layouts). */
  snapWindow: (id: string, rect: Rect) => void;
  unmaximizeToPointer: (id: string, pointerX: number, pointerY: number) => void;
  topWindowId: string | null;
}

const WindowsCtx = createContext<WindowsApi | null>(null);

export function WindowsProvider({ children }: { children: ReactNode }) {
  const [windows, dispatch] = useReducer(windowReducer, []);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    h: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const idRef = useRef(0);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const desktopSize = useMemo(
    () => ({ w: viewport.w, h: Math.max(240, viewport.h - TASKBAR_H) }),
    [viewport],
  );
  const mobile = viewport.w < 700;

  const openApp = useCallback(
    (appId: string, title: string, w: number, h: number, initial?: unknown) => {
      idRef.current += 1;
      dispatch({
        type: 'open',
        id: `win-${idRef.current}`,
        appId,
        title,
        w,
        h,
        desktop: desktopSize,
        mobile,
        initial,
      });
    },
    [desktopSize, mobile],
  );

  const focusWindow = useCallback((id: string) => dispatch({ type: 'focus', id }), []);
  const closeWindow = useCallback((id: string) => dispatch({ type: 'close', id }), []);
  const minimizeWindow = useCallback((id: string) => dispatch({ type: 'minimize', id }), []);
  const restoreWindow = useCallback((id: string) => dispatch({ type: 'restore', id }), []);
  const toggleMaximize = useCallback(
    (id: string) => dispatch({ type: 'toggleMaximize', id, desktop: desktopSize }),
    [desktopSize],
  );
  const moveWindow = useCallback(
    (id: string, x: number, y: number) => dispatch({ type: 'move', id, x, y, desktop: desktopSize }),
    [desktopSize],
  );
  const resizeWindow = useCallback(
    (id: string, rect: Rect) => dispatch({ type: 'resize', id, rect, desktop: desktopSize }),
    [desktopSize],
  );

  const snapWindow = useCallback(
    (id: string, rect: Rect) => dispatch({ type: 'snap', id, rect, desktop: desktopSize }),
    [desktopSize],
  );
  const unmaximizeToPointer = useCallback(
    (id: string, pointerX: number, pointerY: number) =>
      dispatch({ type: 'unmaximizeToPointer', id, pointerX, pointerY, desktop: desktopSize }),
    [desktopSize],
  );

  const topWindowId = useMemo(() => {
    const visible = windows.filter((w) => !w.minimized);
    if (visible.length === 0) return null;
    return visible.reduce((a, b) => (a.z > b.z ? a : b)).id;
  }, [windows]);

  const api = useMemo<WindowsApi>(
    () => ({
      windows,
      desktopSize,
      mobile,
      openApp,
      focusWindow,
      closeWindow,
      minimizeWindow,
      restoreWindow,
      toggleMaximize,
      moveWindow,
      resizeWindow,
      snapWindow,
      unmaximizeToPointer,
      topWindowId,
    }),
    [
      windows,
      desktopSize,
      mobile,
      openApp,
      focusWindow,
      closeWindow,
      minimizeWindow,
      restoreWindow,
      toggleMaximize,
      moveWindow,
      resizeWindow,
      snapWindow,
      unmaximizeToPointer,
      topWindowId,
    ],
  );

  return <WindowsCtx.Provider value={api}>{children}</WindowsCtx.Provider>;
}

export function useWindows(): WindowsApi {
  const ctx = useContext(WindowsCtx);
  if (!ctx) throw new Error('useWindows must be used within WindowsProvider');
  return ctx;
}
