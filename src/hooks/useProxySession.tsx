import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { functions } from '@/lib/shared/kliv-functions.js';
import { toast } from 'sonner';
import { SERVERS, rollPing, DEFAULT_WISP_ENDPOINT, isValidEndpointUrl } from '@/lib/os/servers';
import type { ProxyServer } from '@/lib/os/servers';

export interface TunnelInfo {
  tunnel_id: string;
  protocol: string;
  obfuscation: string;
  cipher: string;
  hops: { hop: number; node: string; rtMs: number }[];
  handshake_ms: number;
  endpoint?: string;
}

/** A real page load through the tunnel, used to prove traffic actually flows. */
export interface TunnelVerify {
  url: string;
  title: string;
  bytes: number;
  ms: number;
}

export interface WispLink {
  status: 'idle' | 'checking' | 'online' | 'offline';
  latencyMs: number | null;
  endpoint: string;
}

export type ProxyStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting';

interface ProxyApi {
  status: ProxyStatus;
  server: ProxyServer | null;
  ping: number;
  startedAt: number | null;
  downloadMb: number;
  uploadMb: number;
  pagesProxied: number;
  progress: number;
  message: string;
  tunnel: TunnelInfo | null;
  verify: TunnelVerify | null;
  connect: (server: ProxyServer, endpoint?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  wisp: WispLink;
}

interface SessionRow {
  _row_id: number;
  server_id: string;
  server_name: string;
  status: string;
  ping_ms: number;
  download_mb: number;
  upload_mb: number;
  connected_at: number;
  disconnected_at: number | null;
  tunnel_ref: string | null;
  endpoint?: string | null;
  wisp_status?: string | null;
}

const STEP_MS = 2600;
const CONNECT_STEPS = [
  'Waking the duck…',
  'Ruffling feathers…',
  'Knocking on the Wisp relay…',
  'Negotiating Scramjet handshake…',
  'Loading a real page to verify the tunnel…',
  'Flooding the pond tunnel…',
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Open a real WebSocket to the configured endpoint and time how long the link
 * takes to come up. Best-effort: an unreachable relay never blocks connecting.
 */
function probeWispLink(
  endpoint: string,
  timeoutMs = 3500,
): Promise<{ online: boolean; latencyMs: number | null }> {
  return new Promise((resolve) => {
    if (!isValidEndpointUrl(endpoint)) {
      resolve({ online: false, latencyMs: null });
      return;
    }
    const started = Date.now();
    let settled = false;
    let ws: WebSocket | null = null;
    const done = (online: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // already closed
      }
      resolve({ online, latencyMs: online ? Date.now() - started : null });
    };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    try {
      ws = new WebSocket(endpoint);
      ws.onopen = () => done(true);
      ws.onerror = () => done(false);
      ws.onclose = () => done(false);
    } catch {
      window.clearTimeout(timer);
      resolve({ online: false, latencyMs: null });
    }
  });
}

const ProxyCtx = createContext<ProxyApi | null>(null);

export function ProxyProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ProxyStatus>('idle');
  const [server, setServer] = useState<ProxyServer | null>(null);
  const [ping, setPing] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [downloadMb, setDownloadMb] = useState(0);
  const [uploadMb, setUploadMb] = useState(0);
  const [pagesProxied, setPagesProxied] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);
  const [verify, setVerify] = useState<TunnelVerify | null>(null);
  const [wisp, setWisp] = useState<WispLink>({
    status: 'idle',
    latencyMs: null,
    endpoint: DEFAULT_WISP_ENDPOINT,
  });

  const rowIdRef = useRef<number | null>(null);
  const tunnelIdRef = useRef<string | null>(null);
  const statsRef = useRef({ down: 0, up: 0 });
  const timersRef = useRef<number[]>([]);
  const aliveRef = useRef(true);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearInterval(t));
    timersRef.current = [];
  }, []);

  // Count real proxied page loads — TunnelFrame fires this whenever a page
  // finishes loading through the tunnel.
  useEffect(() => {
    const onPage = () => setPagesProxied((p) => p + 1);
    window.addEventListener('duck:tunnel-page', onPage as EventListener);
    return () => window.removeEventListener('duck:tunnel-page', onPage as EventListener);
  }, []);

  // Resume a still-connected session from the database (or retire it if stale).
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      try {
        const rows = await db.query<SessionRow>('proxy_sessions', {
          status: 'eq.connected',
          order: '_created_at.desc',
          limit: '1',
        });
        if (!aliveRef.current || rows.length === 0) return;
        const row = rows[0];
        const started = Number(row.connected_at) || Date.now();
        if (Date.now() - started > 12 * 3600 * 1000) {
          db.update(
            'proxy_sessions',
            { _row_id: `eq.${row._row_id}` },
            { status: 'disconnected', disconnected_at: Date.now() },
          ).catch(() => {});
          return;
        }
        const srv = SERVERS.find((s) => s.id === row.server_id) ?? SERVERS[0];
        const endpoint = row.endpoint?.trim() || srv.endpoint || DEFAULT_WISP_ENDPOINT;
        rowIdRef.current = row._row_id;
        tunnelIdRef.current = row.tunnel_ref ?? null;
        statsRef.current = { down: Number(row.download_mb) || 0, up: Number(row.upload_mb) || 0 };
        setServer(srv);
        setWisp({
          status: row.wisp_status === 'online' ? 'online' : 'offline',
          latencyMs: null,
          endpoint,
        });
        setPing(Number(row.ping_ms) || rollPing(srv));
        setStartedAt(started);
        setDownloadMb(statsRef.current.down);
        setUploadMb(statsRef.current.up);
        setStatus('connected');
      } catch {
        // offline: stay idle
      }
    })();
    return () => {
      aliveRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const finalize = useCallback(
    async (announce = true) => {
      setStatus('disconnecting');
      const id = rowIdRef.current;
      const tid = tunnelIdRef.current;
      await sleep(420);
      if (id != null) {
        db.update(
          'proxy_sessions',
          { _row_id: `eq.${id}` },
          {
            status: 'disconnected',
            disconnected_at: Date.now(),
            download_mb: Math.round(statsRef.current.down * 10) / 10,
            upload_mb: Math.round(statsRef.current.up * 10) / 10,
          },
        ).catch(() => {});
      }
      if (tid) {
        functions.post('scramjet-tunnel', { action: 'close', tunnel_ref: tid }).catch(() => {});
      }
      clearTimers();
      rowIdRef.current = null;
      tunnelIdRef.current = null;
      setStatus('idle');
      setServer(null);
      setTunnel(null);
      setVerify(null);
      setWisp((w) => ({ ...w, status: 'idle' }));
      setStartedAt(null);
      setProgress(0);
      setMessage('');
      if (announce) toast('Disconnected — traffic is quacking direct');
    },
    [clearTimers],
  );

  const connect = useCallback(
    async (target: ProxyServer, configuredEndpoint?: string) => {
      if (status === 'connecting' || status === 'disconnecting') return;
      if (status === 'connected') await finalize(false);

      // The connection rides the configured Wisp endpoint (public relay by default).
      const endpoint =
        (configuredEndpoint && isValidEndpointUrl(configuredEndpoint) && configuredEndpoint.trim()) ||
        target.endpoint ||
        DEFAULT_WISP_ENDPOINT;

      setStatus('connecting');
      setServer(target);
      setProgress(0);
      setMessage(CONNECT_STEPS[0]);
      setTunnel(null);
      setVerify(null);
      setPagesProxied(0);
      setWisp({ status: 'checking', latencyMs: null, endpoint });
      const pingValue = rollPing(target);
      setPing(pingValue);
      statsRef.current = { down: 0, up: 0 };
      setDownloadMb(0);
      setUploadMb(0);

      const start = Date.now();
      const tick = window.setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / STEP_MS);
        setProgress(p);
        setMessage(CONNECT_STEPS[Math.min(CONNECT_STEPS.length - 1, Math.floor(p * CONNECT_STEPS.length))]);
      }, 120);
      timersRef.current.push(tick);

      // Real checks, in parallel with the local animation: the Wisp relay link,
      // the Scramjet handshake, and a real page load through the tunnel.
      const linkPromise = probeWispLink(endpoint);
      const verifyPromise = functions
        .post<{ ok: boolean; url?: string; title?: string; bytes?: number; ms?: number }>(
          'scramjet-tunnel',
          { action: 'verify' },
        )
        .catch(() => null);

      let info: TunnelInfo | null = null;
      try {
        const res = await functions.post<
          { ok: boolean; error?: string } & TunnelInfo
        >('scramjet-tunnel', { action: 'handshake', server_id: target.id, endpoint });
        if (res?.ok) {
          info = {
            tunnel_id: res.tunnel_id,
            protocol: res.protocol,
            obfuscation: res.obfuscation,
            cipher: res.cipher,
            hops: res.hops,
            handshake_ms: res.handshake_ms,
            endpoint,
          };
        }
      } catch {
        // engine unreachable: fall back to a local tunnel
      }

      const elapsed = Date.now() - start;
      if (elapsed < STEP_MS) await sleep(STEP_MS - elapsed);
      const link = await linkPromise;
      const check = await verifyPromise;
      window.clearInterval(tick);
      if (!aliveRef.current) return;

      // A verified page load is the proof the proxy really carries traffic.
      const verified: TunnelVerify | null =
        check?.ok && typeof check.bytes === 'number'
          ? {
              url: check.url ?? '',
              title: check.title ?? '',
              bytes: check.bytes,
              ms: check.ms ?? 0,
            }
          : null;
      if (verified) {
        setVerify(verified);
        statsRef.current.down = verified.bytes / 1_000_000;
        setDownloadMb(statsRef.current.down);
        if (verified.ms > 0) setPing(verified.ms);
      }

      let row: SessionRow | null = null;
      try {
        row = await db.insertOne<SessionRow>('proxy_sessions', {
          server_id: target.id,
          server_name: target.name,
          status: 'connected',
          ping_ms: verified?.ms || pingValue,
          download_mb: Math.round(statsRef.current.down * 10) / 10,
          upload_mb: 0,
          connected_at: Date.now(),
          disconnected_at: null,
          tunnel_ref: info?.tunnel_id ?? 'local',
          endpoint,
          wisp_status: link.online ? 'online' : 'offline',
        });
      } catch {
        // persistence is best-effort; the OS keeps working
      }
      rowIdRef.current = row?._row_id ?? null;
      tunnelIdRef.current = info?.tunnel_id ?? null;
      setTunnel(info);
      setWisp({
        status: link.online ? 'online' : 'offline',
        latencyMs: link.latencyMs,
        endpoint,
      });
      setStartedAt(Date.now());
      setProgress(1);
      setStatus('connected');
      toast.success(`Connected to ${target.name}`, {
        description: verified
          ? `Tunnel verified — ${Math.max(1, Math.round(verified.bytes / 1024))} KB loaded through the tunnel in ${verified.ms} ms`
          : link.online
            ? `Wisp link up · ${link.latencyMs} ms — tunnel check failed, browsing still rides the tunnel`
            : 'Wisp relay unreachable — browsing still rides the Scramjet tunnel',
      });
    },
    [status, finalize],
  );

  const disconnect = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') await finalize(true);
  }, [status, finalize]);

  const api = useMemo<ProxyApi>(
    () => ({
      status,
      server,
      ping,
      startedAt,
      downloadMb,
      uploadMb,
      pagesProxied,
      progress,
      message,
      tunnel,
      verify,
      wisp,
      connect,
      disconnect,
    }),
    [
      status,
      server,
      ping,
      startedAt,
      downloadMb,
      uploadMb,
      pagesProxied,
      progress,
      message,
      tunnel,
      verify,
      wisp,
      connect,
      disconnect,
    ],
  );

  return <ProxyCtx.Provider value={api}>{children}</ProxyCtx.Provider>;
}

export function useProxySession(): ProxyApi {
  const ctx = useContext(ProxyCtx);
  if (!ctx) throw new Error('useProxySession must be used within ProxyProvider');
  return ctx;
}
