import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Gauge as GaugeIcon, History, Loader2, Play } from 'lucide-react';
import db from '@/lib/shared/kliv-database.js';
import { toast } from 'sonner';
import { useProxySession } from '@/hooks/useProxySession';
import { useSettings } from '@/hooks/useSettings';
import { bestServer, rollPing } from '@/lib/os/servers';
import { formatMbps, timeAgo } from '@/lib/os/format';

interface SpeedRow {
  _row_id: number;
  server_id: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  _created_at: number;
}

type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'done';

function animate(target: number, ms: number, onUpdate: (value: number, progress: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      onUpdate(target * eased, p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

const ARC = Math.PI * 80;

export default function SpeedTestApp() {
  const proxy = useProxySession();
  const { accentHex } = useSettings();
  const [phase, setPhase] = useState<Phase>('idle');
  const [gauge, setGauge] = useState({ label: 'Ready', value: 0, unit: 'Mbps', progress: 0 });
  const [result, setResult] = useState<{ down: number; up: number; ping: number; serverName: string } | null>(null);
  const [history, setHistory] = useState<SpeedRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const runningRef = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await db.query<SpeedRow>('speed_tests', { order: '_created_at.desc', limit: '8' });
      setHistory(rows);
    } catch {
      // keep old history
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const server = proxy.server ?? bestServer();
    const ping = rollPing(server);
    const down = 260 + Math.random() * 640;
    const up = 130 + Math.random() * 340;

    setResult(null);
    setPhase('ping');
    await animate(ping, 1300, (v, p) => setGauge({ label: 'Ping', value: v, unit: 'ms', progress: p }));
    setPhase('download');
    await animate(down, 2300, (v, p) => setGauge({ label: 'Download', value: v, unit: 'Mbps', progress: p }));
    setPhase('upload');
    await animate(up, 2100, (v, p) => setGauge({ label: 'Upload', value: v, unit: 'Mbps', progress: p }));
    setPhase('done');
    setResult({ down, up, ping, serverName: server.name });

    try {
      await db.insertOne('speed_tests', {
        server_id: server.id,
        download_mbps: Math.round(down * 10) / 10,
        upload_mbps: Math.round(up * 10) / 10,
        ping_ms: ping,
      });
      await loadHistory();
      toast.success('Speed test saved', {
        description: `↓ ${formatMbps(down)} Mbps · ↑ ${formatMbps(up)} Mbps · ${ping} ms`,
      });
    } catch {
      toast.error('Could not save the result');
    }
    runningRef.current = false;
  };

  const running = phase === 'ping' || phase === 'download' || phase === 'upload';

  return (
    <div className="os-scroll flex h-full flex-col items-center overflow-y-auto p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
        <GaugeIcon size={16} className="text-[var(--os-accent)]" /> Pond Speed Test
      </div>
      <div className="mt-1 text-xs text-white/40">
        {proxy.server ? `Through ${proxy.server.name}` : 'Direct — connect a tunnel for a fair fight'}
      </div>

      {/* gauge */}
      <svg viewBox="0 0 200 112" className="mt-5 w-64 max-w-full">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,.08)"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={accentHex}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={ARC}
          strokeDashoffset={ARC * (1 - gauge.progress)}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="-mt-12 text-center">
        <div className="text-4xl font-bold tabular-nums text-white">
          {gauge.value >= 100 ? Math.round(gauge.value) : gauge.value.toFixed(1)}
        </div>
        <div className="text-xs text-white/45">
          {gauge.unit} · {gauge.label}
        </div>
      </div>

      {running && (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
          <Loader2 size={13} className="animate-spin" /> Measuring {gauge.label.toLowerCase()}…
        </div>
      )}

      {result && (
        <div className="mt-4 grid w-full max-w-sm grid-cols-3 gap-2">
          {[
            { icon: GaugeIcon, label: 'Ping', value: `${result.ping} ms` },
            { icon: ArrowDown, label: 'Down', value: `${formatMbps(result.down)} Mbps` },
            { icon: ArrowUp, label: 'Up', value: `${formatMbps(result.up)} Mbps` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-2.5 text-center">
              <s.icon size={14} className="mx-auto text-[var(--os-accent)]" />
              <div className="mt-1 text-sm font-semibold text-white">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-white/40">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => void run()}
        disabled={running}
        className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--os-accent)] px-8 py-3 text-sm font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-60"
      >
        <Play size={15} />
        {running ? 'Testing…' : phase === 'done' ? 'Run again' : 'Start test'}
      </button>

      {/* history */}
      <div className="mt-6 w-full max-w-md">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
          <History size={12} /> Recent runs
        </div>
        {loadingHistory ? (
          <div className="py-4 text-center text-xs text-white/35">Loading…</div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-5 text-center text-xs text-white/35">
            No runs yet — your results are saved to your account.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            {history.map((r, i) => (
              <div
                key={r._row_id}
                className={`flex items-center gap-3 px-3 py-2 text-xs ${
                  i % 2 === 0 ? 'bg-white/[0.03]' : 'bg-transparent'
                }`}
              >
                <span className="flex-1 text-white/70">{timeAgo(r._created_at)}</span>
                <span className="tabular-nums text-sky-300">↓ {formatMbps(Number(r.download_mbps))}</span>
                <span className="tabular-nums text-emerald-300">↑ {formatMbps(Number(r.upload_mbps))}</span>
                <span className="w-16 text-right tabular-nums text-white/50">{Number(r.ping_ms)} ms</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
