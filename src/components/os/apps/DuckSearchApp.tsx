import { useMemo, useState } from 'react';
import { EyeOff, Lock, Search as SearchIcon, ShieldCheck, Zap } from 'lucide-react';
import { OS_APPS } from '../os-registry';
import { useWindows } from '@/hooks/useWindows';
import { useProxySession } from '@/hooks/useProxySession';
import { findServers } from '@/lib/os/servers';
import { toast } from 'sonner';

export default function DuckSearchApp() {
  const [query, setQuery] = useState('');
  const { openApp } = useWindows();
  const proxy = useProxySession();

  const q = query.trim().toLowerCase();
  const appHits = useMemo(
    () => (q ? OS_APPS.filter((a) => !a.hidden && (a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q))) : []),
    [q],
  );
  const serverHits = useMemo(() => (q ? findServers(q) : []), [q]);

  const openAppById = (id: string) => {
    const app = OS_APPS.find((a) => a.id === id);
    if (app) openApp(app.id, app.name, app.size.w, app.size.h);
  };

  /** Web searches open the browser on its live results page. */
  const searchWeb = () => {
    const term = query.trim();
    if (!term) return;
    openApp('browser', 'Duck Browser', 1000, 700, { start: { kind: 'results', q: term } });
  };

  const go = () => {
    if (appHits.length > 0) openAppById(appHits[0].id);
    else if (serverHits.length > 0) {
      const server = serverHits[0];
      void proxy.connect(server);
      openAppById('proxy');
      toast.success(`Connecting to ${server.name}`);
    } else {
      searchWeb();
    }
  };

  return (
    <div className="os-scroll h-full overflow-y-auto p-6">
      {/* DDG-style header */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-4xl font-bold tracking-tight">
          <span className="text-[var(--os-accent)]">duck</span>
          <span className="text-white">search</span>
        </div>
        <div className="text-xs text-white/40">Quack without a trace.</div>

        <div className="relative mt-2 w-full max-w-lg">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="Search apps, servers, the web…"
            aria-label="Search"
            className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
          />
        </div>
      </div>

      {/* results */}
      {q && (
        <div className="mx-auto mt-6 w-full max-w-lg">
          {appHits.length > 0 && (
            <>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Apps</div>
              <div className="flex flex-col gap-1">
                {appHits.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.id}
                      onClick={() => openAppById(a.id)}
                      className="os-hover flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]"
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.iconBg}`}>
                        <Icon size={17} className="text-white" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{a.name}</span>
                        <span className="block truncate text-xs text-white/45">{a.tagline}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {serverHits.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Pond servers — Enter to connect
              </div>
              <div className="flex flex-col gap-1">
                {serverHits.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      void proxy.connect(s);
                      openAppById('proxy');
                    }}
                    className="os-hover flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.06]"
                  >
                    <span className="text-lg">{s.flag}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{s.name}</span>
                      <span className="block truncate text-xs text-white/45">
                        {s.city} · ~{s.basePing} ms
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              The web — live results
            </div>
            <button
              onClick={searchWeb}
              className="os-hover flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition hover:border-[var(--os-accent)]/50 hover:bg-white/[0.06]"
            >
              <SearchIcon size={16} className="shrink-0 text-[var(--os-accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">
                  Search DuckDuckGo for “{query.trim()}”
                </span>
                <span className="block truncate text-xs text-white/40">
                  Live results in Duck Browser — pages open through the tunnel
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* privacy cards */}
      <div className="mx-auto mt-8 grid w-full max-w-lg grid-cols-3 gap-2">
        {[
          { icon: Zap, title: 'Tunneled', text: 'Pages ride the Scramjet tunnel' },
          { icon: EyeOff, title: 'No history', text: 'Your browsing isn’t stored' },
          { icon: ShieldCheck, title: 'Live results', text: 'From DuckDuckGo’s own API' },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-center">
            <c.icon size={18} className="mx-auto text-[var(--os-accent)]" />
            <div className="mt-2 text-xs font-semibold text-white">{c.title}</div>
            <div className="mt-0.5 text-[10px] leading-snug text-white/40">{c.text}</div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-lg items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
        <Lock size={16} className="shrink-0 text-[var(--os-accent)]" />
        <div className="text-xs leading-relaxed text-white/50">
          Tip: searching a city like <b className="text-white/80">tokyo</b> and hitting Enter connects
          you straight to that pond server.
        </div>
      </div>
    </div>
  );
}
