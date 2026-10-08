/** Everything in the OS file system lives under /content/files/. */
export const FILES_DIR = 'files';
export const MAX_FILE_BYTES = 250 * 1024 * 1024;

export type FileKind = 'html' | 'image' | 'audio' | 'video' | 'text' | 'other';

export function fileName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function fileExt(path: string): string {
  const n = fileName(path);
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i + 1).toLowerCase() : '';
}

export function fileKind(path: string): FileKind {
  const e = fileExt(path);
  if (e === 'html' || e === 'htm') return 'html';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'image';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(e)) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(e)) return 'video';
  if (['txt', 'md', 'json', 'js', 'ts', 'css', 'csv', 'xml'].includes(e)) return 'text';
  return 'other';
}

/** HTML files can run inside the OS — like a single-file Eaglercraft game. */
export function isRunnable(path: string): boolean {
  return fileKind(path) === 'html';
}

export function fileProblem(file: { name: string; size: number }): string | null {
  if (file.size <= 0) return 'That file looks empty.';
  if (file.size > MAX_FILE_BYTES) return 'Files can be at most 250 MB here.';
  return null;
}

/** A sortable name for captures: photo-20261008-142530.png */
export function stampName(prefix: 'photo' | 'recording', ext: 'png' | 'webm'): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
