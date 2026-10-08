import { describe, it, expect } from 'vitest';
import { fileKind, fileName, fileExt, isRunnable, fileProblem, stampName } from './files';

// @kliv-spec-derived — from user intent: "run your eaglercraft file … by putting it in the file system"
describe('fileKind + isRunnable', () => {
  it('marks .html and .htm files runnable, everything else not', () => {
    expect(isRunnable('/content/files/eaglercraft.html')).toBe(true);
    expect(isRunnable('/content/files/game.htm')).toBe(true);
    expect(isRunnable('/content/files/photo.png')).toBe(false);
  });

  it('sorts captures into kinds by extension', () => {
    expect(fileKind('/content/files/photo.png')).toBe('image');
    expect(fileKind('/content/files/recording.webm')).toBe('video');
    expect(fileKind('/content/files/tune.mp3')).toBe('audio');
    expect(fileKind('/content/files/notes.txt')).toBe('text');
    expect(fileKind('/content/files/data.bin')).toBe('other');
  });

  it('handles names without extensions', () => {
    expect(fileExt('/content/files/README')).toBe('');
    expect(fileKind('/content/files/README')).toBe('other');
    expect(fileName('/content/files/README')).toBe('README');
  });
});

describe('fileProblem', () => {
  it('rejects empty and oversized files', () => {
    expect(fileProblem({ name: 'a.html', size: 0 })).toMatch(/empty/i);
    expect(fileProblem({ name: 'big.html', size: 251 * 1024 * 1024 })).toMatch(/250 MB/i);
    expect(fileProblem({ name: 'ok.html', size: 1024 })).toBeNull();
  });
});

describe('stampName', () => {
  it('builds sortable photo and recording names', () => {
    expect(stampName('photo', 'png')).toMatch(/^photo-\d{8}-\d{6}\.png$/);
    expect(stampName('recording', 'webm')).toMatch(/^recording-\d{8}-\d{6}\.webm$/);
  });
});
