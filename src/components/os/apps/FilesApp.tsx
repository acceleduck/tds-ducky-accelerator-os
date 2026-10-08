import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music,
  Pencil,
  Play,
  RotateCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import content from '@/lib/shared/kliv-content.js';
import { FILES_DIR, fileName, fileKind, fileProblem, isRunnable } from '@/lib/os/files';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function KindIcon({ path, size = 18 }: { path: string; size?: number }) {
  const k = fileKind(path);
  const cls = 'text-white';
  if (k === 'html') return <Play size={size} className={cls} />;
  if (k === 'image') return <ImageIcon size={size} className={cls} />;
  if (k === 'audio') return <Music size={size} className={cls} />;
  if (k === 'video') return <Film size={size} className={cls} />;
  return <FileText size={size} className={cls} />;
}

function kindBg(path: string): string {
  const k = fileKind(path);
  if (k === 'html') return 'bg-gradient-to-br from-emerald-400 to-teal-600';
  if (k === 'image') return 'bg-gradient-to-br from-sky-400 to-indigo-600';
  if (k === 'audio') return 'bg-gradient-to-br from-fuchsia-400 to-purple-600';
  if (k === 'video') return 'bg-gradient-to-br from-rose-400 to-pink-600';
  return 'bg-gradient-to-br from-slate-400 to-slate-600';
}

/**
 * The OS file system. Upload anything from your device; HTML files (like a
 * single-file Eaglercraft build) can be run right here in a sandboxed runner —
 * handy on a Chromebook that won't open them. Photos and screen recordings from
 * Duck Cam land here too, and everything can be downloaded back out.
 */
export default function FilesApp() {
  const [files, setFiles] = useState<{ path: string; size: number }[]>([]);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);
  const [viewer, setViewer] = useState<{ path: string; name: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [compat, setCompat] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await content.listFiles(FILES_DIR);
      const sorted = [...res.files].sort((a, b) => a.path.localeCompare(b.path));
      setFiles(sorted);
    } catch {
      // keep whatever we had
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Free the blob preview when a text file viewer closes.
  useEffect(() => {
    if (!viewer) setTextPreview(null);
  }, [viewer]);

  useEffect(() => {
    if (!viewer || fileKind(viewer.path) !== 'text') return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(viewer.path);
        const text = (await res.text()).slice(0, 20_000);
        if (alive) setTextPreview(text);
      } catch {
        if (alive) setTextPreview('Could not read that file.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [viewer]);

  const onUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploading(true);
    let added = 0;
    for (const f of Array.from(list)) {
      const problem = fileProblem(f);
      if (problem) {
        toast.error(`${f.name}: ${problem}`);
        continue;
      }
      try {
        await content.uploadFile(f, FILES_DIR);
        added += 1;
      } catch {
        toast.error(`${f.name} didn't upload — try again`);
      }
    }
    if (added > 0) {
      toast.success(`Added ${added} file${added > 1 ? 's' : ''} to your pond`);
      await refresh();
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const commitRename = async () => {
    if (!renaming) return;
    const clean = renaming.name.trim().replace(/[/\\]/g, '');
    if (!clean || clean === fileName(renaming.path)) {
      setRenaming(null);
      return;
    }
    const dir = renaming.path.slice(0, renaming.path.lastIndexOf('/') + 1);
    try {
      await content.moveFile(renaming.path, `${dir}${clean}`);
      toast.success('Renamed');
      setRenaming(null);
      await refresh();
    } catch {
      toast.error('Rename failed — names must be unique');
    }
  };

  const remove = async (path: string) => {
    try {
      await content.deleteFile(path);
      toast('File deleted');
      if (viewer?.path === path) setViewer(null);
      await refresh();
    } catch {
      toast.error('Could not delete that file');
    }
  };

  /* ------------------------------------------------------------- runner view */

  if (viewer) {
    const k = fileKind(viewer.path);
    return (
      <div className="flex h-full flex-col bg-[#0a0e1c]">
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2">
          <button
            onClick={() => setViewer(null)}
            aria-label="Back to files"
            className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10"
          >
            <ArrowLeft size={15} />
          </button>
          <KindIcon path={viewer.path} size={14} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/85">{viewer.name}</span>
          {k === 'html' && (
            <>
              <button
                onClick={() => setReloadKey((n) => n + 1)}
                aria-label="Reload file"
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10"
              >
                <RotateCw size={14} />
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10">
                <input
                  type="checkbox"
                  checked={compat}
                  onChange={(e) => setCompat(e.target.checked)}
                  aria-label="Allow game saving"
                  className="accent-[var(--os-accent)]"
                />
                Allow saving
              </label>
            </>
          )}
          <a
            href={viewer.path}
            target="_blank"
            rel="noreferrer"
            aria-label="Open file in a new tab"
            className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10"
          >
            <ExternalLink size={14} />
          </a>
        </div>
        <div className="min-h-0 flex-1">
          {k === 'html' && (
            <iframe
              key={reloadKey}
              title="file-runner"
              data-testid="file-runner"
              src={viewer.path}
              sandbox={
                compat
                  ? 'allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-popups allow-downloads allow-modals'
                  : 'allow-scripts allow-pointer-lock allow-forms allow-popups allow-downloads allow-modals'
              }
              className="h-full w-full border-0 bg-white"
            />
          )}
          {k === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={viewer.path} alt={viewer.name} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {k === 'video' && (
            <div className="flex h-full items-center justify-center p-4">
              <video src={viewer.path} controls className="max-h-full max-w-full" />
            </div>
          )}
          {k === 'audio' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
              <Music size={40} className="text-white/30" />
              <audio src={viewer.path} controls />
            </div>
          )}
          {k === 'text' && (
            <pre className="h-full overflow-auto whitespace-pre-wrap p-4 text-xs text-white/70">
              {textPreview ?? 'Loading…'}
            </pre>
          )}
          {k === 'other' && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
              <FileText size={40} className="text-white/25" />
              <div className="text-sm text-white/60">This file type can't open inside the OS.</div>
              <a
                href={viewer.path}
                download={viewer.name}
                className="rounded-xl bg-[var(--os-accent)] px-4 py-2 text-xs font-semibold text-[#17131f]"
              >
                Download instead
              </a>
            </div>
          )}
        </div>
        {k === 'html' && (
          <div className="border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-white/35">
            Running in a sandbox inside AcceleDuck. Turn on “Allow saving” only for games you trust — it
            lets the file keep local saves.
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------------- files view */

  const shown = files.filter((f) =>
    fileName(f.path).toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
          <FolderOpen size={15} className="text-[var(--os-accent)]" /> My files
        </div>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50">
          /content/{FILES_DIR}
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter files"
          placeholder="Filter…"
          className="ml-auto w-36 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-[var(--os-accent)] focus:outline-none"
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => void onUpload(e.target.files)}
          aria-label="Upload files"
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--os-accent)] px-3.5 py-1.5 text-xs font-semibold text-[#17131f] transition hover:brightness-110 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!ready ? (
          <div className="flex h-full items-center justify-center text-white/40">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <FolderOpen size={34} className="mx-auto text-white/25" />
            <div className="mt-3 text-sm font-semibold text-white/85">Your pond storage is empty</div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              Got a single-file game (like an Eaglercraft build) your Chromebook won't open? Upload it
              here and press <span className="text-white/70">Run</span> — it plays inside AcceleDuck
              through the proxy. Photos and screen recordings from Duck Cam save here too, and anything
              here can be downloaded back out.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((f) => {
              const name = fileName(f.path);
              const runnable = isRunnable(f.path);
              return (
                <div
                  key={f.path}
                  data-testid="file-card"
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/25"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kindBg(f.path)}`}
                    >
                      <KindIcon path={f.path} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      {renaming?.path === f.path ? (
                        <input
                          autoFocus
                          value={renaming.name}
                          onChange={(e) => setRenaming({ path: f.path, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                          aria-label="New file name"
                          className="w-full rounded-lg border border-[var(--os-accent)] bg-white/5 px-2 py-1 text-xs text-white focus:outline-none"
                        />
                      ) : (
                        <div className="truncate text-xs font-medium text-white/85" title={name}>
                          {name}
                        </div>
                      )}
                      <div className="text-[10px] text-white/35">{fmtBytes(f.size)}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {renaming?.path === f.path ? (
                      <button
                        onClick={() => void commitRename()}
                        className="rounded-lg bg-[var(--os-accent)] px-2.5 py-1 text-[11px] font-semibold text-[#17131f]"
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        onClick={() => setViewer({ path: f.path, name })}
                        aria-label={runnable ? `Run ${name}` : `Open ${name}`}
                        data-testid={runnable ? 'run-file' : 'open-file'}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          runnable
                            ? 'bg-[var(--os-accent)] text-[#17131f] hover:brightness-110'
                            : 'bg-white/10 text-white/75 hover:bg-white/15'
                        }`}
                      >
                        {runnable ? <Play size={11} /> : null}
                        {runnable ? 'Run' : 'Open'}
                      </button>
                    )}
                    <a
                      href={f.path}
                      download={name}
                      aria-label={`Download ${name}`}
                      className="rounded-lg bg-white/[0.06] p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                    >
                      <Download size={11} />
                    </a>
                    {renaming?.path !== f.path && (
                      <>
                        <button
                          onClick={() => setRenaming({ path: f.path, name })}
                          aria-label={`Rename ${name}`}
                          className="rounded-lg bg-white/[0.06] p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => void remove(f.path)}
                          aria-label={`Delete ${name}`}
                          className="rounded-lg bg-white/[0.06] p-1.5 text-white/50 transition hover:bg-red-500/20 hover:text-red-300"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.07] px-4 py-2 text-[10px] text-white/35">
        {files.length} file{files.length === 1 ? '' : 's'} · up to 250 MB each · Runs are sandboxed
      </div>
    </div>
  );
}
