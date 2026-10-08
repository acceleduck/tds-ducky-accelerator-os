import { useEffect } from 'react';
import { DuckLogo } from './DuckLogo';

export function BootScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2100);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-9 bg-[#07090f]">
      <div className="boot-pulse">
        <DuckLogo size={96} />
      </div>
      <div className="text-center">
        <div className="text-2xl font-semibold tracking-wide text-white/90">AcceleDuck OS</div>
        <div className="mt-1.5 text-sm text-white/40">TDS Ducky Accelerator</div>
      </div>
      <div className="boot-spinner" aria-label="Booting" />
      <div className="absolute bottom-8 text-xs text-white/25">Ducky Labs · build 2026.10</div>
    </div>
  );
}
