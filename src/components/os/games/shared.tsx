import type { ReactNode } from 'react';
import type { DuckcoinsApi } from '@/hooks/useDuckcoins';

export interface GameProps {
  onScore: (score: number) => void;
  coins?: DuckcoinsApi;
}

export function drawDuck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#f5c518';
  ctx.beginPath();
  ctx.ellipse(0, 2, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.55, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9500';
  ctx.beginPath();
  ctx.moveTo(r * 0.85, -r * 0.6);
  ctx.lineTo(r * 1.75, -r * 0.42);
  ctx.lineTo(r * 0.85, -r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#17203a';
  ctx.beginPath();
  ctx.arc(r * 0.5, -r * 0.72, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center backdrop-blur-[2px]">
      {children}
    </div>
  );
}
