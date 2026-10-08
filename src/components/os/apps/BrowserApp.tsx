import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCw,
  Search as SearchIcon,
  Sparkles,
  X,
  Youtube as YoutubeIcon,
} from 'lucide-react';
import functions from '@/lib/shared/kliv-functions.js';
import { useWindows } from '@/hooks/useWindows';
import { DuckLogo } from '../DuckLogo';
import { TunnelFrame } from '../TunnelFrame';
import {
  classifyUrl,
  hostOf,
  isProbablyUrl,
  normalizeUrl,
} from '@/lib/os/browser';
import type {
  ReaderResponse,
  SearchResponse,
  SuggestResponse,
  YtSearchResponse,
} from '@/lib/os/browser';

type View =
  | { kind: 'home' }
  | { kind: 'results'; q: string; service?: string }
  | { kind: 'web'; url: string }
  | { kind: 'reader'; url: string }
  | { kind: 'yt'; q: string }
  | { kind: 'ytwatch'; videoId: string; title?: string }
  | { kind: 'chatgpt' };

interface Tab {
  id: number;
  history: View[];
  cursor: number;
}

interface FetchState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

const LOADING: FetchState<never> = { loading: true, error: null, data: null };

const QUICK_LINKS = [
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { label: 'YouTube', url: 'https://www.youtube.com' },
  { label: 'ChatGPT', url: 'https://chatgpt.com' },
  { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { label: 'GitHub', url: 'https://github.com' },
  { label: 'Reddit', url: 'https://www.reddit.com' },
];

let tabSeq = 1;

const SERVICES = [
  { id: 'all', label: 'DuckDuckGo' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'github', label: 'GitHub' },
  { id: 'stackoverflow', label: 'Stack Overflow' },
  { id: 'discord', label: 'Discord' },
];

const svcOf = (v: View) => (v.kind === 'results' ? v.service ?? 'all' : 'all');

const titleOf = (v: View): string => {
  switch (v.kind) {
    case 'home':
      return 'New tab';
    case 'results':
      return v.q;
    case 'web':
    case 'reader':
      return hostOf(v.url);
    case 'yt':
      return v.q ? `YouTube — ${v.q}` : 'YouTube';
    case 'ytwatch':
      return v.title ?? 'YouTube';
    case 'chatgpt':
      return 'ChatGPT';
  }
};

const addressOf = (v: View): string => {
  switch (v.kind) {
    case 'home':
      return '';
    case 'results':
      return v.q;
    case 'web':
    case 'reader':
      return v.url;
    case 'yt':
      return 'youtube.com';
    case 'ytwatch':
      return `https://youtu.be/${v.videoId}`;
    case 'chatgpt':
      return 'chatgpt.com';
  }
};

function drop<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...obj };
  delete rest[key];
  return rest;
}

export default function BrowserApp({ windowId }: { windowId: string }) {
  const { windows, openApp } = useWindows();
  const win = windows.find((w) => w.id === windowId);

  const [tabs, setTabs] = useState<Tab[]>(() => {
    const start = (win?.initial as { start?: View } | undefined)?.start;
    return [{ id: tabSeq++, history: [start ?? { kind: 'home' }], cursor: 0 }];
  });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [readers, setReaders] = useState<Record<string, FetchState<ReaderResponse>>>({});
  const [searches, setSearches] = useState<Record<string, FetchState<SearchResponse>>>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sgOpen, setSgOpen] = useState(false);
  const [retrySeq, setRetrySeq] = useState(0);
  const fetchedRef = useRef<Set<string>>(new Set());

  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const view = tab.history[tab.cursor];
  const service = svcOf(view);
  const searchKey = view.kind === 'results' ? `${service}:${view.q}` : '';

  // Load search results once per query + service. DuckDuckGo's own site won't
  // render inside a proxied frame, so results come live from its search API
  // and each result still opens the real page through the tunnel.
  useEffect(() => {
    if (view.kind !== 'results') return;
    const key = `search:${service}:${view.q}`;
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);
    functions
      .post<SearchResponse>('duck-web', { action: 'search', q: view.q, service })
      .then((data) =>
        setSearches((p) => ({ ...p, [`${service}:${view.q}`]: { loading: false, error: null, data } })),
      )
      .catch(() =>
        setSearches((p) => ({
          ...p,
          [`${service}:${view.q}`]: { loading: false, error: 'unreachable', data: null },
        })),
      );
  }, [view, service, retrySeq]);

  // Fetch reader text once per url.
  useEffect(() => {
    if (view.kind !== 'reader') return;
    const key = `read:${view.url}`;
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);
    functions
      .post<ReaderResponse>('duck-web', { action: 'read', url: view.url })
      .then((data) =>
        setReaders((p) => ({ ...p, [view.url]: { loading: false, error: null, data } })),
      )
      .catch(() =>
        setReaders((p) => ({ ...p, [view.url]: { loading: false, error: 'unreachable', data: null } })),
      );
  }, [view, retrySeq]);

  // Keep the address bar in sync with the current view.
  useEffect(() => {
    setInput(addressOf(view));
    setSgOpen(false);
  }, [tab.id, view]);

  // DuckDuckGo autocomplete while typing a search.
  useEffect(() => {
    const t = input.trim();
    if (t.length < 2 || isProbablyUrl(t) || t === addressOf(view)) {
      setSuggestions([]);
      return;
    }
    let alive = true;
    const h = window.setTimeout(() => {
      functions
        .post<SuggestResponse>('duck-web', { action: 'suggest', q: t })
        .then((r) => {
          if (alive) setSuggestions((r?.suggestions ?? []).slice(0, 6));
        })
        .catch(() => {
          if (alive) setSuggestions([]);
        });
    }, 260);
    return () => {
      alive = false;
      window.clearTimeout(h);
    };
  }, [input, view]);

  const navigate = (v: View) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tab.id
          ? { ...t, history: [...t.history.slice(0, t.cursor + 1), v], cursor: t.cursor + 1 }
          : t,
      ),
    );
  };

  const move = (delta: number) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tab.id) return t;
        const next = Math.min(Math.max(t.cursor + delta, 0), t.history.length - 1);
        return { ...t, cursor: next };
      }),
    );
  };

  const openUrl = (raw: string) => {
    const c = classifyUrl(raw);
    if (c.kind === 'youtube') {
      if (c.videoId) navigate({ kind: 'ytwatch', videoId: c.videoId });
      else navigate({ kind: 'yt', q: c.searchQuery ?? '' });
    } else if (c.kind === 'chatgpt') {
      navigate({ kind: 'chatgpt' });
    } else {
      navigate({ kind: 'web', url: raw });
    }
  };

  const goAddress = () => {
    const t = input.trim();
    if (!t) return;
    setSgOpen(false);
    // Anything that isn't an address is a search — live results arrive in the
    // results page; typed addresses load the real site through the tunnel.
    if (isProbablyUrl(t)) openUrl(normalizeUrl(t));
    else navigate({ kind: 'results', q: t });
  };

  const pickSuggestion = (s: string) => {
    setInput(s);
    setSgOpen(false);
    navigate({ kind: 'results', q: s });
  };

  const openDucky = () => openApp('duckyai', 'Ducky AI', 900, 640);

  const newTab = () => {
    const t: Tab = { id: tabSeq++, history: [{ kind: 'home' }], cursor: 0 };
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
  };

  const closeTab = (id: number) => {
    setTabs((prev) => {
      if (prev.length === 1) return [{ id: tabSeq++, history: [{ kind: 'home' }], cursor: 0 }];
      return prev.filter((t) => t.id !== id);
    });
  };

  const retryRead = (url: string) => {
    fetchedRef.current.delete(`read:${url}`);
    setReaders((p) => drop(p, url));
    setRetrySeq((s) => s + 1);
  };

  const retrySearch = (key: string) => {
    fetchedRef.current.delete(`search:${key}`);
    setSearches((p) => drop(p, key));
    setRetrySeq((s) => s + 1);
  };

  const searchState = view.kind === 'results' ? (searches[searchKey] ?? LOADING) : null;

  const navBtn =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="flex h-full flex-col bg-[#0e1120]">
      {/* tab strip */}
      <div className="flex items-end gap-1 bg-[#0b0e1a] px-2 pt-1.5">
        <div className="os-scroll flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const v = t.history[t.cursor];
            const active = t.id === tab.id;
            return (
              <div
                key={t.id}
                className={`group flex min-w-0 max-w-[200px] flex-1 items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs ${
                  active ? 'bg-[#12162a] text-white' : 'bg-white/[0.04] text-white/55 hover:bg-white/[0.08]'
                }`}
              >
                <button
                  onClick={() => setActiveId(t.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={titleOf(v)}
                >
                  {titleOf(v)}
                </button>
                <button
                  onClick={() => closeTab(t.id)}
                  aria-label={`Close tab ${titleOf(v)}`}
                  className="rounded p-0.5 text-white/40 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
          <button
            onClick={newTab}
            aria-label="New tab"
            title="New tab"
            className="mb-0.5 shrink-0 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-1 border-b border-white/[0.07] bg-[#12162a] px-2 py-1.5">
        <button aria-label="Back" disabled={tab.cursor === 0} onClick={() => move(-1)} className={navBtn}>
          <ArrowLeft size={15} />
        </button>
        <button
          aria-label="Forward"
          disabled={tab.cursor >= tab.history.length - 1}
          onClick={() => move(1)}
          className={navBtn}
        >
          <ArrowRight size={15} />
        </button>
        {view.kind === 'web' && (
          <button
            aria-label="Reload"
            onClick={() => setIframeKey((k) => k + 1)}
            className={navBtn}
          >
            <RotateCw size={14} />
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSgOpen(true);
            }}
            onFocus={() => setSgOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goAddress();
              if (e.key === 'Escape') setSgOpen(false);
            }}
            onBlur={() => window.setTimeout(() => setSgOpen(false), 150)}
            placeholder="Search DuckDuckGo or enter address"
            aria-label="Address and search bar"
            spellCheck={false}
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
          />
          {sgOpen && suggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Search suggestions"
              className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#161a2e] shadow-2xl"
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(s);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/75 transition hover:bg-white/[0.06]"
                >
                  <SearchIcon size={11} className="shrink-0 text-white/30" /> {s}
                </button>
              ))}
              <div className="border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-white/30">
                Suggestions from DuckDuckGo
              </div>
            </div>
          )}
        </div>
        {view.kind === 'web' && (
          <button
            aria-label="Reader view"
            title="Reader view — the page as clean text"
            onClick={() => navigate({ kind: 'reader', url: view.url })}
            className={navBtn}
          >
            <BookOpen size={14} />
          </button>
        )}
        {(view.kind === 'web' || view.kind === 'ytwatch') && (
          <a
            href={view.kind === 'web' ? view.url : `https://www.youtube.com/watch?v=${view.videoId}`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open in new tab"
            title="Open in a real browser tab"
            className={navBtn}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* content */}
      <div className="relative min-h-0 flex-1 bg-[#0e1120]">
        {view.kind === 'home' && (
          <HomeView
            onSearch={(q) => navigate({ kind: 'results', q })}
            onOpen={openUrl}
            onDucky={openDucky}
          />
        )}
        {view.kind === 'results' && searchState && (
          <ResultsView
            q={view.q}
            service={service}
            state={searchState}
            onSearch={(q) => navigate({ kind: 'results', q })}
            onOpen={openUrl}
            onService={(s) => navigate({ kind: 'results', q: view.q, service: s })}
            onRetry={() => retrySearch(searchKey)}
          />
        )}
        {view.kind === 'web' && <TunnelFrame url={view.url} key={iframeKey} />}
        {view.kind === 'reader' && (
          <ReaderView
            state={readers[view.url] ?? LOADING}
            url={view.url}
            onRetry={() => retryRead(view.url)}
          />
        )}
        {view.kind === 'yt' && (
          <YtPortalView
            q={view.q}
            onSearch={(q) => navigate({ kind: 'yt', q })}
            onPlay={(videoId, title) => navigate({ kind: 'ytwatch', videoId, title })}
          />
        )}
        {view.kind === 'ytwatch' && <YtWatchView videoId={view.videoId} title={view.title} />}
        {view.kind === 'chatgpt' && <ChatGptView onDucky={openDucky} />}
      </div>
    </div>
  );
}

function HomeView({
  onSearch,
  onOpen,
  onDucky,
}: {
  onSearch: (q: string) => void;
  onOpen: (url: string) => void;
  onDucky: () => void;
}) {
  const [q, setQ] = useState('');
  return (
    <div className="os-scroll flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        <DuckLogo size={64} />
        <div className="text-3xl font-bold tracking-tight">
          <span className="text-[var(--os-accent)]">duck</span>
          <span className="text-white">browser</span>
        </div>
        <div className="text-xs text-white/40">
          The real web through the Scramjet tunnel — search by DuckDuckGo.
        </div>
      </div>
      <div className="relative w-full max-w-lg">
        <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim()) onSearch(q.trim());
          }}
          placeholder="Search the web"
          aria-label="Search the web"
          className="w-full rounded-full border border-white/10 bg-white/[0.05] py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {QUICK_LINKS.map((l) => (
          <button
            key={l.url}
            onClick={() => onOpen(l.url)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/70 transition hover:border-[var(--os-accent)] hover:text-white"
          >
            {l.label}
          </button>
        ))}
        <button
          onClick={onDucky}
          className="flex items-center gap-1.5 rounded-full border border-[var(--os-accent)]/40 bg-[var(--os-accent)]/10 px-3.5 py-1.5 text-xs font-medium text-[var(--os-accent)] transition hover:bg-[var(--os-accent)]/20"
        >
          <Sparkles size={12} /> Ducky AI
        </button>
      </div>
    </div>
  );
}

function ResultsView({
  q,
  service,
  state,
  onSearch,
  onOpen,
  onService,
  onRetry,
}: {
  q: string;
  service: string;
  state: FetchState<SearchResponse>;
  onSearch: (q: string) => void;
  onOpen: (url: string) => void;
  onService: (s: string) => void;
  onRetry: () => void;
}) {
  const [edit, setEdit] = useState(q);
  const d = state.data;
  return (
    <div className="os-scroll h-full overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#0e1120]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="hidden shrink-0 text-sm font-bold sm:block">
            <span className="text-[var(--os-accent)]">duck</span>
            <span className="text-white">search</span>
          </div>
          <div className="relative min-w-0 flex-1">
            <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={edit}
              onChange={(e) => setEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && edit.trim()) onSearch(edit.trim());
              }}
              aria-label="Search DuckDuckGo"
              className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2 pl-8 pr-3 text-xs text-white focus:border-[var(--os-accent)] focus:outline-none"
            />
          </div>
        </div>
        <div className="os-scroll mx-auto mt-2 flex max-w-2xl gap-1.5 overflow-x-auto pb-0.5">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => onService(s.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition ${
                service === s.id
                  ? 'bg-[var(--os-accent)] text-[#17131f]'
                  : 'bg-white/[0.05] text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4">
        {state.loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-white/50">
            <Loader2 size={22} className="animate-spin text-[var(--os-accent)]" />
            <div className="text-sm">Asking the duck…</div>
          </div>
        )}

        {state.error && !state.loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-sm text-white/80">The duck couldn’t reach the search flock.</div>
            <div className="mt-1 text-xs text-white/40">
              The connection may be down — try again in a moment.
            </div>
            <button
              onClick={onRetry}
              className="mt-4 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
            >
              Retry search
            </button>
          </div>
        )}

        {d && !state.loading && (
          <>
            {d.answer && (
              <div className="mb-5 rounded-2xl border border-[var(--os-accent)]/30 bg-[var(--os-accent)]/[0.07] p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--os-accent)]">
                  Quick answer
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-white/85">{d.answer.text}</div>
                {d.answer.url && (
                  <button
                    onClick={() => onOpen(d.answer!.url)}
                    className="mt-2 text-xs text-white/45 underline-offset-2 hover:text-white/80 hover:underline"
                  >
                    {d.answer.source}
                  </button>
                )}
              </div>
            )}
            {d.portal && (
              <div className="mb-5 flex flex-col gap-2.5 rounded-2xl border border-[var(--os-accent)]/30 bg-[var(--os-accent)]/[0.07] p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{d.portal.name}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-white/60">{d.portal.note}</div>
                </div>
                <a
                  href={d.portal.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
                >
                  <ExternalLink size={13} /> Open {d.portal.name}
                </a>
              </div>
            )}
            <div className="flex flex-col">
              {d.results.map((r, i) => (
                <button
                  key={`${r.url}-${i}`}
                  onClick={() => onOpen(r.url)}
                  className="os-hover flex flex-col items-start gap-1 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="text-[11px] text-white/40">{r.host}</span>
                  <span className="text-[15px] leading-snug text-[var(--os-accent)] hover:underline">
                    {r.title}
                  </span>
                  {r.snippet && (
                    <span className="text-xs leading-relaxed text-white/50">{r.snippet.slice(0, 180)}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-white/[0.07] pt-3 text-center text-[11px] text-white/35">
              {service === 'all'
                ? 'Answer & links from DuckDuckGo · articles from Wikipedia'
                : `${SERVICES.find((s) => s.id === service)?.label ?? service} results, fetched live`}
            </div>
            {d.results.length === 0 && (
              <div className="py-10 text-center text-sm text-white/40">No results for “{q}”.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReaderView({
  state,
  url,
  onRetry,
}: {
  state: FetchState<ReaderResponse>;
  url: string;
  onRetry: () => void;
}) {
  const d = state.data;
  return (
    <div className="os-scroll h-full overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-2xl">
        {state.loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-white/50">
            <Loader2 size={22} className="animate-spin text-[var(--os-accent)]" />
            <div className="text-sm">Fetching the page as plain text…</div>
          </div>
        )}

        {state.error && !state.loading && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-sm text-white/80">Couldn’t fetch that page as text.</div>
            <div className="mt-1 text-xs text-white/40">The site may be down or blocking us.</div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={onRetry}
                className="rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
              >
                Retry
              </button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-white/15 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
              >
                Open in new tab
              </a>
            </div>
          </div>
        )}

        {d && !state.loading && (
          <>
            <div className="text-[11px] text-white/40">{hostOf(d.url || url)}</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight text-white">{d.title}</h1>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block text-xs text-[var(--os-accent)] hover:underline"
            >
              Open the original page ↗
            </a>
            <div className="mt-6 flex flex-col gap-4 text-[15px] leading-7 text-white/75">
              {d.text
                .split('\n')
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function YtPortalView({
  q,
  onSearch,
  onPlay,
}: {
  q: string;
  onSearch: (q: string) => void;
  onPlay: (videoId: string, title?: string) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: YtSearchResponse | null }>(
    { loading: q.trim().length > 0, error: null, data: null },
  );
  const [seq, setSeq] = useState(0);
  const [edit, setEdit] = useState(q);

  useEffect(() => setEdit(q), [q]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    let alive = true;
    setState({ loading: true, error: null, data: null });
    functions
      .post<YtSearchResponse>('duck-web', { action: 'yt', q: query })
      .then((d) => alive && setState({ loading: false, error: null, data: d }))
      .catch(() => alive && setState({ loading: false, error: 'unreachable', data: null }));
    return () => {
      alive = false;
    };
  }, [q, seq]);

  return (
    <div className="os-scroll h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/[0.07] bg-[#0e1120]/95 px-4 py-3 backdrop-blur">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="flex h-6 w-9 items-center justify-center rounded-md bg-[#ff0000]">
            <YoutubeIcon size={14} className="text-white" />
          </span>
          <span className="hidden text-sm font-bold text-white sm:block">YouTube</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && edit.trim()) onSearch(edit.trim());
            }}
            aria-label="Search YouTube"
            placeholder="Search YouTube — videos play right here"
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2 pl-8 pr-3 text-xs text-white focus:border-[var(--os-accent)] focus:outline-none"
          />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-4">
        {state.loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-white/50">
            <Loader2 size={22} className="animate-spin text-[var(--os-accent)]" />
            <div className="text-sm">Waddling through YouTube…</div>
          </div>
        )}

        {!state.loading && !q.trim() && (
          <div className="py-14 text-center">
            <div className="text-sm text-white/70">Search YouTube and watch without leaving the OS.</div>
            <div className="mt-1 text-xs text-white/40">
              Every video opens in the OS player — school-blocked or not, it streams from YouTube’s player.
            </div>
          </div>
        )}

        {state.error && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-sm text-white/80">YouTube search hiccupped.</div>
            <div className="mt-1 text-xs text-white/40">Give it another go — or pop out to YouTube.</div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setSeq((s) => s + 1)}
                className="rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
              >
                Retry
              </button>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-white/15 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
              >
                Open YouTube
              </a>
            </div>
          </div>
        )}

        {state.data && state.data.unavailable && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-sm text-white/80">YouTube wouldn’t hand over search results this time.</div>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2 text-xs text-white/80 transition hover:bg-white/10"
            >
              <ExternalLink size={13} /> Search on YouTube directly
            </a>
          </div>
        )}

        {state.data && !state.data.unavailable && state.data.videos.length === 0 && (
          <div className="py-10 text-center text-sm text-white/40">No videos for “{q}”.</div>
        )}

        {state.data && !state.data.unavailable && state.data.videos.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {state.data.videos.map((v) => (
              <button
                key={v.id}
                onClick={() => onPlay(v.id, v.title)}
                className="os-hover flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] text-left transition hover:border-[var(--os-accent)]/50"
              >
                <div className="relative aspect-video w-full bg-black/40">
                  {v.thumb && (
                    <img
                      src={v.thumb}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {v.length && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {v.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 p-2.5">
                  <span className="line-clamp-2 text-xs font-semibold leading-snug text-white">{v.title}</span>
                  <span className="truncate text-[11px] text-white/45">
                    {v.channel}
                    {v.views ? ` · ${v.views}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function YtWatchView({ videoId, title }: { videoId: string; title?: string }) {
  return (
    <div className="flex h-full flex-col bg-black">
      {title && (
        <div className="shrink-0 truncate border-b border-white/[0.06] px-3 py-1.5 text-xs text-white/70">
          {title}
        </div>
      )}
      <iframe
        key={videoId}
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
        title={title ?? 'YouTube video'}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        className="min-h-0 w-full flex-1 border-0"
      />
    </div>
  );
}

function ChatGptView({ onDucky }: { onDucky: () => void }) {
  return (
    <div className="os-scroll flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-center">
      <div className="flex items-center gap-2.5">
        <MessageSquareText size={22} className="text-[var(--os-accent)]" />
        <span className="text-xl font-bold text-white">ChatGPT</span>
      </div>
      <p className="max-w-md text-sm leading-relaxed text-white/60">
        OpenAI locks chatgpt.com to its own tab, so it can’t appear inside the OS. Two ways to keep
        quacking:
      </p>
      <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
        <button
          onClick={onDucky}
          className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--os-accent)]/40 bg-[var(--os-accent)]/10 p-5 transition hover:bg-[var(--os-accent)]/20"
        >
          <Sparkles size={22} className="text-[var(--os-accent)]" />
          <span className="text-sm font-semibold text-white">Ducky AI</span>
          <span className="text-[11px] leading-snug text-white/55">
            The OS’s own assistant — right here, no new tab
          </span>
        </button>
        <a
          href="https://chatgpt.com/"
          target="_blank"
          rel="noreferrer noopener"
          className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.03] p-5 transition hover:bg-white/[0.07]"
        >
          <ExternalLink size={22} className="text-white/70" />
          <span className="text-sm font-semibold text-white">Real ChatGPT</span>
          <span className="text-[11px] leading-snug text-white/55">Opens chatgpt.com in a new tab</span>
        </a>
      </div>
    </div>
  );
}
