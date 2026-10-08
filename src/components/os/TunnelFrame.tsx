import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RotateCw, Zap } from 'lucide-react';
import { hostOf, tunnelUrl } from '@/lib/os/browser';

/**
 * Renders any web page through the Scramjet tunnel: the page — and every
 * image, stylesheet and script it loads — is fetched by the tunnel server and
 * served from our own domain, so it renders even when the original site
 * refuses embedding or the network blocks it. Links inside the page stay on
 * the tunnel.
 */
export function TunnelFrame({
  url,
  title,
  sandbox,
}: {
  url: string;
  title?: string;
  sandbox?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    setLoaded(false);
  }, [url, seq]);

  const reload = () => setSeq((s) => s + 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#0b0e1a] px-3 py-1.5 text-[11px]">
        <Zap size={12} className="shrink-0 text-[var(--os-accent)]" />
        <span className="shrink-0 font-semibold text-white/80">Scramjet</span>
        <span className="min-w-0 flex-1 truncate text-white/40" title={url}>
          {hostOf(url)} · loaded through your tunnel · links stay inside
        </span>
        <button
          onClick={reload}
          aria-label="Reload through the tunnel"
          title="Reload through the tunnel"
          className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <RotateCw size={12} />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open direct in a new tab"
          title="Open direct in a new tab"
          className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0e1120] text-white/50">
            <Loader2 size={22} className="animate-spin text-[var(--os-accent)]" />
            <div className="text-sm">Riding the Scramjet tunnel…</div>
          </div>
        )}
        <iframe
          key={seq}
          src={tunnelUrl(url)}
          title={title ?? hostOf(url)}
          onLoad={() => {
            setLoaded(true);
            window.dispatchEvent(
              new CustomEvent('duck:tunnel-page', { detail: { host: hostOf(url) } }),
            );
          }}
          sandbox={sandbox ?? 'allow-scripts allow-forms allow-popups allow-pointer-lock allow-downloads'}
          allow="fullscreen; autoplay; gamepad; pointer-lock"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
