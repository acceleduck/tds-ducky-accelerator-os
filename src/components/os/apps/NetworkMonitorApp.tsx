import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, Gauge, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import db from '@/lib/shared/kliv-database.js';
import { useProxySession } from '@/hooks/useProxySession';
import { useSettings } from '@/hooks/useSettings';
import { formatMb, formatMbps, timeAgo } from '@/lib/os/format';

interface SessionRow {
  _row_id: number;
  server_name: string;
  status: string;
  ping_ms: number;
  download_mb: number;
  upload_mb: number;
  connected_at: number;
  disconnected_at: number | null;
}

interface TestRow {
  _row_id: number;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  _created_at: number;
}

interface Agg {
  count: number;
  down: number;
  up: number;
}

export default function NetworkMonitorApp() {
  const { accentHex } = useSettings();
  const proxy = useProxySession();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [agg, setAgg] = useState<Agg>({ count: 0, down: 0, up: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sess = await db.query<SessionRow>('proxy_sessions', { order: '_created_at.desc', limit: '20' });
      const tst = await db.query<TestRow>('speed_tests', { order: '_created_at.desc', limit: '20' });
      const aggRows = await db.query<{ down: number | null; up: number | null; count: number | null }>(
        'proxy_sessions',
        { select: 'down:download_mb.sum(),up:upload_mb.sum(),count' },
      );
      setSessions(sess);
      setTests(tst);
      const a = aggRows[0];
      setAgg({
        count: Number(a?.count) || 0,
        down: Number(a?.down) || 0,
        up: Number(a?.up) || 0,
      });
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const speedData = [...tests].reverse().map((t, i) => ({
    i: i + 1,
    down: Number(t.download_mbps),
    up: Number(t.upload_mbps),
  }));
  const sessionData = [...sessions].reverse().map((s) => ({
    name: s.server_name.split(' ')[0],
    down: Math.round(Number(s.download_mb)),
    up: Math.round(Number(s.upload_mb)),
  }));
  const avgPing =
    tests.length > 0 ? Math.round(tests.reduce((sum, t) => sum + Number(t.ping_ms), 0) / tests.length) : 0;
  const fastest = tests.reduce((m, t) => Math.max(m, Number(t.download_mbps)), 0);

  return (
    <div className="os-scroll h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <Activity size={16} className="text-[var(--os-accent)]" /> Network Monitor
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* status cards */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard
          icon={<ShieldCheck size={15} className={proxy.status === 'connected' ? 'text-emerald-400' : 'text-white/40'} />}
          label="Tunnel"
          value={proxy.status === 'connected' ? proxy.server?.name ?? 'Connected' : proxy.status === 'connecting' ? 'Connecting…' : 'Off'}
        />
        <StatCard label="Sessions" value={String(agg.count)} />
        <StatCard label="Transferred" value={formatMb(agg.down + agg.up)} />
        <StatCard icon={<Gauge size={15} className="text-[var(--os-accent)]" />} label="Avg ping" value={avgPing ? `${avgPing} ms` : '—'} />
      </div>

      {/* speed chart */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="mb-2 text-xs font-semibold text-white/70">Speed test history</div>
        {speedData.length === 0 ? (
          <EmptyHint text="No speed tests yet — run one in Speed Test." />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentHex} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={accentHex} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3ddc97" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#3ddc97" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="i" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#171b2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                />
                <Area type="monotone" dataKey="down" name="↓ Mbps" stroke={accentHex} fill="url(#downFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="up" name="↑ Mbps" stroke="#3ddc97" fill="url(#upFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        {fastest > 0 && (
          <div className="mt-2 text-[11px] text-white/40">
            Fastest run: ↓ {formatMbps(fastest)} Mbps
          </div>
        )}
      </div>

      {/* session chart */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="mb-2 text-xs font-semibold text-white/70">Data per session (MB)</div>
        {sessionData.length === 0 ? (
          <EmptyHint text="No sessions yet — connect a tunnel in Proxy Manager." />
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#171b2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="down" name="↓ MB" fill={accentHex} radius={[4, 4, 0, 0]} />
                <Bar dataKey="up" name="↑ MB" fill="#3ddc97" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* recent sessions table */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="mb-2 text-xs font-semibold text-white/70">Recent sessions</div>
        {sessions.length === 0 ? (
          <EmptyHint text="Nothing here yet." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            {sessions.slice(0, 8).map((s, i) => (
              <div
                key={s._row_id}
                className={`flex items-center gap-3 px-3 py-2 text-xs ${i % 2 === 0 ? 'bg-white/[0.03]' : ''}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.status === 'connected' ? 'bg-emerald-400' : 'bg-white/25'}`} />
                <span className="min-w-0 flex-1 truncate text-white/80">{s.server_name}</span>
                <span className="tabular-nums text-white/45">{Number(s.ping_ms)} ms</span>
                <span className="tabular-nums text-sky-300">
                  <ArrowDown size={10} className="inline" /> {formatMb(Number(s.download_mb))}
                </span>
                <span className="hidden tabular-nums text-emerald-300 sm:inline">
                  <ArrowUp size={10} className="inline" /> {formatMb(Number(s.upload_mb))}
                </span>
                <span className="w-16 text-right text-white/35">{timeAgo(s.connected_at / 1000)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {icon} {label}
      </div>
      <div className="mt-1.5 truncate text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="flex h-32 items-center justify-center text-xs text-white/35">{text}</div>;
}
