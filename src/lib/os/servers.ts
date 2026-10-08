export interface ProxyServer {
  id: string;
  name: string;
  city: string;
  country: string;
  flag: string;
  region: 'NA' | 'EU' | 'APAC' | 'SA' | 'GLOBAL';
  load: number;
  basePing: number;
  /** Live relay address (wss://…) when the server has a real public endpoint. */
  endpoint?: string;
}

/** The public Wisp relay every connection is configured against by default. */
export const DEFAULT_WISP_ENDPOINT = 'wss://wisp.mercurywork.shop/';

export const SERVERS: ProxyServer[] = [
  {
    id: 'mercury-wisp',
    name: 'Mercury Wisp',
    city: 'Public Wisp relay',
    country: 'Mercury Network',
    flag: '🛰️',
    region: 'GLOBAL',
    load: 0.18,
    basePing: 16,
    endpoint: DEFAULT_WISP_ENDPOINT,
  },
  { id: 'pond-central', name: 'Ducky Pond Central', city: 'New York', country: 'United States', flag: '🇺🇸', region: 'NA', load: 0.32, basePing: 24 },
  { id: 'golden-pond', name: 'Golden Pond', city: 'San Jose', country: 'United States', flag: '🇺🇸', region: 'NA', load: 0.41, basePing: 62 },
  { id: 'rubber-uk', name: 'Rubber Duck UK', city: 'London', country: 'United Kingdom', flag: '🇬🇧', region: 'EU', load: 0.55, basePing: 88 },
  { id: 'canal-duck', name: 'Canal Duck', city: 'Amsterdam', country: 'Netherlands', flag: '🇳🇱', region: 'EU', load: 0.28, basePing: 94 },
  { id: 'duckburg-eu', name: 'Duckburg EU', city: 'Frankfurt', country: 'Germany', flag: '🇩🇪', region: 'EU', load: 0.47, basePing: 102 },
  { id: 'le-petit-pond', name: 'Le Petit Pond', city: 'Paris', country: 'France', flag: '🇫🇷', region: 'EU', load: 0.36, basePing: 98 },
  { id: 'tokyo-pond', name: 'Tokyo Pond', city: 'Tokyo', country: 'Japan', flag: '🇯🇵', region: 'APAC', load: 0.38, basePing: 148 },
  { id: 'harbor-duck', name: 'Harbor Duck', city: 'Singapore', country: 'Singapore', flag: '🇸🇬', region: 'APAC', load: 0.44, basePing: 176 },
  { id: 'billabong', name: 'Sydney Billabong', city: 'Sydney', country: 'Australia', flag: '🇦🇺', region: 'APAC', load: 0.35, basePing: 189 },
  { id: 'pampa-pond', name: 'Pampa Pond', city: 'São Paulo', country: 'Brazil', flag: '🇧🇷', region: 'SA', load: 0.51, basePing: 132 },
];

/** Roll a plausible live ping around the server's rated latency. */
export function rollPing(server: ProxyServer): number {
  const jitter = server.basePing * 0.25;
  const value = server.basePing + (Math.random() * 2 - 1) * jitter;
  return Math.max(5, Math.round(value));
}

/** Find servers by id, name, city or country. */
export function findServers(query: string): ProxyServer[] {
  const q = query.trim().toLowerCase();
  if (!q) return SERVERS;
  return SERVERS.filter((s) =>
    [s.id, s.name, s.city, s.country].some((v) => v.toLowerCase().includes(q)),
  );
}

export function signalBars(ping: number): 1 | 2 | 3 | 4 {
  if (ping < 40) return 4;
  if (ping < 90) return 3;
  if (ping < 150) return 2;
  return 1;
}

/** True when the configured connection endpoint is a usable websocket address. */
export function isValidEndpointUrl(raw: string): boolean {
  if (!raw.trim()) return false;
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'wss:' || u.protocol === 'ws:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function bestServer(): ProxyServer {
  return [...SERVERS].sort((a, b) => a.basePing - b.basePing)[0];
}
