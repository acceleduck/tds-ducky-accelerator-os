import { useEffect, useState } from 'react';
import { BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, ShieldCheck, Volume2, Wifi } from 'lucide-react';
import { useWindows } from '@/hooks/useWindows';
import { useProxySession } from '@/hooks/useProxySession';
import { useBattery } from '@/hooks/useBattery';
import { useSettings, ACCENTS } from '@/hooks/useSettings';
import { batteryColor, batteryLabel, batteryPercent, batteryVariant } from '@/lib/os/battery';
import { getApp } from './os-registry';
import type { OsApp } from './os-registry';
import { DuckLogo } from './DuckLogo';

const PINNED = ['proxy', 'chat', 'search', 'arcade', 'speed', 'terminal', 'files'];

export function Taskbar({ startOpen, onToggleStart }: { startOpen: boolean; onToggleStart: () => void }) {
  const { windows, openApp, focusWindow, minimizeWindow, restoreWindow, topWindowId } = useWindows();
  const { status, server } = useProxySession();
  const battery = useBattery();
  const { settings, update } = useSettings();
  const [qsOpen, setQsOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  const batteryPct = battery ? batteryPercent(battery.level) : 0;
  const batteryText = batteryLabel(batteryPct, battery?.charging ?? false);
  const batteryTint = batteryColor(batteryPct, battery?.charging ?? false);
  const BatteryIcon = !battery
    ? null
    : battery.charging || batteryVariant(batteryPct, false) === 'charging'
      ? BatteryCharging
      : batteryVariant(batteryPct, false) === 'full'
        ? BatteryFull
        : batteryVariant(batteryPct, false) === 'medium'
          ? BatteryMedium
          : BatteryLow;

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pinned = PINNED.map(getApp).filter((a): a is OsApp => Boolean(a));
  const openIds = [...new Set(windows.map((w) => w.appId))];
  const extra = openIds.filter((id) => !PINNED.includes(id)).map(getApp).filter((a): a is OsApp => Boolean(a));
  const connected = status === 'connected';

  const launch = (app: OsApp) => {
    const win = windows.find((w) => w.appId === app.id);
    if (!win) openApp(app.id, app.name, app.size.w, app.size.h);
    else if (win.minimized) restoreWindow(win.id);
    else if (win.id === topWindowId) minimizeWindow(win.id);
    else focusWindow(win.id);
  };

  const TaskButton = ({ app }: { app: OsApp }) => {
    const Icon = app.icon;
    const win = windows.find((w) => w.appId === app.id);
    const isTop = win != null && win.id === topWindowId && !win.minimized;
    return (
      <button
        aria-label={app.name}
        title={app.name}
        onClick={() => launch(app)}
        className="relative flex h-10 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${app.iconBg}`}>
          <Icon size={15} className="text-white" />
        </span>
        {win && (
          <span
            className={`absolute bottom-0.5 h-[3px] rounded-full bg-[var(--os-accent)] transition-all ${
              isTop ? 'w-4' : 'w-1.5 opacity-70'
            }`}
          />
        )}
      </button>
    );
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 flex h-12 items-stretch border-t border-white/10 bg-[#0d1120]/75 backdrop-blur-2xl">
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <button
          aria-label="Start"
          title="Start"
          onClick={onToggleStart}
          className={`flex h-10 w-11 items-center justify-center rounded-lg transition hover:bg-white/10 ${
            startOpen ? 'bg-white/15' : ''
          }`}
        >
          <DuckLogo size={22} />
        </button>
        {pinned.map((app) => (
          <TaskButton key={app.id} app={app} />
        ))}
        {extra.map((app) => (
          <TaskButton key={app.id} app={app} />
        ))}
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 pr-2">
        <button
          aria-label="Proxy status"
          title={connected ? `Protected · ${server?.name ?? ''}` : 'Unprotected'}
          onClick={() => launch(getApp('proxy')!)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-white/80 transition hover:bg-white/10"
        >
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-white/30'}`} />
          <ShieldCheck size={15} className={connected ? 'text-emerald-400' : 'text-white/45'} />
        </button>
        <div className="relative">
          <button
            aria-label="Quick settings"
            title="Quick settings — accent, proxy, files"
            onClick={() => setQsOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-white/45 transition hover:bg-white/10 hover:text-white/70"
          >
            <Wifi size={15} />
            <Volume2 size={15} />
          </button>
          {qsOpen && (
            <div className="absolute bottom-12 right-0 z-50 w-72 rounded-2xl border border-white/10 bg-[#151930]/95 p-3.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Quick settings
              </div>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    aria-label={`Accent ${a.name}`}
                    title={a.name}
                    onClick={() => void update({ accent: a.id })}
                    className={`h-7 w-7 rounded-full transition ${
                      settings.accent === a.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#151930]' : 'hover:scale-110'
                    }`}
                    style={{ background: a.hex }}
                  />
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                <button
                  onClick={() => {
                    setQsOpen(false);
                    launch(getApp('proxy')!);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-white/80 transition hover:bg-white/10"
                >
                  <ShieldCheck size={14} className={connected ? 'text-emerald-400' : 'text-white/45'} />
                  {connected ? `Protected · ${server?.name ?? 'pond'}` : 'Proxy unprotected — connect'}
                </button>
                <button
                  onClick={() => {
                    setQsOpen(false);
                    launch(getApp('capture')!);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-white/80 transition hover:bg-white/10"
                >
                  <Volume2 size={14} className="text-white/45" /> Duck Cam — record your screen
                </button>
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/35">
                Accent &amp; connection at a glance — Windows 11 style
              </div>
            </div>
          )}
        </div>
        {battery && BatteryIcon && (
          <div
            aria-label={`Battery ${batteryText}`}
            title={`Battery ${batteryText}`}
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 sm:flex"
            style={{ color: batteryTint }}
          >
            <BatteryIcon size={15} />
            <span className="text-[11px] font-medium tabular-nums">{batteryPct}%</span>
          </div>
        )}
        <div className="rounded-lg px-2 py-1 text-right text-[11px] leading-tight text-white/85">
          <div>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <div className="text-white/45">{now.toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}
