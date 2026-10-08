import { describe, it, expect } from 'vitest';
import { formatDuration, formatMb, formatMbps } from './format';

describe('format helpers', () => {
  it('formats megabytes into MB and GB', () => {
    expect(formatMb(0)).toBe('0 MB');
    expect(formatMb(843)).toBe('843 MB');
    expect(formatMb(1536)).toBe('1.5 GB');
    expect(formatMb(204800)).toBe('200 GB');
  });

  it('formats durations as clock time', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(32000)).toBe('00:32');
    expect(formatDuration(65000)).toBe('01:05');
    expect(formatDuration(3661000)).toBe('1:01:01');
  });

  it('formats mbps compactly', () => {
    expect(formatMbps(87.34)).toBe('87.3');
    expect(formatMbps(342.6)).toBe('343');
  });
});
