export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  host: string;
}

export interface DdgAnswer {
  text: string;
  url: string;
  source: string;
}

/** An "open this service directly" card for services we can't search from outside. */
export interface SearchPortal {
  name: string;
  url: string;
  note: string;
}

export interface SearchResponse {
  query: string;
  service?: string;
  results: WebResult[];
  answer: DdgAnswer | null;
  portal?: SearchPortal | null;
}

export interface ReaderResponse {
  title: string;
  url: string;
  text: string;
}

export interface ProbeResponse {
  url: string;
  status: number;
  embeddable: boolean;
  reason: string | null;
  title: string;
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

export interface YtVideo {
  id: string;
  title: string;
  channel: string;
  length: string;
  views: string;
  thumb: string;
}

export interface YtSearchResponse {
  query: string;
  videos: YtVideo[];
  unavailable?: boolean;
  detail?: string;
}

export type UrlClass =
  | { kind: 'web' }
  | { kind: 'youtube'; videoId?: string; searchQuery?: string }
  | { kind: 'chatgpt' };

/** The server endpoint that proxies any page — and its assets — through the tunnel. */
export const TUNNEL_PATH = '/api/v2/function/scramjet-tunnel';

/** Wrap any web address so it loads through the Scramjet tunnel. */
export function tunnelUrl(target: string): string {
  let out = `${TUNNEL_PATH}?url=${encodeURIComponent(target)}`;
  // Keep the page's own query terms visible at the top level, so page scripts
  // that read location.search (DuckDuckGo reads ?q=…) still find them.
  try {
    const parts: string[] = [];
    let budget = 1200;
    for (const [k, v] of new URL(target).searchParams) {
      if (k === 'url' || k === 'self') continue;
      const s = `${k}=${encodeURIComponent(v)}`;
      if (s.length > budget) break;
      budget -= s.length + 1;
      parts.push(s);
    }
    if (parts.length) out += `&${parts.join('&')}`;
  } catch {
    // not a parseable address — nothing to mirror
  }
  // Tell the tunnel which public address this site is really served from, so
  // the links it rewrites inside proxied pages point somewhere a browser can
  // reach — its own internal address is localhost and refuses connections.
  try {
    const proto = window.location.protocol;
    if (proto === 'https:' || proto === 'http:') {
      return `${out}&self=${encodeURIComponent(window.location.origin)}`;
    }
  } catch {
    // no window (unit tests) — the plain form still loads
  }
  return out;
}

/** The real DuckDuckGo results page for a query — loaded through the tunnel. */
export function ddgSearchUrl(q: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

/** Where an address should go: YouTube player/portal, the ChatGPT page, or the plain web. */
export function classifyUrl(raw: string): UrlClass {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: 'web' };
  }
  const h = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if (h === 'youtu.be') {
    return { kind: 'youtube', videoId: u.pathname.split('/').filter(Boolean)[0] || undefined };
  }
  if (h === 'youtube.com' || h === 'youtube-nocookie.com' || h === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v) return { kind: 'youtube', videoId: v };
    const embed = u.pathname.match(/^\/embed\/([\w-]+)/);
    if (embed) return { kind: 'youtube', videoId: embed[1] };
    const shorts = u.pathname.match(/^\/shorts\/([\w-]+)/);
    if (shorts) return { kind: 'youtube', videoId: shorts[1] };
    return { kind: 'youtube', searchQuery: u.searchParams.get('search_query') || undefined };
  }
  if (h === 'chatgpt.com' || h === 'openai.com' || h === 'chat.openai.com') {
    return { kind: 'chatgpt' };
  }
  return { kind: 'web' };
}

/** True when the typed text looks like a web address rather than a search. */
export function isProbablyUrl(input: string): boolean {
  const t = input.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(t)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i.test(t);
}

/** Turn a bare domain into a full URL the proxy can load. */
export function normalizeUrl(input: string): string {
  const t = input.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(t)) return `http://${t}`;
  return `https://${t}`;
}

/** Short, pretty hostname for tab titles and result lines. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
