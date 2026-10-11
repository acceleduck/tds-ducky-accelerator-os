import { useCallback, useEffect, useRef, useState } from 'react';
import db from '@/lib/shared/kliv-database.js';
import { toast } from 'sonner';
import { ListMusic, Music2, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from 'lucide-react';
import { parseMusicLink, spotifyEmbedUrl, spotifyWatchUrl } from '@/lib/os/music';

interface Track {
  _row_id: number;
  kind: 'youtube' | 'spotify';
  source_id: string;
  title: string;
  _created_at: number;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  loadPlaylist(opts: { list: string }): void;
  getVideoData(): { title?: string };
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytPromise: Promise<YTNamespace> | null = null;
function loadYT(): Promise<YTNamespace> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytPromise;
}

export default function PlaylistApp() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;
  const currentRef = useRef<number | null>(null);
  currentRef.current = current;
  const nextRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    try {
      const rows = await db.query<Track>('playlist_tracks', { order: '_created_at.asc', limit: '200' });
      setTracks(rows);
    } catch {
      toast.error('Could not load your playlist');
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      try {
        playerRef.current?.destroy();
      } catch {
        // player already gone
      }
      playerRef.current = null;
    };
  }, [refresh]);

  const currentTrack = tracks.find((t) => t._row_id === current) ?? null;

  const startTrack = useCallback((track: Track) => {
    setCurrent(track._row_id);
    if (track.kind === 'spotify') {
      playerRef.current?.pauseVideo();
      setPlaying(false);
      return;
    }
    void loadYT().then((YT) => {
      const host = ytHostRef.current;
      if (!host) return;
      const load = (p: YTPlayer) => {
        if (track.source_id.startsWith('list:')) p.loadPlaylist({ list: track.source_id.slice(5) });
        else p.loadVideoById(track.source_id);
        p.playVideo();
      };
      if (!playerRef.current) {
        playerRef.current = new YT.Player(host, {
          width: '100%',
          height: '100%',
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              const p = playerRef.current;
              if (p) load(p);
            },
            onStateChange: (e: { data: number }) => {
              const p = playerRef.current;
              if (!p) return;
              if (e.data === 1) {
                setPlaying(true);
                // backfill the real title from the player
                const data = p.getVideoData();
                if (data?.title) {
                  const title = data.title;
                  const row = tracksRef.current.find((t) => t._row_id === currentRef.current);
                  if (row && row.kind === 'youtube' && row.title !== title) {
                    setTracks((list) => list.map((t) => (t._row_id === row._row_id ? { ...t, title } : t)));
                    void db
                      .updateOne('playlist_tracks', { _row_id: `eq.${row._row_id}` }, { title })
                      .catch(() => {});
                  }
                }
              }
              if (e.data === 2) setPlaying(false);
              if (e.data === 0) nextRef.current();
            },
          },
        });
      } else {
        load(playerRef.current);
      }
    });
  }, []);

  const next = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return;
    const idx = list.findIndex((t) => t._row_id === currentRef.current);
    startTrack(list[(idx + 1) % list.length]);
  }, [startTrack]);
  nextRef.current = next;

  const prev = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return;
    const idx = list.findIndex((t) => t._row_id === currentRef.current);
    startTrack(list[(idx - 1 + list.length) % list.length]);
  }, [startTrack]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || currentTrack?.kind !== 'youtube') return;
    if (playing) {
      p.pauseVideo();
      setPlaying(false);
    } else {
      p.playVideo();
      setPlaying(true);
    }
  };

  const addTrack = async () => {
    const parsed = parseMusicLink(input);
    if (!parsed) {
      setErr('Paste a YouTube link (video or playlist) or a Spotify track / album / playlist link');
      return;
    }
    setErr(null);
    let title = parsed.label;
    if (parsed.kind === 'spotify') {
      try {
        const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyWatchUrl(parsed.id))}`);
        if (res.ok) {
          const j = (await res.json()) as { title?: string };
          if (j.title) title = j.title;
        }
      } catch {
        // keep the plain label
      }
    }
    try {
      const row = await db.insertOne<Track>('playlist_tracks', { kind: parsed.kind, source_id: parsed.id, title });
      setInput('');
      await refresh();
      toast.success('Added to Duck Beats 🎵');
      if (!currentRef.current && row) startTrack(row);
    } catch {
      toast.error('Could not save that track');
    }
  };

  const removeTrack = async (id: number) => {
    try {
      await db.deleteOne('playlist_tracks', { _row_id: `eq.${id}` });
    } catch {
      toast.error('Could not remove that track');
    }
    if (currentRef.current === id) {
      playerRef.current?.pauseVideo();
      setCurrent(null);
      setPlaying(false);
    }
    await refresh();
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-lg">
          <Music2 size={17} className="text-white" />
        </span>
        <div>
          <div className="text-sm font-bold text-white">Duck Beats</div>
          <div className="text-[11px] text-white/45">Your playlist — YouTube &amp; Spotify links, saved to your account</div>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addTrack();
          }}
          placeholder="Paste a YouTube or Spotify link…"
          aria-label="Paste a music link"
          className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
        />
        <button
          onClick={() => void addTrack()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-3.5 text-xs font-semibold text-[#17131f] transition hover:brightness-110"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {err && <div className="text-[11px] text-rose-300">{err}</div>}

      {/* player */}
      <div>
        <div
          className={
            currentTrack?.kind === 'spotify'
              ? 'hidden'
              : 'relative aspect-video w-full overflow-hidden rounded-xl bg-black'
          }
        >
          <div ref={ytHostRef} className="absolute inset-0" />
        </div>
        {currentTrack?.kind === 'spotify' && (
          <iframe
            key={currentTrack._row_id}
            title="Spotify player"
            src={`${spotifyEmbedUrl(currentTrack.source_id)}?utm_source=generator&theme=0`}
            className="w-full rounded-xl border-0"
            height={/^(track|episode):/.test(currentTrack.source_id) ? 152 : 352}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        )}
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={prev}
            title="Previous"
            aria-label="Previous track"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-white/80 transition hover:bg-white/15"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={togglePlay}
            disabled={currentTrack?.kind !== 'youtube'}
            title="Play / pause"
            aria-label="Play or pause"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--os-accent)] text-[#17131f] transition hover:brightness-110 disabled:opacity-40"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={next}
            title="Next"
            aria-label="Next track"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-white/80 transition hover:bg-white/15"
          >
            <SkipForward size={14} />
          </button>
          <div className="ml-1 min-w-0 flex-1 truncate text-xs text-white/70">
            {currentTrack ? currentTrack.title : 'Nothing playing — pick a track below'}
          </div>
          {currentTrack?.kind === 'spotify' && (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              tap ▶ on the Spotify card
            </span>
          )}
        </div>
      </div>

      {/* playlist */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          <ListMusic size={12} className="text-[var(--os-accent)]" /> Playlist · {tracks.length}
        </div>
        <div className="os-scroll min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10">
          {tracks.length === 0 ? (
            <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 p-6 text-center">
              <div className="text-2xl">🦆🎵</div>
              <div className="text-xs text-white/50">
                Paste a YouTube or Spotify link above and it lands here — then click any track to play it.
              </div>
            </div>
          ) : (
            tracks.map((t) => (
              <div
                key={t._row_id}
                className={`flex items-center gap-2 px-3 py-2 ${t._row_id === current ? 'bg-[var(--os-accent)]/15' : 'odd:bg-white/[0.03]'}`}
              >
                <button onClick={() => startTrack(t)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title="Play">
                  <span className={`text-xs ${t.kind === 'youtube' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {t.kind === 'youtube' ? '▶' : '🎵'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-white/85">{t.title}</span>
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/40">
                    {t.kind === 'youtube' ? 'YT' : 'Spotify'}
                  </span>
                </button>
                <button
                  onClick={() => void removeTrack(t._row_id)}
                  title="Remove"
                  aria-label={`Remove ${t.title}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/35 transition hover:bg-red-500/20 hover:text-red-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="mt-1.5 text-[10px] leading-relaxed text-white/30">
          YouTube tracks play the real video right here and auto-advance when one ends. Spotify plays through
          Spotify&apos;s own card — a free account gets previews, Premium plays full songs.
        </div>
      </div>
    </div>
  );
}
