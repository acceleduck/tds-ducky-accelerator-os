import { describe, it, expect } from 'vitest';
import { wallpaperStyle } from './useSettings';

// @kliv-spec-derived — from user intent: "custom background compatibility" —
// presets keep their CSS classes; custom images must render as an inline style,
// honoring the chosen fit, and fall back cleanly when unset.
describe('custom wallpaper style', () => {
  const base = {
    accent: 'ddg',
    wallpaper: 'custom',
    customWallpaper: '/content/wallpapers/pond.png',
    wallpaperFit: 'cover' as const,
    proxyEndpoint: 'wss://wisp.mercurywork.shop/',
    callRingtone: 'quack',
  };

  it('renders a custom wallpaper as a cover background', () => {
    expect(wallpaperStyle(base)).toEqual({
      backgroundImage: 'url("/content/wallpapers/pond.png")',
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
    });
  });

  it('tiles when fit is tile', () => {
    expect(wallpaperStyle({ ...base, wallpaperFit: 'tile' })).toMatchObject({
      backgroundRepeat: 'repeat',
      backgroundSize: 'auto',
    });
  });

  it('returns null for presets and empty custom images', () => {
    expect(wallpaperStyle({ ...base, wallpaper: 'bloom' })).toBeNull();
    expect(wallpaperStyle({ ...base, customWallpaper: '' })).toBeNull();
  });

  it('accepts external image links too', () => {
    const s = wallpaperStyle({ ...base, customWallpaper: 'https://picsum.photos/1920/1080' });
    expect(s?.backgroundImage).toContain('picsum.photos');
  });
});
