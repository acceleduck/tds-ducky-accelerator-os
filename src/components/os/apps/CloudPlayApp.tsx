import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Cloud, ExternalLink, Gamepad2, Loader2, Plus, Trash2, Zap } from 'lucide-react';
import db from '@/lib/shared/kliv-database.js';
import functions from '@/lib/shared/kliv-functions.js';
import { useAuth } from '@/hooks/useAuth';
import { useProxySession } from '@/hooks/useProxySession';
import { TunnelFrame } from '../TunnelFrame';
import { hostOf } from '@/lib/os/browser';
import type { ProbeResponse } from '@/lib/os/browser';

interface EmbedGame {
  id: string;
  name: string;
  emoji: string;
  url: string;
  note: string;
  multiplayer?: boolean;
}

// Games verified to actually play inside the OS (each URL was tested to allow embedding).
const EMBED_GAMES: EmbedGame[] = [
  {
    id: 'smash-karts',
    name: 'Smash Karts',
    emoji: '🏎️',
    url: 'https://games.crazygames.com/en_US/smash-karts/index.html?v=2.11',
    note: 'Kart arena battles',
    multiplayer: true,
  },
  {
    id: 'paper-io-2',
    name: 'Paper.io 2',
    emoji: '📄',
    url: 'https://games.crazygames.com/en_US/paper-io-2/index.html?v=2.11',
    note: 'Claim the map',
  },
  {
    id: 'narrow-one',
    name: 'Narrow One',
    emoji: '🏹',
    url: 'https://games.crazygames.com/en_US/narrow-one/index.html?v=2.11',
    note: 'Castle-capture archery',
    multiplayer: true,
  },
  {
    id: 'basket-random',
    name: 'Basket Random',
    emoji: '🏀',
    url: 'https://games.crazygames.com/en_US/basket-random/index.html?v=2.11',
    note: 'Wobbly hoops',
  },
  {
    id: 'bullet-force',
    name: 'Bullet Force',
    emoji: '🔫',
    url: 'https://games.crazygames.com/en_US/bullet-force-multiplayer/index.html?v=2.11',
    note: 'Multiplayer FPS',
    multiplayer: true,
  },
  {
    id: 'deadshot-io',
    name: 'DEADSHOT.io',
    emoji: '🎯',
    url: 'https://games.crazygames.com/en_US/deadshot-io/index.html',
    note: 'Crosshair-to-crosshair multiplayer',
    multiplayer: true,
  },
  {
    id: 'voxiom-io',
    name: 'Voxiom.io',
    emoji: '🧱',
    url: 'https://games.crazygames.com/en_US/voxiom-io/index.html',
    note: 'Minecraft-style battle royale',
    multiplayer: true,
  },
  {
    id: 'eggy-car',
    name: 'Eggy Car',
    emoji: '🥚',
    url: 'https://games.crazygames.com/en_US/eggy-car/index.html?v=2.11',
    note: 'Don’t crack the egg',
  },
];

interface Portal {
  id: string;
  name: string;
  emoji: string;
  url: string;
  site: string;
  note: string;
}

const PORTALS: Portal[] = [
  {
    id: 'roblox',
    name: 'Roblox',
    emoji: '🟥',
    url: 'https://now.gg/play/roblox-corporation/5349/roblox',
    site: 'now.gg',
    note: 'Roblox streamed from the cloud — no install needed',
  },
  {
    id: 'crazygames',
    name: 'CrazyGames',
    emoji: '🎮',
    url: 'https://www.crazygames.com/',
    site: 'crazygames.com',
    note: 'Thousands of free browser games',
  },
  {
    id: 'poki',
    name: 'Poki',
    emoji: '🕹️',
    url: 'https://poki.com/',
    site: 'poki.com',
    note: 'Quick casual games, no downloads',
  },
  {
    id: 'itch',
    name: 'itch.io',
    emoji: '🦆',
    url: 'https://itch.io/games/html5',
    site: 'itch.io',
    note: 'Indie HTML5 games — grab a game’s Embed link to add it to the arcade',
  },
];

interface SavedGame {
  _row_id: number;
  _created_by: string | null;
  title: string;
  url: string;
  platform: string;
  embeddable: number;
}

function platformOf(url: string): string {
  const h = hostOf(url);
  if (h.includes('crazygames')) return 'CrazyGames';
  if (h.includes('itch')) return 'itch.io';
  return h;
}

export default function CloudPlayApp() {
  const { user } = useAuth();
  const { status: proxyStatus } = useProxySession();
  const [section, setSection] = useState<'arcade' | 'portals'>('arcade');
  const [playing, setPlaying] = useState<{ name: string; url: string; tunnel: boolean } | null>(null);
  const [saved, setSaved] = useState<SavedGame[]>([]);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await db.query<SavedGame>('game_embeds', { order: '_created_at.desc', limit: '50' });
      setSaved(rows);
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addGame = async () => {
    const raw = addUrl.trim();
    if (!raw || adding) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setAdding(true);
    setAddMsg(null);
    try {
      const probe = await functions.post<ProbeResponse>('duck-web', { action: 'probe', url });
      const fallbackTitle = hostOf(probe.url || url);
      const title =
        probe.title && !/game files/i.test(probe.title) && probe.title !== fallbackTitle
          ? probe.title
          : fallbackTitle;
      await db.insertOne('game_embeds', {
        title,
        url: probe.url || url,
        platform: platformOf(probe.url || url),
        embeddable: probe.embeddable ? 1 : 0,
      });
      setAddUrl('');
      setAddMsg(
        probe.embeddable
          ? `Added ${title} — it plays right here in the OS.`
          : `Added ${title} as a pop-out link (that site refuses to play inside other apps).`,
      );
      await load();
    } catch {
      setAddMsg('Could not check that address — is it a valid game URL?');
    } finally {
      setAdding(false);
    }
  };

  const removeGame = async (row: SavedGame) => {
    try {
      await db.delete('game_embeds', { _row_id: `eq.${row._row_id}` });
    } catch {
      // not yours to remove — the refresh below settles it
    }
    await load();
  };

  if (playing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0b0e1a] px-3 py-2">
          <button
            onClick={() => setPlaying(null)}
            aria-label="Back to arcade"
            className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10"
          >
            <ArrowLeft size={13} /> Arcade
          </button>
          <div className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80">{playing.name}</div>
          {proxyStatus === 'connected' ? (
            <button
              onClick={() => setPlaying((p) => (p ? { ...p, tunnel: !p.tunnel } : p))}
              aria-label="Toggle Scramjet tunnel loading"
              title={
                playing.tunnel
                  ? 'Loaded through your Scramjet tunnel — click to go direct'
                  : 'Loaded direct — click to ride the Scramjet tunnel'
              }
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                playing.tunnel
                  ? 'bg-[var(--os-accent)] text-[#17131f]'
                  : 'border border-white/15 text-white/85 hover:bg-white/10'
              }`}
            >
              <Zap size={13} /> {playing.tunnel ? 'Scramjet' : 'Direct'}
            </button>
          ) : (
            <span
              title="Connect a Scramjet tunnel in Proxy Manager to load blocked games through it"
              className="hidden items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/35 sm:flex"
            >
              <Zap size={13} /> Scramjet off
            </span>
          )}
          <a
            href={playing.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/10"
          >
            <ExternalLink size={13} /> Pop out
          </a>
        </div>
        {playing.tunnel ? (
          <TunnelFrame url={playing.url} title={playing.name} />
        ) : (
          <iframe
            src={playing.url}
            title={playing.name}
            className="min-h-0 w-full flex-1 border-0 bg-black"
            allow="fullscreen; autoplay; gamepad; pointer-lock"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock allow-downloads"
          />
        )}
      </div>
    );
  }

  const tabCls = (active: boolean) =>
    `flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
      active ? 'bg-[var(--os-accent)] text-[#17131f]' : 'bg-white/[0.05] text-white/70 hover:bg-white/10'
    }`;

  return (
    <div className="os-scroll h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-[#0b0e1a]/95 px-3 py-2 backdrop-blur">
        <div className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/45">
          <Cloud size={13} className="text-[var(--os-accent)]" /> CloudPlay
        </div>
        <button onClick={() => setSection('arcade')} className={tabCls(section === 'arcade')}>
          <Gamepad2 size={13} /> Embed Arcade
        </button>
        <button onClick={() => setSection('portals')} className={tabCls(section === 'portals')}>
          <Cloud size={13} /> Cloud portals
        </button>
      </div>

      {section === 'arcade' ? (
        <div className="p-4">
          <div className="text-sm text-white/60">
            These games play <b className="text-white/85">right inside the OS</b> — no new tab, no
            install. Multiplayer ones (marked{' '}
            <b className="text-emerald-300">MP</b>) connect to their own live servers once loaded. On
            a locked-down Chromebook, connect the <b className="text-white/85">Scramjet tunnel</b> in
            Proxy Manager and flip a game to “Scramjet” so it loads through your tunnel.
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Plus size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGame()}
                placeholder="Add any game by URL — we test whether it can play inside the OS"
                aria-label="Add a game by URL"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
              />
            </div>
            <button
              onClick={addGame}
              disabled={adding || !addUrl.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
            >
              {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add game
            </button>
          </div>
          {addMsg && <div className="mt-2 text-xs text-white/50">{addMsg}</div>}

          <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Pond picks
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EMBED_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setPlaying({ name: g.name, url: g.url, tunnel: proxyStatus === 'connected' })}
                className="os-hover flex flex-col items-start gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition hover:border-[var(--os-accent)]/50"
              >
                <span className="text-2xl">{g.emoji}</span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {g.name}
                  {g.multiplayer && (
                    <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                      MP
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-white/45">{g.note}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Saved by the flock
          </div>
          {saved.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-dashed border-white/10 px-3 py-4 text-xs text-white/35">
              Nothing saved yet — paste a game URL above (CrazyGames or an itch.io embed link work best).
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {saved.map((g) => (
                <div
                  key={g._row_id}
                  className="relative flex min-h-[76px] flex-col items-start gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3"
                >
                  {g.embeddable ? (
                    <button
                      onClick={() => setPlaying({ name: g.title, url: g.url, tunnel: proxyStatus === 'connected' })}
                      className="os-hover min-h-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-white">{g.title}</span>
                    </button>
                  ) : (
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex min-h-0 flex-1 items-center gap-1.5 text-sm font-semibold text-[var(--os-accent)] hover:underline"
                    >
                      <span className="truncate">{g.title}</span> <ExternalLink size={11} />
                    </a>
                  )}
                  <span className="text-[11px] text-white/45">
                    {g.platform}
                    {g.embeddable ? ' · plays inside' : ' · pop-out only'}
                  </span>
                  {g._created_by === user?.userUuid && (
                    <button
                      onClick={() => removeGame(g)}
                      aria-label={`Remove ${g.title}`}
                      className="absolute right-2 top-2 rounded-lg p-1 text-white/30 transition hover:bg-red-500/15 hover:text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-xs leading-relaxed text-white/45">
            Roblox and now.gg refuse to play inside other apps entirely, so they live under{' '}
            <b className="text-white/75">Cloud portals</b> as pop-outs. Many sites are the same way — that’s
            why every URL you add gets tested, and the ones that can’t embed are marked pop-out only.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
          {PORTALS.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{p.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{p.name}</div>
                  <div className="text-[11px] leading-snug text-white/45">{p.note}</div>
                </div>
              </div>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                <ExternalLink size={13} /> Open {p.site} in a new tab
              </a>
            </div>
          ))}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-xs leading-relaxed text-white/45 sm:col-span-2">
            These portals block being shown inside other apps (their rule, not ours), so they open in a real
            browser tab. Want a game to live inside the OS instead? Add its URL in{' '}
            <b className="text-white/75">Embed Arcade</b>.
          </div>
        </div>
      )}
    </div>
  );
}
