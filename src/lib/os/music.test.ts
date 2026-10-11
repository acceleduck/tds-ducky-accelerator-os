import { describe, expect, it } from 'vitest';
import { parseMusicLink, spotifyEmbedUrl, youtubeEmbedUrl } from './music';

// @kliv-spec-derived — from user intent: "listen to music from youtube or paste a spotify link"
describe('parseMusicLink', () => {
  it('parses youtube watch links', () => {
    expect(parseMusicLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      id: 'dQw4w9WgXcQ',
      label: 'YouTube video',
    });
  });

  it('parses youtu.be, shorts, embed and music.youtube links', () => {
    expect(parseMusicLink('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    expect(parseMusicLink('https://www.youtube.com/shorts/abcDEF12345')?.id).toBe('abcDEF12345');
    expect(parseMusicLink('https://www.youtube.com/embed/kJQP7kiw5Fk')?.id).toBe('kJQP7kiw5Fk');
    expect(parseMusicLink('https://music.youtube.com/watch?v=kJQP7kiw5Fk')?.id).toBe('kJQP7kiw5Fk');
  });

  it('parses playlist-only links and prefers the video when both exist', () => {
    expect(parseMusicLink('https://www.youtube.com/playlist?list=PLxyz_abc-123')?.id).toBe('list:PLxyz_abc-123');
    expect(parseMusicLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz')?.id).toBe('dQw4w9WgXcQ');
  });

  it('accepts a bare 11-char video id', () => {
    expect(parseMusicLink('dQw4w9WgXcQ')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', label: 'YouTube video' });
  });

  it('parses spotify links including intl and uri forms', () => {
    expect(parseMusicLink('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toEqual({
      kind: 'spotify',
      id: 'track:4uLU6hMCjMI75M1A2tKUQC',
      label: 'Spotify track',
    });
    expect(parseMusicLink('https://open.spotify.com/intl-de/album/abc123XYZ')?.id).toBe('album:abc123XYZ');
    expect(parseMusicLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')?.id).toBe('playlist:37i9dQZF1DXcBWIGoYBM5M');
  });

  it('rejects anything that is not a music link', () => {
    expect(parseMusicLink('hello world')).toBeNull();
    expect(parseMusicLink('https://example.com/foo')).toBeNull();
    expect(parseMusicLink('')).toBeNull();
  });
});

describe('embed urls', () => {
  it('builds youtube video and playlist embeds', () => {
    expect(youtubeEmbedUrl('abc12345678')).toBe('https://www.youtube.com/embed/abc12345678');
    expect(youtubeEmbedUrl('list:PL1')).toBe('https://www.youtube.com/embed/videoseries?list=PL1');
  });

  it('builds spotify embeds', () => {
    expect(spotifyEmbedUrl('track:xyz')).toBe('https://open.spotify.com/embed/track/xyz');
  });
});
