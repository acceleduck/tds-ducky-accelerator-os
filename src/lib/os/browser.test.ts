import { describe, it, expect } from 'vitest';
import {
  classifyUrl,
  ddgSearchUrl,
  hostOf,
  isProbablyUrl,
  normalizeUrl,
  tunnelUrl,
} from './browser';

// @kliv-spec-derived — from user intent: "the browser supports DuckDuckGo" —
// typed words must search, typed addresses must navigate.
describe('address bar intent', () => {
  it('treats domain-like input as an address', () => {
    expect(isProbablyUrl('crazygames.com')).toBe(true);
    expect(isProbablyUrl('https://itch.io/games/html5')).toBe(true);
    expect(isProbablyUrl('www.crazygames.com/embed/smash-karts')).toBe(true);
  });

  it('treats sentences as searches', () => {
    expect(isProbablyUrl('best duck games')).toBe(false);
    expect(isProbablyUrl('what is a proxy')).toBe(false);
    expect(isProbablyUrl('')).toBe(false);
  });

  it('adds https:// to bare domains but keeps http for localhost', () => {
    expect(normalizeUrl('crazygames.com/embed/smash-karts')).toBe(
      'https://crazygames.com/embed/smash-karts',
    );
    expect(normalizeUrl('http://localhost:5173')).toBe('http://localhost:5173');
    expect(normalizeUrl('https://duckduckgo.com')).toBe('https://duckduckgo.com');
  });

  it('pretty-prints hostnames', () => {
    expect(hostOf('https://www.en.wikipedia.org/wiki/Duck')).toBe('en.wikipedia.org');
    expect(hostOf('not a url')).toBe('not a url');
  });
});

// @kliv-spec-derived — from user intent: "just use DuckDuckGo — the real site,
// not a custom engine" — searches must open the actual duckduckgo.com address,
// and every page must be wrapped so it loads through the tunnel.
describe('real DuckDuckGo + tunnel addressing', () => {
  it('builds the actual duckduckgo.com results address for a search', () => {
    expect(ddgSearchUrl('github proxy')).toBe('https://duckduckgo.com/?q=github%20proxy');
    expect(ddgSearchUrl('ducks')).toBe('https://duckduckgo.com/?q=ducks');
  });

  it('wraps any page address so it loads through the tunnel, tagged with this site’s address', () => {
    const out = tunnelUrl('https://github.com/org/repo');
    expect(
      out.startsWith('/api/v2/function/scramjet-tunnel?url=https%3A%2F%2Fgithub.com%2Forg%2Frepo'),
    ).toBe(true);
    // The tag is what keeps rewritten links off an unreachable internal
    // address — the "localhost refused to connect" failure.
    expect(out).toContain(`&self=${encodeURIComponent(window.location.origin)}`);
  });

  // @kliv-spec-derived — from user intent: "typed searches must show real
  // results" — the page's scripts read the query from the address, so it must
  // stay visible even when wrapped for the tunnel.
  it('keeps the page’s own query visible so site scripts can read it', () => {
    const out = tunnelUrl('https://duckduckgo.com/?q=hello');
    expect(out).toContain('url=https%3A%2F%2Fduckduckgo.com%2F%3Fq%3Dhello');
    expect(out).toContain('&q=hello');
  });
});

// @kliv-spec-derived — from user intent: "make sure youtube and chatgpt work" —
// their links must land in the in-OS experiences, everything else on the plain web.
describe('special sites', () => {
  it('sends YouTube watch links to the in-OS player', () => {
    expect(classifyUrl('https://www.youtube.com/watch?v=abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
    });
    expect(classifyUrl('https://youtu.be/abc123')).toEqual({ kind: 'youtube', videoId: 'abc123' });
    expect(classifyUrl('https://www.youtube.com/shorts/abc123')).toEqual({
      kind: 'youtube',
      videoId: 'abc123',
    });
  });

  it('sends YouTube searches and the home page to the portal', () => {
    expect(classifyUrl('https://www.youtube.com')).toEqual({
      kind: 'youtube',
      searchQuery: undefined,
    });
    expect(classifyUrl('https://www.youtube.com/results?search_query=ducks')).toEqual({
      kind: 'youtube',
      searchQuery: 'ducks',
    });
  });

  it('sends ChatGPT addresses to the ChatGPT page', () => {
    expect(classifyUrl('https://chatgpt.com/')).toEqual({ kind: 'chatgpt' });
    expect(classifyUrl('https://chat.openai.com/chat')).toEqual({ kind: 'chatgpt' });
  });

  it('leaves every other site on the plain web', () => {
    expect(classifyUrl('https://github.com')).toEqual({ kind: 'web' });
    expect(classifyUrl('https://youtube.example.com/watch?v=x')).toEqual({ kind: 'web' });
  });
});
