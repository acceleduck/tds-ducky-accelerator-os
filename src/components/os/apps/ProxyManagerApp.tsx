import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Cable, Globe, Loader2, Radio, ShieldCheck, ShieldX, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useProxySession } from '@/hooks/useProxySession';
import { useSettings } from '@/hooks/useSettings';
import { useNow } from '@/hooks/useNow';
import {
  SERVERS,
  bestServer,
  rollPing,
  signalBars,
  DEFAULT_WISP_ENDPOINT,
  isValidEndpointUrl,
} from '@/lib/os/servers';
import type { ProxyServer } from '@/lib/os/servers';
import { formatDuration, formatMb } from '@/lib/os/format';

function SignalBars({ bars }: { bars: number }) {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i <= bars ? 'bg-[var(--os-accent)]' : 'bg-white/15'}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}

export default function ProxyManagerApp() {
  const proxy = useProxySession();
  const { settings, update } = useSettings();
  const now = useNow(proxy.status === 'connected', 1000);
  const [selectedId, setSelectedId] = useState<string>(bestServer().id);
  const [endpointDraft, setEndpointDraft] = useState(settings.proxyEndpoint);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  useEffect(() => {
    setEndpointDraft(settings.proxyEndpoint);
  }, [settings.proxyEndpoint]);

  const saveEndpoint = (raw: string) => {
    const value = raw.trim();
    if (!isValidEndpointUrl(value)) {
      setEndpointError('Use a wss:// or ws:// address');
      return;
    }
    setEndpointError(null);
    update({ proxyEndpoint: value });
    toast.success('Connection endpoint saved');
  };

  const [pings, setPings] = useState<Record<string, number>>(() =>
    Object.fromEntries(SERVERS.map((s) => [s.id, rollPing(s)])),
  );

  // Live-ish ping jitter, purely presentational.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setPings((prev) => {
        const next = { ...prev };
        for (const s of SERVERS) next[s.id] = rollPing(s);
        return next;
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, []);

  const selected: ProxyServer = useMemo(
    () => SERVERS.find((s) => s.id === selectedId) ?? bestServer(),
    [selectedId],
  );
  const connected = proxy.status === 'connected';
  const busy = proxy.status === 'connecting' || proxy.status === 'disconnecting';
  const sessionDuration =
    proxy.startedAt != null ? formatDuration(now.getTime() - proxy.startedAt) : null;

  const currentServer = connected ? proxy.server : null;

  return (
    <div className="flex h-full flex-col overflow-hidden lg:flex-row">
      {/* status panel */}
      <div className="os-scroll flex shrink-0 flex-col gap-4 overflow-y-auto border-b border-white/[0.06] p-5 lg:w-[340px] lg:border-b-0 lg:border-r">
        <div
          className={`relative overflow-hidden rounded-2xl border p-5 ${
            connected ? 'border-emerald-400/30 bg-emerald-500/[0.08]' : 'border-white/10 bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            {connected ? (
              <ShieldCheck size={40} className="shrink-0 text-emerald-400" />
            ) : (
              <ShieldX size={40} className="shrink-0 text-white/35" />
            )}
            <div className="min-w-0">
              <div className={`text-lg font-semibold ${connected ? 'text-emerald-300' : 'text-white/80'}`}>
                {connected ? 'Protected' : proxy.status === 'connecting' ? 'Connecting…' : 'Unprotected'}
              </div>
              <div className="truncate text-sm text-white/55">
                {currentServer
                  ? `${currentServer.flag} ${currentServer.name}`
                  : proxy.status === 'connecting' && proxy.server
                    ? `${proxy.server.flag} ${proxy.server.name}`
                    : 'No tunnel active'}
              </div>
            </div>
          </div>

          {(connected || proxy.status === 'connecting') && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-black/25 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-white/40">Ping</div>
                <div className="font-semibold text-white">{proxy.ping} ms</div>
              </div>
              <div className="rounded-xl bg-black/25 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-white/40">Session</div>
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Timer size={13} className="text-white/50" />
                  {sessionDuration ?? '—'}
                </div>
              </div>
              <div className="rounded-xl bg-black/25 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-white/40">
                  <ArrowDown size={10} className="mr-1 inline" />Downloaded
                </div>
                <div className="font-semibold text-white">{formatMb(proxy.downloadMb)}</div>
              </div>
              <div className="rounded-xl bg-black/25 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-white/40">
                  <ArrowUp size={10} className="mr-1 inline" />Uploaded
                </div>
                <div className="font-semibold text-white">{formatMb(proxy.uploadMb)}</div>
              </div>
            </div>
          )}

          {(connected || proxy.status === 'connecting') && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs">
              {proxy.wisp.status === 'online' ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
              ) : proxy.wisp.status === 'offline' ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
              ) : (
                <Loader2 size={11} className="shrink-0 animate-spin text-white/50" />
              )}
              <span className="min-w-0 flex-1 truncate text-white/70">
                {proxy.wisp.status === 'checking'
                  ? 'Checking the Wisp relay…'
                  : proxy.wisp.status === 'online'
                    ? `Wisp link online · ${proxy.wisp.latencyMs ?? '—'} ms`
                    : 'Wisp relay unreachable — riding the Scramjet fetch proxy'}
              </span>
            </div>
          )}

          {connected && proxy.tunnel && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white/60">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-white/85">
                <Radio size={12} className="text-[var(--os-accent)]" />
                {proxy.tunnel.protocol} · {proxy.tunnel.obfuscation}
              </div>
              <div>{proxy.tunnel.cipher}</div>
              <div className="mt-1 text-white/40">
                {proxy.tunnel.hops.length} hops · handshake {proxy.tunnel.handshake_ms} ms
              </div>
            </div>
          )}

          {connected && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--os-accent-soft)] px-3 py-2 text-sm text-white/85">
              <Globe size={14} className="text-[var(--os-accent)]" />
              <span>
                <b className="text-white">{proxy.pagesProxied}</b> pages loaded through the tunnel
              </span>
            </div>
          )}
          {connected && proxy.verify && (
            <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-white/60">
              Connect check: loaded{' '}
              <b className="text-white/85">{Math.max(1, Math.round(proxy.verify.bytes / 1024))} KB</b>{' '}
              from {proxy.verify.title.slice(0, 60) || 'the web'} in {proxy.verify.ms} ms — real traffic,
              really proxied.
            </div>
          )}

          {proxy.status === 'connecting' && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="os-progress-fill h-full rounded-full transition-all"
                  style={{ width: `${Math.round(proxy.progress * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-center text-xs text-white/55">{proxy.message}</div>
            </div>
          )}

          <button
            onClick={() =>
              connected
                ? void proxy.disconnect()
                : void proxy.connect(selected, settings.proxyEndpoint)
            }
            disabled={busy}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:opacity-60 ${
              connected
                ? 'bg-white/10 text-white hover:bg-white/15'
                : 'bg-[var(--os-accent)] text-[#17131f] hover:brightness-110'
            }`}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {proxy.status === 'connecting'
              ? 'Connecting…'
              : proxy.status === 'disconnecting'
                ? 'Disconnecting…'
                : connected
                  ? 'Disconnect'
                  : `Connect to ${selected.name}`}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/80">
            <Cable size={13} className="text-[var(--os-accent)]" />
            Connection configuration
          </div>
          <label htmlFor="proxy-endpoint" className="mb-1 block text-[11px] text-white/45">
            Wisp endpoint
          </label>
          <Input
            id="proxy-endpoint"
            value={endpointDraft}
            onChange={(e) => setEndpointDraft(e.target.value)}
            onBlur={() => {
              if (endpointDraft.trim() !== settings.proxyEndpoint) saveEndpoint(endpointDraft);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEndpoint(endpointDraft);
            }}
            spellCheck={false}
            autoComplete="off"
            className="h-9 border-white/10 bg-black/25 font-mono text-[11px] text-white/85"
          />
          {endpointError ? (
            <p className="mt-1.5 text-[11px] text-rose-300">{endpointError}</p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
              Every connection rides this public Wisp relay. The link is checked live when you
              connect.
            </p>
          )}
          {settings.proxyEndpoint !== DEFAULT_WISP_ENDPOINT && (
            <button
              onClick={() => {
                setEndpointDraft(DEFAULT_WISP_ENDPOINT);
                saveEndpoint(DEFAULT_WISP_ENDPOINT);
              }}
              className="mt-2 text-[11px] text-[var(--os-accent)] hover:underline"
            >
              Reset to the public Wisp server
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-white/45">
          Everything runs through the <b className="text-white/70">Scramjet engine</b>: on connect, a
          real page is loaded through the tunnel to prove traffic flows, and every page you open in
          Duck Browser rides the same tunnel. Logins inside proxied pages are the honest limit.
        </div>
      </div>

      {/* server list */}
      <div className="os-scroll min-w-0 flex-1 overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/85">Pond servers</h2>
          <span className="text-xs text-white/40">{SERVERS.length} locations · no logs, no quacks given</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SERVERS.map((s) => {
            const isCurrent = connected && proxy.server?.id === s.id;
            const isSelected = selectedId === s.id;
            const ping = isCurrent ? proxy.ping : pings[s.id] ?? s.basePing;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                aria-label={`Select ${s.name}`}
                className={`os-hover rounded-2xl border p-3.5 text-left transition ${
                  isCurrent
                    ? 'border-emerald-400/40 bg-emerald-500/[0.08]'
                    : isSelected
                      ? 'border-[var(--os-accent)]/60 bg-white/[0.06]'
                      : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{s.flag}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{s.name}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          CURRENT
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-white/45">
                      {s.city} · {s.country}
                    </div>
                    {s.endpoint && (
                      <div className="mt-0.5 truncate font-mono text-[10px] text-white/30">
                        {s.endpoint}
                      </div>
                    )}
                  </div>
                  <SignalBars bars={signalBars(ping)} />
                  <span className="w-14 text-right text-xs tabular-nums text-white/70">{ping} ms</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full ${s.load > 0.5 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${Math.round(s.load * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/40">{Math.round(s.load * 100)}% load</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
