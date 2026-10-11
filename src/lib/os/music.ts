export interface ParsedMusic {
  kind: 'youtube' | 'spotify';
  /** YouTube: video id or `list:<playlistId>`. Spotify: `<type>:<id>`. */
  id: string;
  label: string;
}

/**
 * Accepts (practically) any YouTube link — watch, youtu.be, shorts, embed,
 * music.youtube.com, playlist-only or a bare 11-char id — and Spotify links —
 * open.spotify.com (incl. /intl-xx/), or spotify: uri form.
 */
export function parseMusicLink(input: string): ParsedMusic | null {
  const t = input.trim();
  if (!t) return null;

  const sp =
    t.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/) ??
    t.match(/^spotify:(track|album|playlist|episode):([A-Za-z0-9]+)$/);
  if (sp) return { kind: 'spotify', id: `${sp[1]}:${sp[2]}`, label: `Spotify ${sp[1]}` };

  const vid = t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (vid) return { kind: 'youtube', id: vid[1], label: 'YouTube video' };

  const list = t.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (list) return { kind: 'youtube', id: `list:${list[1]}`, label: 'YouTube playlist' };

  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return { kind: 'youtube', id: t, label: 'YouTube video' };

  return null;
}

export function youtubeEmbedUrl(id: string) {
  return id.startsWith('list:')
    ? `https://www.youtube.com/embed/videoseries?list=${id.slice(5)}`
    : `https://www.youtube.com/embed/${id}`;
}

export function spotifyEmbedUrl(id: string) {
  const [type, sid] = id.split(':');
  return `https://open.spotify.com/embed/${type}/${sid}`;
}

export function spotifyWatchUrl(id: string) {
  const [type, sid] = id.split(':');
  return `https://open.spotify.com/${type}/${sid}`;
}
