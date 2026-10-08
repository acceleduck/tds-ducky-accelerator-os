import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { useWindows } from '@/hooks/useWindows';
import { MIN_W, MIN_H } from '@/lib/os/windowReducer';
import type { OsWindow } from '@/lib/os/windowReducer';
import type { OsApp } from './os-registry';

interface DragState {
  dx: number;
  dy: number;
}
interface ResizeState {
  px: number;
  py: number;
  rect: { x: number; y: number; w: number; h: number };
  dir: string;
}

/** Windows 11 snap layouts: fractions of the desktop each region covers. */
interface SnapArea {
  key: string;
  fx: number;
  fy?: number;
  fw: number;
  fh?: number;
}
const SNAP_LAYOUTS: { label: string; cols: number; rows: number; areas: SnapArea[] }[] = [
  {
    label: 'Halves',
    cols: 2,
    rows: 1,
    areas: [
      { key: 'left half', fx: 0, fw: 0.5 },
      { key: 'right half', fx: 0.5, fw: 0.5 },
    ],
  },
  {
    label: 'Big + small',
    cols: 2,
    rows: 1,
    areas: [
      { key: 'large left', fx: 0, fw: 0.67 },
      { key: 'small right', fx: 0.67, fw: 0.33 },
    ],
  },
  {
    label: 'Quarters',
    cols: 2,
    rows: 2,
    areas: [
      { key: 'top left quarter', fx: 0, fy: 0, fw: 0.5, fh: 0.5 },
      { key: 'top right quarter', fx: 0.5, fy: 0, fw: 0.5, fh: 0.5 },
      { key: 'bottom left quarter', fx: 0, fy: 0.5, fw: 0.5, fh: 0.5 },
      { key: 'bottom right quarter', fx: 0.5, fy: 0.5, fw: 0.5, fh: 0.5 },
    ],
  },
  {
    label: 'Thirds',
    cols: 3,
    rows: 1,
    areas: [
      { key: 'left third', fx: 0, fw: 1 / 3 },
      { key: 'middle third', fx: 1 / 3, fw: 1 / 3 },
      { key: 'right third', fx: 2 / 3, fw: 1 / 3 },
    ],
  },
];

export function WindowFrame({
  win,
  app,
  active,
  children,
}: {
  win: OsWindow;
  app: OsApp;
  active: boolean;
  children: ReactNode;
}) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    toggleMaximize,
    moveWindow,
    resizeWindow,
    snapWindow,
    unmaximizeToPointer,
    desktopSize,
    mobile,
  } = useWindows();

  const [snapOpen, setSnapOpen] = useState(false);
  const snapTimerRef = useRef<number | null>(null);

  const AppIcon = app.icon;
  const dragRef = useRef<DragState | null>(null);
  const sizeRef = useRef<ResizeState | null>(null);

  const onTitlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    focusWindow(win.id);
    if (mobile) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (win.maximized) {
      // Mirror the reducer's math so the drag continues seamlessly.
      const w = win.prevRect?.w ?? Math.min(680, desktopSize.w - 40);
      const ratio = Math.min(0.9, Math.max(0.1, e.clientX / Math.max(1, desktopSize.w)));
      const newX = e.clientX - w * ratio;
      const newY = Math.max(0, e.clientY - 20);
      dragRef.current = { dx: e.clientX - newX, dy: e.clientY - newY };
      unmaximizeToPointer(win.id, e.clientX, e.clientY);
    } else {
      dragRef.current = { dx: e.clientX - win.rect.x, dy: e.clientY - win.rect.y };
    }
  };

  const onTitlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    moveWindow(win.id, e.clientX - d.dx, e.clientY - d.dy);
  };

  const onTitlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>, dir: string) => {
    if (e.button !== 0 || win.maximized || mobile) return;
    e.stopPropagation();
    focusWindow(win.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    sizeRef.current = { px: e.clientX, py: e.clientY, rect: { ...win.rect }, dir };
  };

  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sizeRef.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    let { x, y, w, h } = s.rect;
    if (s.dir.includes('e')) w = s.rect.w + dx;
    if (s.dir.includes('s')) h = s.rect.h + dy;
    if (s.dir.includes('w')) {
      w = s.rect.w - dx;
      x = s.rect.x + dx;
    }
    if (s.dir.includes('n')) {
      h = s.rect.h - dy;
      y = s.rect.y + dy;
    }
    if (w < MIN_W) {
      if (s.dir.includes('w')) x = s.rect.x + s.rect.w - MIN_W;
      w = MIN_W;
    }
    if (h < MIN_H) {
      if (s.dir.includes('n')) y = s.rect.y + s.rect.h - MIN_H;
      h = MIN_H;
    }
    resizeWindow(win.id, { x, y, w, h });
  };

  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    sizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer already released
    }
  };

  const handles: { dir: string; className: string }[] = [
    { dir: 'n', className: 'left-2 right-2 top-0 h-1.5 cursor-n-resize' },
    { dir: 's', className: 'left-2 right-2 bottom-0 h-1.5 cursor-s-resize' },
    { dir: 'e', className: 'bottom-2 right-0 top-2 w-1.5 cursor-e-resize' },
    { dir: 'w', className: 'bottom-2 left-0 top-2 w-1.5 cursor-w-resize' },
    { dir: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
    { dir: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
    { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
    { dir: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  ];

  return (
    <div
      onPointerDown={() => focusWindow(win.id)}
      style={{
        left: win.rect.x,
        top: win.rect.y,
        width: win.rect.w,
        height: win.rect.h,
        zIndex: win.z,
      }}
      className={`win-anim win-open-anim pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border shadow-2xl shadow-black/60 ${
        active ? 'border-white/25' : 'border-white/10'
      } ${win.minimized ? 'win-hidden' : ''}`}
      aria-label={`${win.title} window`}
    >
      {/* title bar */}
      <div
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
        onDoubleClick={() => !mobile && toggleMaximize(win.id)}
        className={`flex h-10 shrink-0 select-none items-center gap-2 border-b border-white/[0.07] px-3 ${
          active ? 'bg-white/[0.07]' : 'bg-white/[0.03]'
        }`}
      >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${app.iconBg}`}>
          <AppIcon size={13} className="text-white" />
        </span>
        <span className="truncate text-xs font-medium text-white/85">{win.title}</span>
        <div className="ml-auto flex items-center" data-no-drag>
          <button
            aria-label="Minimize"
            onClick={() => minimizeWindow(win.id)}
            className="flex h-10 w-10 items-center justify-center text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <Minus size={14} />
          </button>
          {!mobile && (
            <div
              className="relative"
              data-no-drag
              onMouseEnter={() => {
                if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
                snapTimerRef.current = window.setTimeout(() => setSnapOpen(true), 320);
              }}
              onMouseLeave={() => {
                if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
                setSnapOpen(false);
              }}
            >
              <button
                aria-label={win.maximized ? 'Restore' : 'Maximize'}
                onClick={() => toggleMaximize(win.id)}
                className="flex h-10 w-10 items-center justify-center text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <Square size={11} />
              </button>
              {snapOpen && (
                <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/10 bg-[#151930] p-3 shadow-2xl shadow-black/60">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Snap layouts
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {SNAP_LAYOUTS.map((layout) => (
                      <div
                        key={layout.label}
                        title={layout.label}
                        aria-label={layout.label}
                        data-testid="snap-layout"
                        className="grid gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-1"
                        style={{
                          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                          height: layout.rows > 1 ? '3.4rem' : '1.7rem',
                        }}
                      >
                        {layout.areas.map((a) => (
                          <button
                            key={a.key}
                            aria-label={`Snap ${a.key}`}
                            title={`Snap ${a.key}`}
                            onClick={() => {
                              setSnapOpen(false);
                              snapWindow(win.id, {
                                x: Math.round(desktopSize.w * a.fx),
                                y: Math.round(desktopSize.h * (a.fy ?? 0)),
                                w: Math.round(desktopSize.w * a.fw),
                                h: Math.round(desktopSize.h * (a.fh ?? 1)),
                              });
                            }}
                            className="rounded-[4px] bg-white/15 transition hover:bg-[var(--os-accent)]"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            aria-label="Close"
            onClick={() => closeWindow(win.id)}
            className="flex h-10 w-10 items-center justify-center text-white/60 transition hover:bg-red-600 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* content */}
      <div className="relative min-h-0 flex-1 bg-[#12162a]">{children}</div>

      {/* resize handles */}
      {!win.maximized &&
        !mobile &&
        handles.map((h) => (
          <div
            key={h.dir}
            onPointerDown={(e) => startResize(e, h.dir)}
            onPointerMove={onResizeMove}
            onPointerUp={endResize}
            className={`absolute z-10 ${h.className}`}
          />
        ))}
    </div>
  );
}
