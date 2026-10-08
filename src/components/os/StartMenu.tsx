import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Lock, LogOut, Moon, Power, PowerOff, RotateCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { OS_APPS, getApp } from './os-registry';
import type { OsApp } from './os-registry';
import { UserAvatar } from './UserAvatar';

export function StartMenu({
  onOpenApp,
  onLock,
  onSignOut,
  onShutdown,
  onRestart,
}: {
  onOpenApp: (app: OsApp) => void;
  onLock: () => void;
  onSignOut: () => void;
  onShutdown: () => void;
  onRestart: () => void;
}) {
  const { user } = useAuth();
  const profile = useProfile();
  const [query, setQuery] = useState('');
  const [powerOpen, setPowerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const results = (
    q
      ? OS_APPS.filter((a) => a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q))
      : OS_APPS
  ).filter((a) => !a.hidden);

  const powerItems: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[] = [
    { label: 'Sleep', icon: <Moon size={15} />, onClick: onLock },
    { label: 'Lock', icon: <Lock size={15} />, onClick: onLock },
    { label: 'Sign out', icon: <LogOut size={15} />, onClick: onSignOut },
    { label: 'Restart', icon: <RotateCw size={15} />, onClick: onRestart },
    { label: 'Shut down', icon: <PowerOff size={15} />, onClick: onShutdown, danger: true },
  ];

  return (
    <div className="menu-pop os-glass-strong absolute bottom-16 left-1/2 z-50 w-[min(560px,94vw)] -translate-x-1/2 rounded-2xl p-5 shadow-2xl shadow-black/60">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) onOpenApp(results[0]);
        }}
        placeholder="Search apps…"
        aria-label="Search apps"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--os-accent)] focus:outline-none"
      />

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
        {q ? `Results for "${query}"` : 'Pinned'}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-4">
        {results.map((app) => {
          const Icon = app.icon;
          return (
            <button
              key={app.id}
              onClick={() => onOpenApp(app)}
              title={app.tagline}
              className="os-hover flex flex-col items-center gap-2 rounded-xl p-3 hover:bg-white/10"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${app.iconBg}`}>
                <Icon size={20} className="text-white" />
              </span>
              <span className="w-full truncate text-center text-[11px] text-white/85">{app.name}</span>
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="col-span-full py-6 text-center text-sm text-white/40">No apps found</div>
        )}
      </div>

      {!q && (
        <>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Recommended
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {OS_APPS.filter((a) => !a.hidden && ['files', 'browser', 'chat', 'capture'].includes(a.id)).map(
              (app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    onClick={() => onOpenApp(app)}
                    className="os-hover flex items-center gap-2.5 rounded-xl p-2 text-left hover:bg-white/10"
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${app.iconBg}`}>
                      <Icon size={15} className="text-white" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-white/85">{app.name}</span>
                      <span className="block truncate text-[10px] text-white/35">{app.tagline}</span>
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
        <button
          onClick={() => onOpenApp(getApp('settings')!)}
          aria-label="Account settings"
          title="Account settings — name, picture, password"
          className="os-hover flex min-w-0 items-center gap-2.5 rounded-xl p-1.5 pr-3 hover:bg-white/10"
        >
          <UserAvatar name={profile.name} pfp={profile.pfp} seed={user?.userUuid} size={34} />
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm text-white/85">{profile.name}</span>
            <span className="block truncate text-[10px] text-white/40">
              {profile.pfp ? 'Picture on' : 'Add a picture'} · Account settings
            </span>
          </span>
        </button>
        <div className="relative">
          <button
            aria-label="Power options"
            onClick={() => setPowerOpen((o) => !o)}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10"
          >
            <Power size={17} />
          </button>
          {powerOpen && (
            <div className="absolute bottom-11 right-0 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#151930] shadow-xl">
              {powerItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-white/10 ${
                    item.danger ? 'text-red-300 hover:bg-red-500/15' : 'text-white/85'
                  }`}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
