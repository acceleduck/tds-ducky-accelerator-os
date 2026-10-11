import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as RMouseEvent, PointerEvent as RPointerEvent, ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ExternalLink,
  LayoutGrid,
  Link2,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWindows } from '@/hooks/useWindows';
import { useSettings, wallpaperStyle } from '@/hooks/useSettings';
import { useDesktopItems } from '@/hooks/useDesktopItems';
import { TASKBAR_H } from '@/lib/os/windowReducer';
import {
  clampPos,
  defaultPos,
  hostOfLink,
  LINK_EMOJI,
  linkKeyFor,
  linkLabel,
  nextFreePos,
  rowsPerColumn,
  validateLinkInput,
} from '@/lib/os/desktop';
import type { Bounds, DesktopItem, Point } from '@/lib/os/desktop';
import { normalizeUrl, classifyUrl } from '@/lib/os/browser';
import { OS_APPS, getApp } from './os-registry';
import type { OsApp } from './os-registry';
import { WindowFrame } from './WindowFrame';
import { Taskbar } from './Taskbar';
import { StartMenu } from './StartMenu';
import { DuckLogo } from './DuckLogo';

type ShutdownPhase = 'off' | 'shutting' | 'safe' | 'restarting';

type IconEntry =
  | { kind: 'app'; key: string; app: OsApp; pos: Point }
  | { kind: 'link'; key: string; link: DesktopItem; pos: Point };

interface MenuState {
  x: number;
  y: number;
}

export function Desktop({ onLock, onSignOut }: { onLock: () => void; onSignOut: () => void }) {
  const { settings } = useSettings();
  const customStyle = settings.wallpaper === 'custom' ? wallpaperStyle(settings) : null;
  const { windows, openApp, topWindowId } = useWindows();
  const { items, byKey, savePosition, addLink, removeItem, tidyAll } = useDesktopItems();
  const [startOpen, setStartOpen] = useState(false);
  const [shutdown, setShutdown] = useState<ShutdownPhase>('off');
  const timersRef = useRef<number[]>([]);

  const layerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Bounds>({ w: 1280, h: 720 });
  const [deskMenu, setDeskMenu] = useState<MenuState | null>(null);
  const [iconMenu, setIconMenu] = useState<{ pos: MenuState; link: DesktopItem } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const read = () => setBounds({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const open = (app: OsApp) => openApp(app.id, app.name, app.size.w, app.size.h);

  /** Custom links ride the Scramjet tunnel; YouTube falls back to its player. */
  const openLink = (link: DesktopItem) => {
    const url = normalizeUrl(link.url ?? '');
    const cls = classifyUrl(url);
    let start: Record<string, unknown>;
    if (cls.kind === 'youtube' && cls.videoId) {
      start = { kind: 'ytwatch', videoId: cls.videoId };
    } else if (cls.kind === 'youtube') {
      start = { kind: 'yt', q: cls.searchQuery ?? '' };
    } else if (cls.kind === 'chatgpt') {
      start = { kind: 'chatgpt' };
    } else {
      start = { kind: 'web', url };
    }
    openApp('browser', link.label, 1000, 700, { start });
  };

  // Resolve every icon's spot: saved position, or its default grid cell.
  const rows = rowsPerColumn(bounds.h);
  const entries: IconEntry[] = [];
  const taken: Point[] = [];
  OS_APPS.filter((a) => !a.hidden).forEach((app, i) => {
    const saved = byKey.get(`app:${app.id}`);
    const pos = saved ? { x: saved.x, y: saved.y } : defaultPos(i, rows);
    entries.push({ kind: 'app', key: `app:${app.id}`, app, pos });
    taken.push(pos);
  });
  [...items]
    .filter((i) => i.url)
    .sort((a, b) => a.rowId - b.rowId)
    .forEach((link) => {
      const saved = byKey.get(link.key);
      const pos = saved ? { x: saved.x, y: saved.y } : nextFreePos(taken, bounds);
      entries.push({ kind: 'link', key: link.key, link, pos });
      taken.push(pos);
    });

  const addTilePos = nextFreePos(taken, bounds);

  const onIconMove = (entry: IconEntry, pos: Point) => {
    if (entry.kind === 'app') {
      void savePosition(
        { key: entry.key, label: entry.app.name, url: null, emoji: null, x: pos.x, y: pos.y },
        pos,
      );
    } else {
      void savePosition(
        { key: entry.key, label: entry.link.label, url: entry.link.url, emoji: entry.link.emoji, x: pos.x, y: pos.y },
        pos,
      );
    }
  };

  const tidy = () => {
    void tidyAll(
      entries.map((e) => e.key),
      (index) => defaultPos(index, rows),
    );
    toast.success('Icons tidied onto the grid');
  };

  const layerPoint = (clientX: number, clientY: number): MenuState => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: Math.min(Math.max(0, clientX - rect.left), Math.max(0, rect.width - 190)),
      y: Math.min(Math.max(0, clientY - rect.top), Math.max(0, rect.height - 120)),
    };
  };

  const shutDown = () => {
    setStartOpen(false);
    setShutdown('shutting');
    timersRef.current.push(
      window.setTimeout(() => {
        // Ask the browser to close this tab. Some browsers only allow this for
        // script-opened tabs; if it refuses we fall through to the safe screen.
        try {
          window.open('', '_self');
          window.close();
        } catch {
          // ignored — handled by the fallback screen
        }
        timersRef.current.push(
          window.setTimeout(() => setShutdown('safe'), 450),
        );
      }, 2400),
    );
  };

  const restart = () => {
    setStartOpen(false);
    setShutdown('restarting');
    timersRef.current.push(
      window.setTimeout(() => {
        // Drop the "already booted" flag so the boot animation plays again.
        try {
          sessionStorage.removeItem('ados:booted');
        } catch {
          // private mode — a reload still restarts cleanly
        }
        window.location.reload();
      }, 2200),
    );
  };

  return (
    <div
      className={`os-root ${customStyle ? '' : `wall-${settings.wallpaper}`} relative h-[100dvh] w-screen overflow-hidden`}
      style={customStyle ?? undefined}
    >
      {/* watermark duck + copyright */}
      <div className="pointer-events-none absolute -bottom-16 -right-10 select-none opacity-[0.05]">
        <DuckLogo size={430} />
      </div>
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap text-[42px] font-black uppercase tracking-[0.35em] text-white/[0.03]">
          © Ducky Labs · AcceleDuck OS
        </div>
      </div>
      <div
        className="pointer-events-none absolute left-3 z-0 select-none text-[10px] tracking-wide text-white/25"
        style={{ bottom: TASKBAR_H + 8 }}
      >
        © 2026 Ducky Labs · AcceleDuck OS — all rights reserved
      </div>

      {/* desktop icons — movable, plus custom proxy shortcuts */}
      <div
        ref={layerRef}
        className="absolute inset-x-0 top-0 touch-none"
        style={{ bottom: TASKBAR_H }}
        onContextMenu={(e) => {
          e.preventDefault();
          setIconMenu(null);
          setDeskMenu(layerPoint(e.clientX, e.clientY));
        }}
      >
        {entries.map((entry) => (
          <DesktopIcon
            key={entry.key}
            entry={entry}
            bounds={bounds}
            onOpen={() => (entry.kind === 'app' ? open(entry.app) : openLink(entry.link))}
            onMove={(pos) => onIconMove(entry, pos)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDeskMenu(null);
              if (entry.kind === 'link') setIconMenu({ pos: layerPoint(e.clientX, e.clientY), link: entry.link });
            }}
          />
        ))}

        <AddAppTile pos={addTilePos} onClick={() => setAddOpen(true)} />

        {deskMenu && (
          <DeskMenu
            x={deskMenu.x}
            y={deskMenu.y}
            onClose={() => setDeskMenu(null)}
            items={[
              {
                label: 'Add app or link…',
                icon: <Plus size={13} />,
                onClick: () => setAddOpen(true),
              },
              {
                label: 'Tidy up icons',
                icon: <LayoutGrid size={13} />,
                onClick: tidy,
              },
            ]}
          />
        )}

        {iconMenu && (
          <DeskMenu
            x={iconMenu.pos.x}
            y={iconMenu.pos.y}
            onClose={() => setIconMenu(null)}
            items={[
              {
                label: 'Open through tunnel',
                icon: <Zap size={13} />,
                onClick: () => openLink(iconMenu.link),
              },
              {
                label: 'Open in new tab',
                icon: <ExternalLink size={13} />,
                onClick: () => {
                  const url = normalizeUrl(iconMenu.link.url ?? '');
                  if (url) window.open(url, '_blank', 'noreferrer,noopener');
                },
              },
              {
                label: 'Remove from desktop',
                icon: <Trash2 size={13} />,
                danger: true,
                onClick: () => void removeItem(iconMenu.link.key),
              },
            ]}
          />
        )}
      </div>

      {/* windows — pointer-events-none so the layer itself never blocks desktop icons */}
      <div className="pointer-events-none absolute inset-x-0 top-0" style={{ bottom: TASKBAR_H }}>
        {windows.map((win) => {
          const app = getApp(win.appId);
          if (!app) return null;
          const AppBody = app.Component;
          return (
            <WindowFrame key={win.id} win={win} app={app} active={win.id === topWindowId}>
              <AppBody windowId={win.id} />
            </WindowFrame>
          );
        })}
      </div>

      {/* start menu */}
      {startOpen && (
        <>
          <div className="absolute inset-0 z-40" onPointerDown={() => setStartOpen(false)} />
          <StartMenu
            onOpenApp={(app) => {
              setStartOpen(false);
              open(app);
            }}
            onLock={() => {
              setStartOpen(false);
              onLock();
            }}
            onSignOut={() => {
              setStartOpen(false);
              onSignOut();
            }}
            onShutdown={shutDown}
            onRestart={restart}
          />
        </>
      )}

      <Taskbar startOpen={startOpen} onToggleStart={() => setStartOpen((o) => !o)} />

      <AddAppDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        taken={taken}
        bounds={bounds}
        existingUrls={items.filter((i) => i.url).map((i) => i.url as string)}
        onAdd={(label, url, emoji, pos) => {
          void addLink({ key: linkKeyFor(url), label, url, emoji, x: pos.x, y: pos.y });
        }}
      />

      {/* shutdown experience */}
      {shutdown !== 'off' && (
        <div
          className={`fixed inset-0 z-[200] flex flex-col items-center justify-center gap-9 transition-opacity duration-700 ${
            shutdown === 'safe' ? 'bg-black' : 'bg-[#0a0e1c]'
          }`}
        >
          {shutdown === 'safe' ? (
            <>
              <div className="opacity-30">
                <DuckLogo size={72} />
              </div>
              <div className="text-center">
                <div className="text-lg text-white/70">It&apos;s now safe to close this tab.</div>
                <div className="mt-1 text-xs text-white/30">
                  (Your browser kept the tab open — some only close tabs the page itself opened.)
                </div>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl border border-white/15 px-6 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
              >
                Power on
              </button>
            </>
          ) : (
            <>
              <div className="boot-pulse">
                <DuckLogo size={88} />
              </div>
              <div className="boot-spinner" />
              <div className="text-center">
                <div className="text-xl font-medium text-white/90">
                  {shutdown === 'restarting' ? 'Restarting…' : 'Shutting down…'}
                </div>
                <div className="mt-1.5 text-sm text-white/40">
                  {shutdown === 'restarting' ? 'The pond will be right back' : 'Saving your pond state'}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One draggable desktop icon. Drag to move (saved), click to open. */
function DesktopIcon({
  entry,
  bounds,
  onOpen,
  onMove,
  onContextMenu,
}: {
  entry: IconEntry;
  bounds: Bounds;
  onOpen: () => void;
  onMove: (pos: Point) => void;
  onContextMenu: (e: RMouseEvent) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [imgOk, setImgOk] = useState(true);

  const isLink = entry.kind === 'link';
  const label = entry.kind === 'app' ? entry.app.name : entry.link.label;
  const Icon = entry.kind === 'app' ? entry.app.icon : null;

  const onPointerDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { px: e.clientX, py: e.clientY, x: entry.pos.x, y: entry.pos.y, moved: false };
  };

  const onPointerMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.px;
    const dy = e.clientY - s.py;
    if (!s.moved && Math.hypot(dx, dy) < 5) return;
    s.moved = true;
    setDrag({ dx, dy });
  };

  const endDrag = (e: RPointerEvent<HTMLButtonElement>) => {
    const s = startRef.current;
    startRef.current = null;
    setDrag(null);
    if (!s) return;
    if (s.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 300);
      onMove(clampPos({ x: s.x + (e.clientX - s.px), y: s.y + (e.clientY - s.py) }, bounds));
    }
  };

  const host = isLink ? hostOfLink(entry.link.url ?? '') : '';

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        startRef.current = null;
        setDrag(null);
      }}
      onClick={() => {
        if (suppressClick.current) return;
        onOpen();
      }}
      onContextMenu={(e) => onContextMenu(e)}
      title={
        isLink
          ? `Open ${label} through the Scramjet tunnel`
          : `Open ${label} — drag to move`
      }
      aria-label={label}
      className={`os-hover absolute flex w-[84px] flex-col items-center gap-1.5 rounded-lg p-2 text-center hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-accent)] ${
        drag ? 'z-30 cursor-grabbing scale-105 bg-white/10 shadow-2xl ring-1 ring-white/20' : 'cursor-grab'
      }`}
      style={{
        left: entry.pos.x,
        top: entry.pos.y,
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
        transition: drag ? 'none' : 'transform 120ms ease, left 120ms ease, top 120ms ease',
      }}
    >
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl shadow-lg ${
          isLink ? 'bg-gradient-to-br from-cyan-500 to-blue-600' : entry.kind === 'app' ? entry.app.iconBg : ''
        }`}
      >
        {isLink ? (
          imgOk && host ? (
            <img
              src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
              alt=""
              aria-hidden
              className="h-6 w-6 rounded"
              onError={() => setImgOk(false)}
            />
          ) : (
            <span className="text-lg leading-none">{entry.link.emoji ?? '🔗'}</span>
          )
        ) : (
          Icon && <Icon size={21} className="text-white" />
        )}
        {isLink && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--os-accent)] text-[#17131f] shadow">
            <Zap size={9} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-[11px] leading-tight text-white/90 drop-shadow">{label}</span>
    </button>
  );
}

/** The dashed "+" tile that opens the Add-app dialog. */
function AddAppTile({ pos, onClick }: { pos: Point; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Add a custom link to your desktop"
      aria-label="Add app"
      className="os-hover absolute flex w-[84px] flex-col items-center gap-1.5 rounded-lg border border-dashed border-white/25 p-2 text-center hover:border-white/50 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-accent)]"
      style={{ left: pos.x, top: pos.y }}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
        <Plus size={20} className="text-white/80" />
      </span>
      <span className="flex items-center gap-1 text-[11px] leading-tight text-white/70">
        <Link2 size={10} /> Add app
      </span>
    </button>
  );
}

/** Small right-click menu. */
function DeskMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void }[];
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        className="absolute z-[71] min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-[#121628]/95 py-1 shadow-2xl backdrop-blur-xl"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition hover:bg-white/10 ${
              item.danger ? 'text-rose-300' : 'text-white/85'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** The Add-app dialog: name + address, opens through the Scramjet tunnel. */
function AddAppDialog({
  open,
  onOpenChange,
  taken,
  bounds,
  existingUrls,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taken: Point[];
  bounds: Bounds;
  existingUrls: string[];
  onAdd: (label: string, url: string, emoji: string, pos: Point) => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [emoji, setEmoji] = useState(LINK_EMOJI[0]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel('');
      setUrl('');
      setEmoji(LINK_EMOJI[0]);
      setErr(null);
    }
  }, [open]);

  const submit = () => {
    const problem = validateLinkInput(label, url);
    if (problem) {
      setErr(problem);
      return;
    }
    const normalized = normalizeUrl(url);
    if (existingUrls.includes(normalized)) {
      setErr('That link is already on your desktop');
      return;
    }
    const pos = nextFreePos(taken, bounds);
    onAdd(linkLabel(label, normalized), normalized, emoji, pos);
    onOpenChange(false);
    toast.success('Shortcut pinned — it opens through your Scramjet tunnel');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] border-white/10 bg-[#111527]/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Add an app to your desktop</DialogTitle>
          <DialogDescription>
            Paste any web address. It opens through your Scramjet tunnel, so it keeps working even
            where the site itself is blocked.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="desk-app-name">App name</Label>
            <Input
              id="desk-app-name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional — e.g. Duckpedia"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desk-app-url">Web address</Label>
            <Input
              id="desk-app-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="example.com"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {LINK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`Icon ${e}`}
                  aria-pressed={emoji === e}
                  onClick={() => setEmoji(e)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition ${
                    emoji === e
                      ? 'border-[var(--os-accent)] bg-white/15'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40">
              The site&apos;s own little icon is used when one is available.
            </p>
          </div>
          {err && <p className="text-[12px] text-rose-300">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/70">
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-[var(--os-accent)] font-semibold text-[#17131f] hover:brightness-110"
          >
            <Zap size={13} className="mr-1.5" />
            Add to desktop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
