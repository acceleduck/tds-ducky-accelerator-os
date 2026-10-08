export type RingtoneId = 'quack' | 'bell' | 'ripple' | 'disco';

export const RINGTONES: { id: RingtoneId; name: string }[] = [
  { id: 'quack', name: 'Quack Beat' },
  { id: 'bell', name: 'Pond Bell' },
  { id: 'ripple', name: 'Ripple' },
  { id: 'disco', name: 'Disco Ducky' },
];

export const DEFAULT_RINGTONE: RingtoneId = 'quack';

export type StopRingtone = () => void;

function tone(
  ctx: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType = 'square',
  gain = 0.08,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + at);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + at);
  osc.stop(ctx.currentTime + at + dur + 0.05);
}

/**
 * Play a ringtone from the saved setting: a preset id or 'custom:<file url>'.
 * Returns a stop function. Browsers may refuse audio before a click — that
 * failure is swallowed and the ring just stays silent.
 */
export function playRingtone(setting: string | undefined, loop = true): StopRingtone {
  const value = (setting ?? '').trim();

  if (value.startsWith('custom:')) {
    const url = value.slice('custom:'.length);
    if (!url) return () => {};
    const audio = new Audio(url);
    audio.loop = loop;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }

  const id = RINGTONES.find((r) => r.id === value)?.id ?? DEFAULT_RINGTONE;
  let ctx: AudioContext | null = null;
  let timer = 0;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return () => {};
    ctx = new Ctor();
    void ctx.resume().catch(() => {});

    const pattern = () => {
      if (!ctx) return;
      if (id === 'quack') {
        tone(ctx, 620, 0, 0.09);
        tone(ctx, 480, 0.12, 0.1);
      } else if (id === 'bell') {
        tone(ctx, 880, 0, 0.35, 'sine', 0.12);
        tone(ctx, 1318, 0.02, 0.3, 'sine', 0.07);
      } else if (id === 'ripple') {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(320, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);
        g.gain.setValueAtTime(0.1, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.5);
      } else {
        tone(ctx, 523, 0, 0.12);
        tone(ctx, 659, 0.14, 0.12);
        tone(ctx, 784, 0.28, 0.12);
        tone(ctx, 1046, 0.42, 0.2);
      }
    };

    pattern();
    if (loop) timer = window.setInterval(pattern, 1600);
    return () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
      void ctx?.close().catch(() => {});
      ctx = null;
    };
  } catch {
    return () => {};
  }
}
